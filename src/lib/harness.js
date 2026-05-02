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

const { Logger } = require('../util.js');

const ReadTool = require('../tools/read.js');
const EditTool = require('../tools/edit.js');
const LsTool = require('../tools/ls.js');
const GrepTool = require('../tools/grep.js');
const BashTool = require('../tools/bash.js');
const MemoryTool = require('../tools/memory.js');
const { Triggers } = require('../lib/triggers.js');

class Harness {
  static TOOL_TIMEOUT = 15 * 1000;

  makeConfigCommand(key, allowedValues) {
    const args = [{
      name: 'value',
      possible: allowedValues
    }];
    const handler = async (bstr) => {
      if (!bstr || !bstr.length) {
        this.emitCommandMessage(`${key} = ${this.config.get(key)}`);
        return;
      }
      let value = bstr;
      if (allowedValues) {
        const lower = bstr.toLowerCase();
        if (allowedValues.map(v => v.toLowerCase()).includes(lower)) {
          value = lower;
        } else {
          const display = allowedValues.join(', ');
          this.emitCommandMessage(`Invalid value. Allowed: ${display}`);
          return;
        }
      } else {
        if (bstr === 'true') value = true;
        else if (bstr === 'false') value = false;
        else if (!isNaN(bstr) && bstr.length > 0) value = parseInt(bstr, 10);
      }
      this.config.set(key, value);
      this.emitCommandMessage(`${key} = ${this.config.get(key)}`);
    };
    return { arguments: args, handler };
  }

  makeLevelCommand(key, allowedValues) {
    const args = [{
      name: 'value',
      possible: allowedValues
    }];
    const handler = async (bstr) => {
      if (!bstr || (typeof bstr !== 'string' && !bstr.length)) {
        this.emitCommandMessage(`${key} = ${this.config.get(key)}`);
        return;
      }
      const str = typeof bstr === 'string' ? bstr : bstr[0];
      const lower = str.toLowerCase();
      if (!allowedValues.map(v => v.toLowerCase()).includes(lower)) {
        this.emitCommandMessage(`Invalid value. Allowed: ${allowedValues.join(', ')}`);
        return;
      }
      this.config.set(key, lower);
      this.emitCommandMessage(`${key} = ${this.config.get(key)}`);
    };
    return { arguments: args, handler };
  }

  #abortTarget = null;
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
    
    // Triggers
    this.triggers = new Triggers({ config: this.config });
    
    this.session.ensureTempDir().then(_ => {
      Events.emit('harness:ready');
    });
  }
  
  buildCommands() {
    // Core commands
    this.commands.push({
      name: 'quit', handler: async () => { Events.emit('program:quit'); }, silent: true
    });
    this.commands.push({
      name: 'think',
      ...this.makeConfigCommand('think', ['true', 'false'])
    });
    this.commands.push({
      name: 'aggression',
      ...this.makeLevelCommand('aggression_level', ['xhigh', 'high', 'medium', 'low'])
    });
    this.commands.push({
      name: 'compact', handler: async () => this.compactCommand()
    });
    this.commands.push({ name: 'recap', handler: async () => this.recap() });
    this.commands.push({
      name: 'bug', handler: async (args) => this.bugCommand(args),
      hint: 'Record a brief bug into bugs.jsonl for later'
    });
    this.commands.push({
      name: 'context', handler: async () => this.contextCommand(),
      hint: 'Display a context window usage visualizer'
    });
    this.commands.push({
      name: 'config',
      arguments: [{ name: 'key' }, { name: 'value', optional: true }],
      handler: async (args) => this.configCommand(args)
    });
    this.commands.push({
      name: 'transcript', handler: async (args) => this.transcriptCommand(args),
      hint: 'Dump session context to a file'
    });
    this.commands.push({
      name: 'commands', handler: async () => this.commandsCommand(),
      hint: 'List available commands'
    });
    this.commands.push({
      name: 'memory',
      arguments: [{ name: 'action', possible: ['list', 'read', 'write', 'search', 'delete'] }],
      handler: async (args) => this.memoryCommand(args),
      hint: 'Interact with the memory system'
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
    return this.commands.map(c => ({
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
    
    await cmd.handler(args);
    return cmd;
  }
  
  // Command handlers
  
  async compactCommand() {
    Events.emit('status:spinner', { message: 'Compacting...' });
    let old_est = this.session.context.estimates,
        old_tok = old_est.system_prompt + old_est.messages + old_est.reserved,
        ctx = await this.session.compact(),
        new_est = ctx.estimates,
        new_tok = new_est.system_prompt + new_est.messages + new_est.reserved,
        delta_tok = ((new_tok - old_tok || 0)).toFixed(0),
        pct = (100 * new_tok / new_est.context_window).toFixed(0);
    Events.emit('status:spinner', { hide: true });
    this.emitCommandMessage(`Context compacted: ${delta_tok} → ${new_tok} (now ${pct}%).`);
    Events.emit('metrics:tokens', {});
  }
  
  contextCommand() {
    let est = this.session.context.estimates,
        win = est.context_window,
        sysTok = est.system_prompt,
        upTok = est.messages,
        genReserve = est.reserved,
        used = est.total,
        totalUsed = used,
        free = win - used,
        barLen = 40,
        bar = '',
        i, fillChar;
    
    // Build the bar
    let sysEnd = (sysTok / win) * barLen,
        upEnd = sysEnd + (upTok / win) * barLen,
        genEnd = upEnd + (genReserve / win) * barLen;
    for (i = 0; i < barLen; i++) {
      if (i < sysEnd) {
        fillChar = ANSI.fg('#', 9);
      } else if (i < upEnd) {
        fillChar = ANSI.fg('#', 11);
      } else if (i < genEnd) {
        fillChar = ANSI.fg('#', 5);
      } else {
        fillChar = ANSI.fg('.', 238);
      }
      bar += fillChar;
    }
    bar += ANSI.fg(']', 238);
    
    let pct = ((totalUsed / win) * 100).toFixed(1);
    let pctColor = totalUsed / win > 0.85 ? 1 : totalUsed / win > 0.7 ? 214 : null;
    
    let lines = [
      ANSI.bold(`Context Window: ${pctColor ? ANSI.fg(pct + '%', pctColor) : pct + '%'} used`),
      ANSI.fg('[', 238) + bar,
      `  ${ANSI.fg('#', 9)} system   ${sysTok.toFixed(0)} tokens`,
      `  ${ANSI.fg('#', 11)} messages ${upTok.toFixed(0)} tokens`,
      `  ${ANSI.fg('#', 5)} reserved ${genReserve.toFixed(0)} tokens`,
      `  ${ANSI.fg('.', 238)} free     ${free.toFixed(0)} tokens`,
      `  ${ANSI.fg('─', 238)} window   ${win.toFixed(0)} tokens total`
    ];
    
    this.emitCommandMessage(lines.join('\n'));
    Events.emit('metrics:tokens', {});
  }
  
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
    
    Events.emit('model:content', {
      done: true,
      content: content,
      padding: { left: 1, right: 1 }
    });
  }
  
  #userMessagesSinceRecap = 0;
  
  async bugCommand(description) {
    if (!description || !description.length) {
      this.emitCommandMessage('Usage: /bug <description>');
      return;
    }
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const entry = JSON.stringify({ description, timestamp });
    try {
      fs.appendFileSync('./bugs.jsonl', entry + '\n');
    } catch (err) {
      fs.writeFileSync('./bugs.jsonl', entry + '\n');
    }
    this.emitCommandMessage(`Bug logged: ${description}`);
  }
  
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
  
  async transcriptCommand(argstr) {
    if (!argstr || !argstr.length) {
      this.emitCommandMessage('Usage: /transcript <filename>');
      return;
    }
    const history = [];
    let m, r, c;
    for (m of this.session.history) {
      if (!m.content) continue;
      r = m.role;
      c = m.content;
      if (m.role === 'tool') m.content = m.content.startsWith('Error') ? '[Error]' : '[Result]';
      history.push(JSON.stringify(m));
    }
    const transcript = history.join('\n');
    try {
      fs.writeFileSync(argstr, transcript, { encoding: 'utf-8' });
    } catch (err) {
      this.emitCommandMessage(`Error writing file: ${err.message}`);
      return;
    }
    this.emitCommandMessage(`Transcript written to ${argstr}`);
  }
  
  commandsCommand() {
    const lines = this.commands
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
      .map(c => c.hint ? `/${c.name} - ${c.hint}` : `/${c.name}`)
      .join('\n');
    if (lines) {
      this.emitCommandMessage(lines);
    }
  }
  
  async memoryCommand(argstr) {
    if (!argstr || !argstr.length) {
      this.emitCommandMessage('Usage: /memory <action> [args]\nActions: list, read <file>, write <file> <content>, search <query>, delete <file>');
      return;
    }
    
    const parts = argstr.split(' ');
    const action = parts[0];
    
    if (action === 'list') {
      let result = await this.toolbox.all().find(t => t.name === 'Memory');
      if (result) {
        let response = await result.handler({ action: 'list' }, result);
        this.emitCommandMessage(response);
      }
    } else if (action === 'read') {
      let result = await this.toolbox.all().find(t => t.name === 'Memory');
      if (result) {
        let response = await result.handler({ action: 'read', file: parts[1] }, result);
        this.emitCommandMessage(response);
      }
    } else if (action === 'write') {
      let result = await this.toolbox.all().find(t => t.name === 'Memory');
      if (result) {
        let response = await result.handler({ action: 'write', file: parts[1], content: parts.slice(2) }, result);
        this.emitCommandMessage(response);
      }
    } else if (action === 'search') {
      let result = await this.toolbox.all().find(t => t.name === 'Memory');
      if (result) {
        let response = await result.handler({ action: 'search', query: parts.slice(1).join(' ') }, result);
        this.emitCommandMessage(response);
      }
    } else if (action === 'delete') {
      let result = await this.toolbox.all().find(t => t.name === 'Memory');
      if (result) {
        let response = await result.handler({ action: 'delete', file: parts[1] }, result);
        this.emitCommandMessage(response);
      }
    } else {
      this.emitCommandMessage('Unknown action. Use list, read, write, search, or delete');
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
    this.#abortTarget = this.session;

    // before-send: let triggers intercept the user's message
    try {
      let result = await this.triggers.check('before-send', { harness: this, message, session: this.session, config: this.config });
      if (result) {
        if (result.cancelled) {
          Events.emit('model:content', { done: true, content: result.error?.message || 'Message cancelled by trigger' });
          Logger.log(`[trigger] before-send cancelled: ${result.error?.message || 'cancelled'}`);
          return;
        }
        if (result.response) {
          let response = { message: { role: 'assistant', content: result.response }, prompt_eval_count: 0, eval_count: 0 };
          Events.emit('model:response', { response });
          return;
        }
      }
    } catch (err) {
      Logger.log(`[trigger] before-send error: ${err.message}`);
    }

    // Update statusline tokens when message is actually sent
    Events.emit('metrics:tokens', {
      inputTokens: this.#inputTokens,
      outputTokens: this.#outputTokens
    });
    let response = await this.session.send(message);
    Events.emit('model:response', { response });
  }
  
  onUserAbort(event) {
    if (this.#abortTarget) {
      this.#abortTarget.abort();
      this.#abortTarget = null;
    }
  }
  
  async onModelResponse(event) {
    let { response } = event;
    /* TODO: cool shit in the response includes
     * - prompt_eval_count (tokens up)
     * - eval_count (tokens down)
     * - prompt_eval_duration / eval_duration / total_duration
     * - thinking
     */
    if (!response) return;
    
    if (response.error) {
      Events.emit('model:content', { done: true, content: ANSI.fg(response.error, 'red') });
      return;
    } else if (!response.message) {
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
    
    if (message.content || message.tool_calls) {
      let done = !message.tool_calls;
      this.session.addToContext(message);
      Events.emit('metrics:tokens', {
        inputTokens: this.#inputTokens,
        outputTokens: this.#outputTokens
      });
      Events.emit('metrics:tokens', {});
      if (done) {
        Events.emit('turn:user');
        this.#abortTarget = null;
        this.#serializeSession();
      }
      if (message.content) {
        Events.emit('model:content', { done, content: message.content });
      }
      if (message.tool_calls) {
        await this.session.ensureTempDir();
        // Toolbox doesn't support abort() yet
        //this.#abortTarget = this.toolbox;
        //Logger.log(`tool_calls: ${JSON.stringify(message.tool_calls)}`);

        // between-respond: let triggers intercept before tool execution
        let triggerAborted = false;
        try {
          let result = await this.triggers.check('between-respond', { harness: this, message, session: this.session, config: this.config });
          if (result && result.cancelled) {
            triggerAborted = true;
            Events.emit('model:content', { done: true, content: result.error?.message || 'Execution cancelled by trigger' });
            Logger.log(`[trigger] between-respond cancelled: ${result.error?.message || 'cancelled'}`);
          }
        } catch (err) {
          Logger.log(`[trigger] between-respond error: ${err.message}`);
        }

        if (triggerAborted) {
          Events.emit('turn:user');
          this.#abortTarget = null;
          this.#serializeSession();
          return;
        }
        
        let toolPromises = [], eventsByName = {}, event;
        
        // Remove existing listener before adding new ones to avoid duplicates
        Events.off('tool:response', this.#handleToolResponse);
        
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
          
          try {
            const results = this.hooks.emitWithResults('tool-call', { toolCall: call });
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
            continue;
          }
          
         if (!cancelled) Events.emit('tool:call', event);

          // Create a promise that resolves when the corresponding tool:response event is received
          let toolPromise = new Promise((resolve, reject) => {
            let onResponse = (evt) => {
              if (evt.id === id) {
                Events.off('tool:response', onResponse);
                resolve(evt);
              }
            };
            Events.on('tool:response', onResponse);
            if (cancelled) {
              let content = overrideResponse && (typeof overrideResponse === 'string'
                ? overrideResponse
                : JSON.stringify(overrideResponse));
              Events.emit('tool:response', {
                id,
                role: 'tool',
                tool_name: name,
                content: content || 'Error: tool call cancelled'
              });
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
    }
  }
  
  // Fallback handler for any tool:response events emitted during normal flow
  #handleToolResponse(event) {
    // This handler is removed per-tool in onModelResponse above
    // Kept here for potential global event processing if needed
  }
  
  async onToolsResponse(messages) {
    this.#abortTarget = this.session;
    let response = await this.session.send(...messages);
    Events.emit('model:response', { response });
    this.#serializeSession();

    // after-respond: let triggers run at turn completion
    try {
      await this.triggers.check('after-respond', { harness: this, response, session: this.session, config: this.config });
    } catch (err) {
      Logger.log(`[trigger] after-respond error: ${err.message}`);
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