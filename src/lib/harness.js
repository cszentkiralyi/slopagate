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
        this.commands.push({
          name: skillName,
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
    
    // Filter to only 'user' and 'assistant' role messages
    const filteredMessages = this.session.context.messages.filter(
      m => m.role === 'user' || m.role === 'assistant'
    );
    
    // Get the most-recent filtered messages
    const recentMessages = filteredMessages.slice(-(this.#userMessagesSinceRecap * 2));
    
    // Not enough messages to be worth summarizing
    if (recentMessages.length < 4) return;
    
    Logger.log(`Harness: recapping ${recentMessages.length} messages.`);
    
    let transcript = Context.transcript(recentMessages);
    
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
    const response = await this.session.private(this.session, userMessage);
    
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

        let toolPromises = [], eventsByName = {}, event;
        
        for (let call of message.tool_calls) {
          let id = call.id,
              name = call.function.name,
              args = call.function.arguments,
              event = { id, name, args, temppath: this.session.temppath };
          eventsByName[name] ||= [];
          eventsByName[name].push(event);
          //Logger.log(`tool_call: ${JSON.stringify(call)}`);
          
          // Emit hook before tool:call event
          let cancelled = false;
          let cancelError = null;
          let overrideResponse = null;
          
          // Create a promise that resolves when the corresponding tool:response event is received
          let toolPromise = new Promise(async (resolve, reject) => {
            let onResponse = (evt) => {
              if (evt.id === id) {
                Events.off('tool:response', onResponse);
                resolve(evt);
              }
            };
            Events.on('tool:response', onResponse);

            try {
              const results = await this.hooks.emitWithResultsAsync('tool-call', { toolCall: call });
              for (const result of results) {
                if (!result) continue;
                overrideResponse = result.response || null;
                if (result && result.cancelled) {
                  cancelled = true;
                  cancelError = result.error || null;
                  break;
                }
              }
            } catch (err) {
              cancelled = true;
              cancelError = err;
            }

            if (cancelled) {
              Logger.log(`tool-call hook cancelled: ${cancelError?.message || cancelError}`);
              let content = cancelError?.message || cancelError
                || (overrideResponse && (typeof overrideResponse === 'string'
                    ? overrideResponse
                    : JSON.stringify(overrideResponse)));
              Events.emit('tool:response', {
                id,
                role: 'tool',
                tool_name: name,
                content: content || 'Error: tool call cancelled'
              });
            } else {
              Events.emit('tool:call', event);
            }

            // Timeout race
            this.#timers.start(`tool:${id}`, Harness.TOOL_TIMEOUT, () => {
              Events.off('tool:response', onResponse);
              resolve({ id: id, content: `Error: timed out` });
            });
          });

          // Wrap to clean up timer on resolution
          toolPromise = toolPromise.catch(err => {
            this.#timers.stop(`tool:${id}`);
            throw err;
          }).catch(async () => {
            // On timeout, emit a tool:response so the harness can continue
            return {
              id,
              role: 'tool',
              tool_name: name,
              content: `Error: tool ${name} timed out`
            };
          });

          toolPromises.push(toolPromise);
        }
        
        Object.keys(eventsByName).map(name => {
          let tool = this.toolbox.get(name), msg;
          if (tool && (msg = tool.message(eventsByName[name])))
            Events.emit('tool:message', { content: msg });
        });
        
        let results = await Promise.all(toolPromises);
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