const fs = require('node:fs');
const path = require('node:path');
const ANSI = require('../lib/ansi.js');
const Events = require('../events.js');
const Session = require('./session.js');
const SessionManager = require('./session-manager.js');
const Context = require('./context.js');
const Toolbox = require('./toolbox.js');
const Timers = require('./timers.js');
const Hooks = require('./hooks.js');
const Skills = require('../lib/skills.js');
const Config = require('../core/config.js');
const Commands = require('./commands.js');

const { Logger, formatMs } = require('../util.js');

const ReadTool = require('../tools/read.js');
const EditTool = require('../tools/edit.js');
const LsTool = require('../tools/ls.js');
const GrepTool = require('../tools/grep.js');
const BashTool = require('../tools/bash.js');
const MemoryTool = require('../tools/memory.js');
const ActivateSkillTool = require('../tools/activate-skill.js');
const Agent = require('../lib/agent.js');

class Harness {
  static TOOL_TIMEOUT = 15 * 1000;

  // Lifetime counts
  #inputTokens = 0;
  #outputTokens = 0;
  #timers = new Timers();
  #toolStats = new Map();
 
  
 session = null;
  toolbox = null;
  skills = null;
  config = null;
  
  commands = [];

  #activeContext = null;
  #abortController = new AbortController();
  
  get inputTokens() { return this.#inputTokens; }
  get outputTokens() { return this.#outputTokens; }
  get context() { return this.#activeContext; }
  set context(ctx) { this.#activeContext = ctx; }
  get modelResponded() { return this.agent?.modelResponded ?? false; }
  get toolStats() { return this.#toolStats; }
  get canAbort() { return this.#abortController !== null; }

  constructor(props) {
    Events.on('user:message', (event) => this.onUserMessage(event));
    Events.on('user:abort', (event) => this.onUserAbort(event));
    Object.assign(this, props);
    
    this.sessionManager = new SessionManager();
    this.hooks = new Hooks({ hooks: ['tool-call'] });
    
    this.toolbox = new Toolbox(this, [
      new ReadTool(this),
      new EditTool(this),
      new LsTool(this),
      new GrepTool(this),
      new BashTool(this),
      new MemoryTool({
        ...this.session,
        config: this.config
      }),
      new ActivateSkillTool({
        skills: this.skills
      })
    ]);
    this.session = new Session({
      tools: this.toolbox.all(),
      ...(props && props.session || null)
    });
    
    // Active context starts as a reference to session's context
    this.#activeContext = this.session.context.clone();
    
    // Compact callback: Harness owns the layers, Agent calls this mid-turn
    const compact = async (ctx) => {
      return await this.#activeContext.fork({
      //return await ctx.fork({
        layers: [
          //'system_prompt',
          'tool_age',
          'tool_error',
          'tool_length',
          'tool_total',
          'chat_score',
          'model_reasoning'
        ],
        summarize: async (transcript) => this.summarize(transcript)
      });
    };
    
    // Agent instance — forks from our active context per-turn
    this.agent = new Agent({
      context: this.#activeContext,
      compact: compact,
      tools: this.toolbox.all(),
      onTokens: ({ inputTokens, outputTokens }) => {
        this.#inputTokens += inputTokens || 0;
        this.#outputTokens += outputTokens || 0;
        Events.emit('metrics:tokens', {
          inputTokens: this.#inputTokens,
          outputTokens: this.#outputTokens
        });
      },
      callbacks: {
        onToolCalls: async (toolCalls) => {
          // Execute all tool calls via Harness's handleToolCalls
          return await this.handleToolCalls(toolCalls);
        },
        onModelContent: (content) => Events.emit('model:content', { content }),
        onTurnEnd: (aborted) => {
          Events.emit('turn:user', aborted ? { interrupted: true } : {});
          this.sessionManager.saveSession(this.session);
        }
      },
      config: this.config,
      abortController: null
    });
    
    // Register hook handler to add messages to session context
    this.agent.hooks.on('message', (message) => {
      this.#activeContext.add(message);

      // Skip messages with falsy content
      if (!message || !message.content || (typeof message.content === 'string' && !message.content.trim())) {
        return;
      }
      // Add to session context
      this.session.context.add(message);
    });
    
    // Build commands from skills
    this.buildCommands();
    
    this.session.ensureTempDir().then(_ => {
      Events.emit('harness:ready');
    });
  }
  
  buildCommands() {
    // Core commands
    /*
    this.commands.push({
      name: 'quit', handler: async () => { Events.emit('program:quit'); }, silent: true
    });
    */
    Commands.forEach(cmd => {
      let command = { ...cmd };
      this.commands.push(command);
    });
   
    this.commands.push({ name: 'recap', handler: async () => this.recap() });
    this.commands.push({
      name: 'config',
      arguments: [{ name: 'key' }, { name: 'value', optional: true }],
      handler: async (harness, args) => harness.configCommand(args)
    });
    
    // Add skill commands
    if (this.skills && this.skills.names.length) {
      this.skills.names.forEach(skillName => {
        let baseName = skillName;
        let existing = this.commands.map(c => c.name);
        // Find the first available name: baseName, baseName-skill, baseName-skill-skill, ...
        let suffixCount = 0;
        let cmdName = baseName;
        while (existing.includes(cmdName)) {
          suffixCount++;
          cmdName = baseName + '-skill'.repeat(suffixCount);
        }
        if (cmdName !== baseName) {
          this.emitCommandMessage(`Skill "${skillName}" conflicts — registered as "${cmdName}"`);
        }
        this.commands.push({
          name: cmdName,
          handler: async (harness, args) => harness.handleSkill(skillName, args),
          hint: this.skills.get(skillName).description
        });
      });
    }
  }
  
  getCommands() {
    return this.commands.map((c) => ({
      name: c.name,
      arguments: c.arguments,
      hint: c.hint
    }));
  }
  
  getCommand(name) {
    return this.commands.find(c => c.name === name);
  }
  
  #currentCommandId = null;

  emitCommandMessage(content) {
    if (this.#currentCommandId) {
      Events.emit('command:run', { id: this.#currentCommandId, content });
    } else {
      Events.emit('command:run', { name: null, content });
    }
  }

  async command(name, args) {
    let cmd = this.commands.find(c => c.name === name);
    if (!cmd) {
      Events.emit('command:run', { name, content: `Unknown command "${name}".` });
      return null;
    }
    
    if (!cmd.silent) {
      const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      this.#currentCommandId = cmdId;
      Events.emit('command:start', { id: cmdId, name });
      try {
        await cmd.handler(this, args);
      } finally {
        this.#currentCommandId = null;
        Events.emit('command:done', { id: cmdId });
      }
    } else {
      await cmd.handler(this, args);
    }
    
    return cmd;
  }
  
  // Command handlers
  async recap() {
    // Not enough user activity to summarize
    if (this.#userMessagesSinceRecap < 2) return;
    
    // Filter to only 'user' and 'assistant' role messages with content
    const filteredMessages = this.session.context.messages.filter(
      m => (m.role === 'user' || m.role === 'assistant') && m.content?.length > 0
    );
    
    // Get the most-recent filtered messages (only if we have enough user messages)
    const recentMessages = filteredMessages.slice(-Math.max(0, this.#userMessagesSinceRecap * 2));
    
    // Not enough messages to be worth summarizing
    if (recentMessages.length < 4) return;
    
    // Not enough content to summarize
    const contentMessages = recentMessages.filter(m => m.content?.length > 0);
    if (contentMessages.length < 4) return;
    
    Logger.log(`Harness: recapping ${contentMessages.length} messages.`);
    
    let transcript = Context.transcript(contentMessages);
    
    Logger.log(`Harness: transcript length = ${transcript.length}, content: ${JSON.stringify(transcript)}`);
    
    // Use on-demand Agent for networking
    let summaryContext = new Context({
      config: this.config,
      system_prompt: `You are an assistant that's been interacting with a user. From your perspective, using terms like "we" and "I," summarize this transcript into a 1-sentence recap. Focus on the high-level intent and what changed conceptually — not specific files, commands, or literal actions. Abstract away implementation details and capture the purpose of what was done.`
    });
    let summaryAgent = new Agent({
      context: summaryContext,
      config: this.config,
      abortController: null
    });
    
    let summaryResponse = await summaryAgent.startTurn(transcript, null);
    
    if (!summaryResponse || !summaryResponse.message
        || !summaryResponse.message.content
        || !summaryResponse.message.content.length) {
      Logger.log(`Harness: no recap summary.`);
      return;
    }
    let summaryContent = summaryResponse.message.content,
        content = `🕮  ${summaryContent}`;
    this.#userMessagesSinceRecap = 0;
    
    Logger.log(`Harness: recap = ${content}`);
    Logger.log(`Harness: summaryContext.messages = ${JSON.stringify(summaryContext.messages)}`);
    
    Events.emit('recap:message', {
      done: true,
      content: content
    });
  }
  
  #userMessagesSinceRecap = 0;

  #updateToolStats(name, success) {
    let stat = this.#toolStats.get(name);
    if (!stat) {
      stat = { calls: 0, errors: 0, successes: 0 };
      this.#toolStats.set(name, stat);
    }
    stat.calls++;
    if (success) stat.successes++;
    else stat.errors++;
  }

  #logTurnStats() {
    if (this.#toolStats.size === 0) return;
    let totalCalls = 0, totalErrors = 0, totalSuccesses = 0;
    let lines = [];
    for (const [name, stat] of this.#toolStats) {
      totalCalls += stat.calls;
      totalErrors += stat.errors;
      totalSuccesses += stat.successes;
      let okPct = stat.calls > 0 ? Math.round((stat.successes / stat.calls) * 100) : 0;
      lines.push(`  ${name}: ${stat.calls} calls, ${stat.successes} ok (${okPct}%), ${stat.errors} errors`);
    }
    let totalPct = totalCalls > 0 ? Math.round((totalSuccesses / totalCalls) * 100) : 0;
    lines.unshift(`Turn stats: ${totalCalls} tool calls — ${totalSuccesses} ok (${totalPct}%), ${totalErrors} errors`);
    Logger.log(lines.join('\n'));
    // Reset for next turn
    this.#toolStats.clear();
  }

  async summarize(transcript) {
    let summaryContext = new Context({
      config: this.config,
      system_prompt: `Please summarize the following conversation history. Preserve all essential context, logic, decisions, and conclusions in a concise form. Output only the summary — no preamble, no extra text.`,
      messages: []
    });
    
    let agent = new Agent({
      context: summaryContext,
      config: this.config,
      abortController: null
    });
    
    let result = await agent.startTurn(transcript, null);
    return result.content;
  }

  async compact() {
    Events.emit('status:spinner', { message: 'Compacting...' });
    
    const oldEst = this.#activeContext.estimates;
    const oldTok = oldEst.system_prompt + oldEst.messages + oldEst.reserved;

    const newContext = await this.#activeContext.fork({
      layers: ['tool_age', 'tool_error', 'tool_length', 'tool_total', 'chat_score', 'model_reasoning'],
      summarize: async (transcript) => this.summarize(transcript)
    });

    this.#activeContext = newContext;
    this.context = newContext;

    const newEst = newContext.estimates;
    const newTok = newEst.system_prompt + newEst.messages + newEst.reserved;
    const deltaTok = (newTok - oldTok || 0).toFixed(0);
    const pct = (100 * newTok / newEst.context_window).toFixed(0);

    Events.emit('status:spinner', { hide: true });
    this.emitCommandMessage(`Context compacted: ${deltaTok} → ${newTok} (now ${pct}%).`);
    Events.emit('metrics:tokens', {});
  }

  async configCommand(argstr) {
    if (!argstr || !argstr.length) {
      this.emitCommandMessage('Usage: /config <key> [value]');
      return;
    }
    let parts = argstr.trim().split(/\s+/);
    let key = parts[0];
    let value = parts.slice(1).join(' ');
    
    if (value === '') {
      let cur = this.config.get(key);
      this.emitCommandMessage(`${key} = ${cur ?? '(not set)'}`);
    } else {
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(value) && value.length > 0) value = parseInt(value, 10);
      
      this.config.set(key, value);
      this.emitCommandMessage(`Set ${key} = ${this.config.get(key)}`);
    }
  }

  async handleSkill(skillName, args) {
    const skill = this.skills.get(skillName);
    if (!skill) {
      this.emitCommandMessage(`Skill "${skillName}" not found.`);
      return;
    }
    
    // Add the command message to chat history
    Events.emit('model:content', {
      done: true,
      content: ` /${skillName} `
    });
    
    // Build skill prompt (include marker so it appears in chat)
    const argsStr = args && Object.keys(args).length ? `\n\nUser Args: ${JSON.stringify(args)}` : '';
    const skillPrompt = `/[Skill: ${skillName}]\nExecute this skill:\n${skill.content}${argsStr}`;
    
    // Show spinner while skill runs
    Events.emit('status:spinner', { message: `Running ${skillName}...` });
    
    // Trigger normal model turn by emitting user:message event.
    // onUserMessage will add to context, fork, and send — piggybacking on the active session.
    Events.emit('user:message', { message: skillPrompt });
    
    // Spinner is hidden when the turn goes back to the user
    const hideSpinner = () => {
      Events.off('turn:user', hideSpinner);
      Events.emit('status:spinner', { hide: true });
    };
    Events.on('turn:user', hideSpinner);
  }
  
 

  async dispose() {
    this.#timers.clearAll();
    await this.session.removeTempDir();
  }
  
  async onUserMessage(event) {
    // TODO: turns, right now the user can just send stuff whenever
    let message = { role: 'user', content: event.message };
    //this.session.abort();
    this.#userMessagesSinceRecap++;

    // Create fresh abort controller for this turn
    const turnController = new AbortController();
    this.#abortController = turnController;
    
    // Fork from our own active context and apply compaction layers
    let ctx = await this.#activeContext.fork({
      layers: [
          //'system_prompt',
          'tool_age',
          'tool_error',
          'tool_length',
          'tool_total',
          'chat_score',
          'model_reasoning'
        ],
      summarize: async (transcript) => this.summarize(transcript)
    });
    //this.#activeContext.add(message);
    
    // Pass active context to Agent
    let response = await this.agent.startTurn(event.message, turnController, ctx);
    this.#logTurnStats();
    if (response.aborted) {
      const elapsed = formatMs(response.duration);
      Events.emit('model:content', { done: true, content: ANSI.fg(`Interrupted after ${elapsed}`, 160) });
      return;
    }
  }
  
  onUserAbort(event) {
    this.#abortController.abort();
  }
  
  async runToolCall(call) {
    let id = call.id;
    let name = call.function.name;
    let args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function.arguments;
    let temppath = this.session.tempdir;
    
    return new Promise(async (resolve) => {
      let resolved = false;
      let onResponse = (evt) => {
        if (evt.id === id && !resolved) {
          resolved = true;
          Events.off('tool:response', onResponse);
          resolve(evt);
        }
      };
      Events.on('tool:response', onResponse);

      try {
        Events.emit('tool:call', { id, name, args, temppath });
      } catch (err) {
        Logger.log(`tool:call event error: ${err.message}`);
      }

      this.#timers.start(`tool:${id}`, Harness.TOOL_TIMEOUT, () => {
        Events.off('tool:response', onResponse);
        if (!resolved) {
          resolved = true;
          resolve({ id, name, content: `Error: tool ${name} timed out` });
        }
      });
    }).catch(async () => {
      return { id, name, content: `Error: tool ${name} timed out` };
    });
  }
  
  async handleToolCallWithHook(call) {
    let id = call.id;
    let name = call.function.name;
    
    return new Promise(async (resolve) => {
      let resolved = false;
      let onResponse = (evt) => {
        if (evt.id === id && !resolved) {
          resolved = true;
          Events.off('tool:response', onResponse);
          resolve(evt);
        }
      };
      Events.on('tool:response', onResponse);

      try {
        let cancelled = false;
        let cancelError = null;
        let overrideResponse = null;
        
        const results = await this.hooks.emitWithResultsAsync('tool-call', { toolCall: call });
        for (const result of results) {
          if (!result) continue;
          overrideResponse = result.response || null;
          if (result.cancelled) {
            cancelled = true;
            cancelError = result.error || null;
            break;
          }
        }

        if (cancelled) {
          Logger.log(`tool-call hook cancelled: ${cancelError?.message || cancelError}`);
          let content = cancelError?.message || cancelError
            || (overrideResponse && (typeof overrideResponse === 'string'
                ? overrideResponse
                : JSON.stringify(overrideResponse)));
          Events.emit('tool:response', {
            id,
            name,
            content: content || 'Error: tool call cancelled'
          });
        } else if (overrideResponse !== null) {
          Events.emit('tool:response', {
            id,
            name,
            content: overrideResponse
          });
        } else {
          let parsedArgs = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function.arguments;
          Events.emit('tool:call', { id, name, args: parsedArgs, temppath: this.session.tempdir });
        }
      } catch (err) {
        Logger.log(`tool-call hook error: ${err.message}`);
        Events.emit('tool:response', {
          id,
          name,
          content: `Error: ${err.message}`
        });
      }

      this.#timers.start(`tool:${id}`, Harness.TOOL_TIMEOUT, () => {
        Events.off('tool:response', onResponse);
        if (!resolved) {
          resolved = true;
          resolve({ id, name, content: `Error: tool ${name} timed out` });
        }
      });
    }).catch(async () => {
      return { id, name, content: `Error: tool ${name} timed out` };
    });
  }
  
  /**
   * Handle tool calls from model response.
   * @param {Array} tool_calls - List of tool calls from model
   * @returns {Promise<Array>} Tool results
   */
  async handleToolCalls(tool_calls) {
    await this.session.ensureTempDir();
    
    // Split tool calls into auto-run (approved) and pending (need user approval)
    let autoRun = [];
    
    for (let call of tool_calls) {
      let tool = this.toolbox.get(call.function.name);
      let perms;
      try {
        perms = tool?.permissions(call.function.arguments);
      } catch (err) {
        Logger.log(`tool permissions error (${call.function.name}): ${err.message}`);
      }
      
      // Skip calls without permission requirements (or if permissions check failed)
      if (!perms || !perms.scope) {
        autoRun.push({ call, skipPermsCheck: true });
      } else {
        // Check if already auto-approved
        let scopes = [perms.scope, ...(perms.parents || [])];
        let approved;
        try {
          approved = scopes.some(s => this.permissions?.check(tool.name, s).allowed === true);
        } catch (err) {
          Logger.log(`permission check error (${call.function.name}): ${err.message}`);
          approved = false;
        }
        if (approved) {
          autoRun.push({ call, approved });
        }
        // If not approved, skip adding to autoRun and let it fall through to the pending phase
      }
    }
    
    let results = [];
    let eventsById = {};
    
    // Run auto-approved tools in parallel
    if (autoRun.length) {
      let autoPromises = autoRun.map(async ({ call, skipPermsCheck, approved }) => {
        let callResult;
        if (skipPermsCheck) {
          callResult = await this.handleToolCallWithHook(call);
        } else if (approved) {
          callResult = await this.runToolCall(call);
        } else {
          callResult = await this.handleToolCallWithHook(call);
        }
        
        results.push(callResult);
        eventsById[call.id] ||= [];
        eventsById[call.id].push({
          id: call.id,
          name: call.function.name,
          args: call.function.arguments,
          temppath: this.session.tempdir
        });
        this.#updateToolStats(call.function.name, callResult.content && !callResult.content.startsWith('Error'));
      });
      await Promise.all(autoPromises);
    }
    
    // Run pending tools sequentially (one permission prompt at a time)
    for (let call of tool_calls) {
      if (this.#abortController?.signal.aborted) break;
      let tool = this.toolbox.get(call.function.name);
      let perms;
      try {
        perms = tool?.permissions(call.function.arguments);
      } catch (err) {
        Logger.log(`tool permissions error (${call.function.name}): ${err.message}`);
      }
      
      // Skip if already processed in auto-run
      if (eventsById[call.id]) continue;
      
      // Skip calls without permission requirements (or if permissions check failed)
      if (!perms || !perms.scope) {
        let callResult = await this.handleToolCallWithHook(call);
        results.push(callResult);
        eventsById[call.id] ||= [];
        eventsById[call.id].push({
          id: call.id,
          name: call.function.name,
          args: call.function.arguments,
          temppath: this.session.tempdir
        });
        this.#updateToolStats(call.function.name, callResult.content && !callResult.content.startsWith('Error'));
        continue;
      }
      
      // Check if already auto-approved
      let scopes = [perms.scope, ...(perms.parents || [])];
      let approved;
      try {
        approved = scopes.some(s => this.permissions?.check(tool.name, s).allowed === true);
      } catch (err) {
        Logger.log(`permission check error (${call.function.name}): ${err.message}`);
        approved = false;
      }
      
      if (approved) {
        let callResult = await this.runToolCall(call);
        results.push(callResult);
        eventsById[call.id] ||= [];
        eventsById[call.id].push({
          id: call.id,
          name: call.function.name,
          args: call.function.arguments,
          temppath: this.session.tempdir
        });
        this.#updateToolStats(call.function.name, callResult.content && !callResult.content.startsWith('Error'));
        continue;
      }
      
      // Needs user approval — fire hook (will prompt user)
      let callResult = await this.handleToolCallWithHook(call);
      results.push(callResult);
      eventsById[call.id] ||= [];
      eventsById[call.id].push({
        id: call.id,
        name: call.function.name,
        args: call.function.arguments,
        temppath: this.session.tempdir
      });
      this.#updateToolStats(call.function.name, callResult.content && !callResult.content.startsWith('Error'));
    }
    
    results.forEach(msg => {
      msg.role = 'tool';
      msg.tool_name = msg.name;
      delete msg.name;
    });
    return results;
  }
  
  estimateHistoryTokens() {
    return this.session.history.reduce((m, entry) => {
      if (entry.content) {
        m += Context.estimate(`${entry.role}: ${entry.content}`);
      }
      if (entry.tool_calls) {
        m += Context.estimate(JSON.stringify(entry.tool_calls));
      }
      return m
    }, 0);
  }
}

module.exports = Harness;
