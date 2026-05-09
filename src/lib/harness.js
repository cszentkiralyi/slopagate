const fs = require('node:fs');
const path = require('node:path');
const ANSI = require('../lib/ansi.js');
const Events = require('../events.js');
const Session = require('./session.js');
const Context = require('./context.js');
const Toolbox = require('./toolbox.js');
const Timers = require('./timers.js');
const Hooks = require('./hooks.js');
const Skills = require('../lib/skills.js');
const Config = require('../core/config.js');
const Commands = require('./commands.js');

const { Logger } = require('../util.js');

const ReadTool = require('../tools/read.js');
const EditTool = require('../tools/edit.js');
const LsTool = require('../tools/ls.js');
const GrepTool = require('../tools/grep.js');
const BashTool = require('../tools/bash.js');
const MemoryTool = require('../tools/memory.js');

class Harness {
  static TOOL_TIMEOUT = 15 * 1000;

  // Lifetime counts
  #inputTokens = 0;
  #outputTokens = 0;
  #timers = new Timers();
  
  session = null;
  toolbox = null;
  skills = null;
  config = null;
  
  commands = [];

  #serializeSession() {
    try {
      let historyPath = path.join(process.env.HOME, '.slopagate', 'history');
      fs.mkdirSync(historyPath, { recursive: true });
      let json = this.session.serialize();
      fs.writeFileSync(path.join(historyPath, this.session.id + '.json'), json);
    } catch (err) {
      Logger.log(`serialize error: ${err.message}`);
    }
  }

  get inputTokens() { return this.#inputTokens; }
  get outputTokens() { return this.#outputTokens; }

  constructor(props) {
    Events.on('user:message', (event) => this.onUserMessage(event));
    Events.on('user:abort', (event) => this.onUserAbort(event));
    Events.on('model:response', (event) => this.onModelResponse(event));
    Events.on('tool_calls:response', (event) => this.onToolsResponse(event));

    Object.assign(this, props);
    
    this.hooks = new Hooks({ hooks: ['tool-call'] });
    
    this.toolbox = new Toolbox([
      new ReadTool(this),
      new EditTool(this),
      new LsTool(this),
      new GrepTool(this),
      new BashTool(this),
      new MemoryTool({
        ...this.session,
        config: this.config
      })
    ]);
    this.session = new Session({
      tools: this.toolbox.all(),
      keep_alive: '10m',
      ...(props && props.session || null)
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
    /*
    this.commands.push({
      name: 'bug', handler: async (args) => this.bugCommand(args),
      hint: 'Record a brief bug into bugs.jsonl for later'
    });
    */
    this.commands.push({
      name: 'config',
      arguments: [{ name: 'key' }, { name: 'value', optional: true }],
      handler: async (args) => this.configCommand(args)
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
          handler: async (args) => this.handleSkill(skillName, args),
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
  
  emitCommandMessage(content) {
    Events.emit('command:message', { content });
  }

  async command(name, args) {
    let cmd = this.commands.find(c => c.name === name);
    if (!cmd) {
      Events.emit('command:name', { name });
      this.emitCommandMessage(`Unknown command "${name}".`);
      return null;
    }
    
    if (!cmd.silent) {
      Events.emit('command:name', { name });
    }
    
    await cmd.handler(this, args);
    return cmd;
  }
  
  // Command handlers
  async recap() {
    // Don't recap if it's not the user's turn
    if (this.session.turn !== 'user') return;
    
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
    
    // Use private session
    let summaryContext = new Context({
      config: this.config,
      system_prompt: `You are an assistant that's been interacting with a user. From your perspective, using terms like "we" and "I," summarize this transcript into a 1-sentence recap:`
    });
    let summaryMessage = { role: 'user', content: transcript };
    
    let summaryResponse = await this.session.private(summaryContext, summaryMessage);
    
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
    
    Events.emit('tool:message', {
      done: true,
      content: content,
      padding: { left: 1, right: 1 }
    });
  }
  
  #userMessagesSinceRecap = 0;

  async configCommand(argstr) {
    if (!argstr || !argstr.length) {
      this.emitCommandMessage('Usage: /config <key> [value]');
      return;
    }
    let parts = argstr.split(' ');
    let key = parts[0];
    let value = parts.slice(1).join(' ');
    
    if (parts.length <= 1) {
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
    
    // Build skill prompt
    const skillPrompt = `Execute this skill: "${skillName}"\n\nSkill Instructions:\n${skill.content}`;
    
    // Add skill invocation to context
    this.session.addToContext({
      role: 'user',
      content: `[Skill: ${skillName}]`
    });
    
    // Build user message
    const userMessage = {
      role: 'user',
      content: `${skillPrompt}\n\nUser Args: ${JSON.stringify(args || {})}`
    };
    
    // Use private session
    const skillContext = new Context({
      config: this.session.config,
      system_prompt: ''
    });
    const response = await this.session.private(skillContext, userMessage);
    
    // Emit model:response event
    Events.emit('model:response', { response });
  }
  
  async dispose() {
    this.#timers.clearAll();
    await this.session.dispose();
  }
  
  async onUserMessage(event) {
    // TODO: turns, right now the user can just send stuff whenever
    let message = { role: 'user', content: event.message };
    this.session.abort();
    this.#userMessagesSinceRecap++;

    // Update statusline tokens when message is actually sent
    Events.emit('metrics:tokens', {
      inputTokens: this.#inputTokens,
      outputTokens: this.#outputTokens
    });
    let response = await this.session.send(message);
    Events.emit('model:response', { response });
  }
  
  onUserAbort(event) {
    this.session.abort();
  }
  
  async onModelResponse(event) {
    let { response } = event;
    /* TODO: cool shit in the response includes
     * - prompt_eval_count (tokens up)
     * - eval_count (tokens down)
     * - prompt_eval_duration / eval_duration / total_duration
     * - thinking
     */
    if (!response) {
      Events.emit('turn:user');
      return;
    }
    
    if (response.error) {
      Events.emit('model:content', { done: true, content: ANSI.fg(response.error, 'red') });
      Events.emit('turn:user');
      return;
    } else if (!response.message) {
      Events.emit('turn:user');
      return;
    }

    let { message } = response;
    
    let p = response.prompt_eval_count;
    if (p !== null && p !== undefined && !Number.isNaN(p)) {
      this.#inputTokens += p;
    }
    let e = response.eval_count;
    if (e !== null && e !== undefined && !Number.isNaN(e)) {
      this.#outputTokens += e;
    }
    
    // finish_reason: "stop" = natural end, "length" = hit output limit, "tool_calls" = intermediate
    // Ollama: response.message.finish_reason
    // OpenAI: response.choices[0].finish_reason
    let fr = response.message?.finish_reason
          ?? response.choices?.[0]?.finish_reason
          ?? response.finish_reason;
    let done = fr === 'stop' || fr === 'length';
    
    if (done || message.content || message.tool_calls) {
      if ((fr === 'length' || fr === 4) && !message.content) {
        Events.emit('model:content', {
          done: true,
          content: ANSI.fg('(response was truncated)', 'yellow')
        });
      }
      if (message.content || message.tool_calls) {
        if (message.content) message.content = message.content.trim();
        this.session.addToContext(message);
        Events.emit('metrics:tokens', {
          inputTokens: this.#inputTokens,
          outputTokens: this.#outputTokens
        });
        Events.emit('metrics:tokens', {});
      }
      if (message.content) {
        Events.emit('model:content', { done, content: message.content.trim() });
      }
      if (message.tool_calls) {
        await this.session.ensureTempDir();
        // Toolbox doesn't support abort() yet
        //this.#abortTarget = this.toolbox;
        //Logger.log(`tool_calls: ${JSON.stringify(message.tool_calls)}`);

        // Split tool calls into auto-run (approved) and pending (need user approval)
        let autoRun = [];
        let pending = [];
        
        for (let call of message.tool_calls) {
          let tool = this.toolbox.get(call.function.name);
          let perms = tool?.permissions(call.function.arguments);
          
          // Skip calls without permission requirements
          if (!perms || !perms.scope) {
            autoRun.push({ call, skipPermsCheck: true });
          } else {
            // Check if already auto-approved
            let scopes = [perms.scope, ...(perms.parents || [])];
            let approved = scopes.some(s => this.permissions?.check(tool.name, s).allowed === true);
            if (approved) {
              autoRun.push({ call, approved });
            }
            // If not approved, skip adding to autoRun and let it fall through to the pending phase
          }
        }
        
        let results = [];
        let eventsByName = {};
        
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
            eventsByName[call.function.name] ||= [];
            eventsByName[call.function.name].push({
              id: call.id,
              name: call.function.name,
              args: call.function.arguments,
              temppath: this.session.temppath
            });
          });
          await Promise.all(autoPromises);
        }
        
        // Run pending tools sequentially (one permission prompt at a time)
        for (let call of message.tool_calls) {
          let tool = this.toolbox.get(call.function.name);
          let perms = tool?.permissions(call.function.arguments);
          
          // Skip if already processed in auto-run
          if (eventsByName[call.function.name]?.length > 0) continue;
          
          // Skip calls without permission requirements
          if (!perms || !perms.scope) {
            let callResult = await this.handleToolCallWithHook(call);
            results.push(callResult);
            eventsByName[call.function.name] ||= [];
            eventsByName[call.function.name].push({
              id: call.id,
              name: call.function.name,
              args: call.function.arguments,
              temppath: this.session.temppath
            });
            continue;
          }
          
          // Check if already auto-approved
          let scopes = [perms.scope, ...(perms.parents || [])];
          let approved = scopes.some(s => this.permissions?.check(tool.name, s).allowed === true);
          
          if (approved) {
            let callResult = await this.runToolCall(call);
            results.push(callResult);
            eventsByName[call.function.name] ||= [];
            eventsByName[call.function.name].push({
              id: call.id,
              name: call.function.name,
              args: call.function.arguments,
              temppath: this.session.temppath
            });
            continue;
          }
          
          // Needs user approval — fire hook (will prompt user)
          let callResult = await this.handleToolCallWithHook(call);
          results.push(callResult);
          eventsByName[call.function.name] ||= [];
          eventsByName[call.function.name].push({
            id: call.id,
            name: call.function.name,
            args: call.function.arguments,
            temppath: this.session.temppath
          });
        }
        
        Object.keys(eventsByName).map(name => {
          let tool = this.toolbox.get(name), msg;
          if (tool && (msg = tool.message(eventsByName[name])))
            Events.emit('tool:message', { content: msg });
        });
        
        results.forEach(msg => {
          msg.role = 'tool';
          msg.tool_name = msg.name;
          delete msg.name;
        });
        Events.emit('tool_calls:response', results);
      }
      if (done) {
        Events.emit('turn:user');
        this.#serializeSession();
      }
    }
  }
  
  async onToolsResponse(messages) {
    try {
      let response = await this.session.send(...messages);
      Events.emit('model:response', { response });
      this.#serializeSession();
    } catch (err) {
      Logger.log(`[onToolsResponse] error: ${err.message}`);
      Events.emit('model:content', { done: true, content: ANSI.fg(`Error: ${err.message}`, 'red') });
      Events.emit('turn:user');
    }
  }
  
  async runToolCall(call) {
    let id = call.id;
    let name = call.function.name;
    let args = call.function.arguments;
    let temppath = this.session.temppath;
    
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
          Events.emit('tool:call', { id, name, args: call.function.arguments, temppath: this.session.temppath });
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