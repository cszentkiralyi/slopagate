const fs = require('node:fs');
const path = require('node:path');
const fsSync = require('node:fs');
const sea = require('node:sea');
const ANSI = require('../lib/ansi.js');
const Events = require('../events.js');
const Session = require('./session.js');
const SessionManager = require('./session-manager.js');
const Context = require('./context.js');
const Toolbox = require('./toolbox.js');
const Timers = require('./timers.js');
const Hooks = require('./hooks.js');  // global singleton
const Skills = require('../lib/skills.js');
const Config = require('../core/config.js');
const Commands = require('./commands.js');

const { Logger, formatMs, truncate } = require('../util.js');
const { Hash } = require('../lib/hash.js');

const ReadTool = require('../tools/read.js');
const EditTool = require('../tools/edit.js');
const LsTool = require('../tools/ls.js');
const GrepTool = require('../tools/grep.js');
const BashTool = require('../tools/bash.js');
const MemoryTool = require('../tools/memory.js');
const ActivateSkillTool = require('../tools/activate-skill.js');
const TodoTool = require('../tools/todo.js');
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
  #dedupCalls = [];  // Per-turn: {toolName, normalized, timestamp}
  #dedupThreshold = 0.8;
  #pendingNudges = new Set();  // Deduped set of pending nudge messages
  #pendingAmbientReminders = new Set();  // Deduped set of pending ambient reminder messages
  
  get inputTokens() { return this.#inputTokens; }
  
  /**
   * Register a nudge message. Tools call this during execution.
   * Nudges are amalgamated into one user message per iteration.
   * @param {string} message - The nudge text
   */
  nudge(message) {
    this.#pendingNudges.add(message);
  }
  
  /**
   * Register an ambient reminder message. Tools call this during execution.
   * Ambient reminders are amalgamated into one user message per submission,
   * and added before the user's actual message.
   * @param {string} message - The ambient reminder text
   */
  ambientReminder(message) {
    this.#pendingAmbientReminders.add(message);
  }
  
  /**
   * Amalgamate pending ambient reminders into a single user message
   * and add to both #activeContext and session.context.
   */
  #processAmbientReminders() {
    if (this.#pendingAmbientReminders.size === 0) return;
    
    const amalgamated = Array.from(this.#pendingAmbientReminders).join('\n\n---\n\n');
    const ambientMessage = { role: 'user', content: amalgamated, ephemeral: true };
    
    // Add to active context (so the fork includes it)
    this.#activeContext.add(ambientMessage);
    
    // Add to session context
    this.session.context.add(ambientMessage);
    
    // Clear pending queue
    this.#pendingAmbientReminders.clear();
  }
  
  /**
   * Check for similar tool calls this turn (dedup/loop detection)
   * @param {string} toolName 
   * @param {object} args 
   * @param {string} callId 
   * @returns {object|null} Match info or null
   */
  checkDedup(toolName, args, callId) {
    const tool = this.toolbox.get(toolName);
    if (!tool) return null;
    
    let normalized;
    try {
      normalized = tool.normalize(args);
      if (!normalized) return null;  // Tool opted out of dedup
    } catch (e) {
      Logger.log(`Dedup error: ${e.message}`);
      return null;
    }
    
    const now = Date.now();
    const textA = normalized.join(' ');
    
    const category = textA.length <= 200 ? 'trigram' : 'minhash';
    Logger.log(`[dedup] Checking ${toolName} call ${callId}, total previous calls: ${this.#dedupCalls.length}, text length: ${textA.length} (${category})`);
    
    // Look up candidates from history
    const candidates = new Map();  // id -> {id, timestamp, normalized, signature}
    for (const entry of this.#dedupCalls) {
      if (entry.toolName === toolName) {
        candidates.set(entry.id, entry);
      }
    }
    
    if (candidates.size === 0) {
      Logger.log(`[dedup] No history for ${toolName}, no candidates`);
    } else {
      Logger.log(`[dedup] Found ${candidates.size} unique candidates to compare`);
    }
    
    // Cache representation once for the current call
    let cacheA = null;
    try {
      cacheA = Hash.cache(textA);
    } catch (e) {
      Logger.log(`Dedup cache error: ${e.message}`);
    }
    
    // Compare each candidate
    let bestMatch = null;
    let bestScore = 0;
    let comparedCount = 0;
    
    for (const [id, candidate] of candidates.entries()) {
      let score;
      try {
        // Only compare same-type caches (short↔short or long↔long)
        if (cacheA && candidate.cache && cacheA.type === candidate.cache.type) {
          score = Hash.cachedSimilarity(cacheA, candidate.cache);
        } else {
          // Different types or missing cache — skip
          continue;
        }
        comparedCount++;
      } catch (e) {
        Logger.log(`Dedup compare error: ${e.message}`);
        continue;
      }
      
      if (score > this.#dedupThreshold) {
        bestMatch = { ...candidate, score };
        bestScore = score;
      }
    }
    
    if (comparedCount > 0) {
      Logger.log(`[dedup] Compared ${comparedCount} candidates, best score: ${bestScore.toFixed(3)} (threshold: ${this.#dedupThreshold})`);
    }
    
    // Store this call with its cached representation
    this.#dedupCalls.push({ toolName, normalized, cache: cacheA, timestamp: now });
    
    return bestMatch;
  }
  
  /**
   * Reset dedup tracking for new turn
   */
  resetDedup() {
    this.#dedupCalls = [];
  }
  get outputTokens() { return this.#outputTokens; }
  get context() { return this.#activeContext; }
  set context(ctx) { this.#activeContext = ctx; }
  get modelResponded() { return this.agent?.modelResponded ?? false; }
  get toolStats() { return this.#toolStats; }
  get canAbort() { return this.#abortController !== null; }

  constructor(props) {
    Events.on('user:message', (event) => this.onUserMessage(event));
    Events.on('user:abort', (event) => this.onUserAbort(event));
    
    // Capture promptDoc for reuse in clear() before Object.assign overwrites it
    const sessionProps = props?.session;
    if (sessionProps?.promptDoc) {
      this.promptDoc = sessionProps.promptDoc;
    }
    
    Object.assign(this, props);

    this.sessionManager = new SessionManager();
    // No own hooks instance — uses global Hooks singleton
    
    const tools = [
      new ReadTool({ harness: this }),
      new EditTool({ harness: this }),
      new LsTool({ harness: this }),
      new GrepTool({ harness: this }),
      new BashTool({ harness: this }),
    ];
    if (this.config.get('memory')) {
      tools.push(new MemoryTool({ harness: this }));
    }
    tools.push(new ActivateSkillTool({ harness: this }));
    tools.push(new TodoTool({ harness: this }));
    this.toolbox = new Toolbox(this, tools);
    this.session = new Session({
      tools: this.toolbox.all(),
      ...(sessionProps || null)
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
      onContextChange: () => {
        Events.emit('context:changed', {
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
    Hooks.on('before_message_add', (message) => {
      this.#activeContext.add(message);

      // Skip messages with falsy content
      if (!message || !message.content || (typeof message.content === 'string' && !message.content.trim())) {
        return;
      }
      // Add to session context
      this.session.context.add(message);
    });

    // Register hook handler to amalgamate nudges before each agent iteration
    Hooks.on('before_agent_iteration', ({ context, turnNumber }) => {
      if (this.#pendingNudges.size > 0) {
        const nudges = [...this.#pendingNudges];
        this.#pendingNudges.clear();

        const nudgeContent = nudges.map(n => `<system-reminder>${n}</system-reminder>`).join('\n');
        const nudgeMessage = { role: 'user', content: nudgeContent, ephemeral: true };

        // Add to active context
        this.#activeContext.add(nudgeMessage);
        // Add to session context
        this.session.context.add(nudgeMessage);
      }
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
    this.commands.push({ name: 'clear', handler: async () => this.clear(), silent: true });
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
  
  async reloadSkills() {
    // Clear all existing skills
    this.skills = new Skills();
    
    // Re-read user skills from disk
    let skillsFiles = fsSync.globSync(path.join(this.config.get('slop_dir'), 'skills', '*', 'SKILL.md'));
    if (skillsFiles.length > 0) {
      let skillEntries = skillsFiles.map(skillPath => ({
        text: fsSync.readFileSync(skillPath, 'utf-8'),
        dirName: path.basename(path.dirname(skillPath))
      }));
      this.skills.addSkills(skillEntries);
    }
    
    // Re-read SEA assets if bundled
    if (sea.isSea()) {
      try {
        let assetKeys = sea.getAssetKeys();
        let skillKeys = assetKeys.filter(k => k.startsWith('skills/'));
        if (skillKeys.length > 0) {
          let skillEntries = skillKeys.map(k => ({
            text: sea.getAsset(k, 'utf-8'),
            dirName: k.split('/')[1]
          }));
          this.skills.addSkills(skillEntries);
        }
      } catch (err) { /* no bundled skills */ }
    }
    
    // Clear old skill commands and rebuild
    let oldSkillNames = this.skills.names;
    this.commands = this.commands.filter(c => !oldSkillNames.includes(c.name));
    this.buildCommands();
    
    this.emitCommandMessage(`Skills reloaded: ${this.skills.names.length} loaded.`);
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
    
    if (!summaryResponse || !summaryResponse.content || !summaryResponse.content.length) {
      Logger.log(`Harness: no recap summary.`);
      return;
    }
    let summaryContent = summaryResponse.content,
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
    
    // Build skill prompt (include marker so it appears in chat)
    // const argsStr = args && Object.keys(args).length ? `\n\nUser Args: ${JSON.stringify(args)}` : '';
    // const skillPrompt = `/[Skill: ${skillName}]\nExecute this skill:\n${skill.content}${argsStr}`;
    const argsStr = args && Object.keys(args).length ? `\n\nUser Args: ${JSON.stringify(args)}` : '';
    const skillPrompt = `${skill.content}${argsStr}`;
    
    // Show spinner while skill runs
    Events.emit('status:spinner', { message: `Running ${skillName}...` });
    
    // Show skill description as feedback
    if (skill.description) {
      this.emitCommandMessage(skill.description);
    }
    
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

  /**
   * Clear state — new session, reset dedup/token tracking, but keep agent and config intact.
   */
  async clear() {
    // Abort any in-flight turn
    if (this.#abortController) {
      this.#abortController.abort();
    }

    // Persist current session to disk
    await this.sessionManager.saveSession(this.session);

    // Clean up temp dir for old session
    await this.session.removeTempDir();

    // Reset dedup tracking
    this.#dedupCalls = [];

    // Reset token counters
    this.#inputTokens = 0;
    this.#outputTokens = 0;

    // Create new Session, passing existing promptDoc if available
    const sessionProps = { config: this.config };
    if (this.promptDoc) {
      sessionProps.promptDoc = this.promptDoc;
    }
    this.session = new Session({
      tools: this.toolbox.all(),
      ...sessionProps
    });

    // Create new Context and assign to both activeContext and context
    const newContext = new Context({ config: this.config });
    this.#activeContext = newContext;
    this.context = newContext;

    // Emit program:clear event so interface can re-print banner
    Events.emit('program:clear');
  }
  
 

  async dispose() {
    this.#timers.clearAll();
    await this.session.removeTempDir();
  }
  
  async onUserMessage(event) {
    // TODO: turns, right now the user can just send stuff whenever
    let message = { role: 'user', content: event.message };
    
    // Reset dedup tracking for new turn
    this.resetDedup();
    //this.session.abort();
    this.#userMessagesSinceRecap++;

    // Create fresh abort controller for this turn
    const turnController = new AbortController();
    this.#abortController = turnController;
    
    // Fire before_user_message hook so tools can add ambient reminders
    Hooks.emit('before_user_message', { message: event.message });
    
    // Amalgamate all pending reminders (including any added by hook listeners)
    this.#processAmbientReminders();
    
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
        Events.emit('tool:call', { id, name, args, temppath, config: this.config });
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
        
        const results = await Hooks.emitWithResultsAsync('before_tool_call', { toolCall: call });
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
          Logger.log(`before_tool_call hook cancelled: ${cancelError?.message || cancelError}`);
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
          Events.emit('tool:call', { id, name, args: parsedArgs, temppath: this.session.tempdir, config: this.config });
        }
      } catch (err) {
        Logger.log(`before_tool_call hook error: ${err.message}`);
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
  #classifyToolCall(call) {
    let tool = this.toolbox.get(call.function.name);
    let perms;
    try {
      perms = tool?.permissions(call.function.arguments);
    } catch (err) {
      Logger.log(`tool permissions error (${call.function.name}): ${err.message}`);
      return { skipPermsCheck: false, approved: false };
    }
    
    // Skip calls without permission requirements
    if (!perms || !perms.scope) {
      return { skipPermsCheck: true, approved: false };
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
    
    return { skipPermsCheck: false, approved };
  }
  
  async handleToolCalls(tool_calls) {
    await this.session.ensureTempDir();
    
    // Check each tool call for duplicates
    for (let call of tool_calls) {
      let toolName = call.function.name;
      let args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function.arguments;
      let match = this.checkDedup(toolName, args, call.id);
      if (match) {
        Logger.log(`[dedup] Detected similar tool call: ${toolName} (score: ${match.score.toFixed(2)})`);
        Logger.log(`[dedup] Current: ${truncate(JSON.stringify(args), 200)}`);
        Logger.log(`[dedup] Similar to: ${truncate(match.normalized.join(' '), 200)}`);
      }
    }
    
    // Classify each tool call
    let autoRun = [];
    let pending = [];
    
    for (let call of tool_calls) {
      let { skipPermsCheck, approved } = this.#classifyToolCall(call);
      if (skipPermsCheck || approved) {
        autoRun.push({ call, skipPermsCheck, approved });
      } else {
        pending.push(call);
      }
    }
    
    let results = [];
    let eventsById = {};
    
    // Helper to record a result
    const recordResult = (callResult, call) => {
      results.push(callResult);
      eventsById[call.id] ||= [];
      eventsById[call.id].push({
        id: call.id,
        name: call.function.name,
        args: call.function.arguments,
        temppath: this.session.tempdir
      });
      const success = callResult.content && !callResult.content.startsWith('Error');
      this.#updateToolStats(call.function.name, success);
      Hooks.emit('after_tool_call', { toolCall: call, success });
    };
    
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
        recordResult(callResult, call);
      });
      await Promise.all(autoPromises);
    }
    
    // Run pending tools sequentially (one permission prompt at a time)
    for (let call of pending) {
      if (this.#abortController?.signal.aborted) break;
      if (eventsById[call.id]) continue;
      
      let callResult = await this.handleToolCallWithHook(call);
      recordResult(callResult, call);
    }
    
    results.forEach(msg => {
      msg.role = 'tool';
      msg.tool_call_id = msg.id;
      msg.tool_name = msg.name;
      delete msg.name;
      delete msg.id;
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
