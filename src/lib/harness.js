const fs = require('node:fs');
const path = require('node:path');
const ANSI = require('../lib/ansi.js');
const Events = require('../events.js');
const Session = require('./session.js');
const Context = require('./context.js');
const Toolbox = require('./toolbox.js');
const Timers = require('./timers.js');
const Hooks = require('./hooks.js');

const { Logger } = require('../util.js');

const ReadTool = require('../tools/read.js');
const EditTool = require('../tools/edit.js');
const LsTool = require('../tools/ls.js');
const GrepTool = require('../tools/grep.js');
const BashTool = require('../tools/bash.js');

class Harness {
  static TOOL_TIMEOUT = 15 * 1000;

  #abortTarget = null;
  // Lifetime counts
  #inputTokens = 0;
  #outputTokens = 0;
  #timers = new Timers();
  
  session = null;
  toolbox = null;

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
    
    this.hooks = new Hooks({ hooks: ['tool-call'] });
    
    this.toolbox = new Toolbox([
      new ReadTool(),
      new EditTool(),
      new LsTool(),
      new GrepTool(),
      new BashTool()
    ]);
    this.session = new Session({
      tools: this.toolbox.all(),
      keep_alive: '10m',
      ...(props && props.session || null)
    });
    this.session.ensureTempDir().then(_ => {
      Events.emit('harness:ready');
    });
  }
  
  async dispose() {
    this.#timers.clearAll();
    await this.session.dispose();
  }
  
  async onUserMessage(event) {
    // TODO: turns, right now the user can just send stuff whenever
    let message = { role: 'user', content: event.message };
    this.#abortTarget = this.session;
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
    Events.emit('metrics:tokens', {
      inputTokens: this.#inputTokens,
      outputTokens: this.#outputTokens
    });
    
    if (message.content || message.tool_calls) {
      let done = !message.tool_calls;
      this.session.addToContext(message);
      if (done) {
        Events.emit('turn:user');
        this.#abortTarget = null;
        this.#serializeSession();
      }
      if (message.content) {
        // TODO: remove me
        this.session.addToContext(message);
        Events.emit('model:content', { done, content: message.content });
      }
      if (message.tool_calls) {
        await this.session.ensureTempDir();
        // Toolbox doesn't support abort() yet
        //this.#abortTarget = this.toolbox;
        //Logger.log(`tool_calls: ${JSON.stringify(message.tool_calls)}`);
        
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
            if (overrideResponse) {
              Events.emit('tool:response', {
                id,
                role: 'tool',
                tool_name: name,
                content: typeof overrideResponse === 'string' ? overrideResponse : JSON.stringify(overrideResponse)
              });
            }
            continue;
          }
          
          Events.emit('tool:call', event);

          // Create a promise that resolves when the corresponding tool:response event is received
          let toolPromise = new Promise((resolve, reject) => {
            let onResponse = (evt) => {
              if (evt.id === id) {
                Events.off('tool:response', onResponse);
                resolve(evt);
              }
            };
            Events.on('tool:response', onResponse);

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