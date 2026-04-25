const ANSI = require('../lib/ansi.js');
const Events = require('../events.js');
const Session = require('./session.js');
const Context = require('./context.js');
const Toolbox = require('./toolbox.js');

const { Logger } = require('../util.js');

const ReadTool = require('../tools/read.js');
const EditTool = require('../tools/edit.js');
const LsTool = require('../tools/ls.js');
const GrepTool = require('../tools/grep.js');
const BashTool = require('../tools/bash.js');

class Harness {
  #abortTarget = null;
  #inputTokens = 0;
  #outputTokens = 0;
  
  session = null;
  toolbox = null;

  get inputTokens() { return this.#inputTokens; }
  get outputTokens() { return this.#outputTokens; }

  constructor(props) {
    Events.on('user:message', (event) => this.onUserMessage(event));
    Events.on('user:abort', (event) => this.onUserAbort(event));
    Events.on('model:response', (event) => this.onModelResponse(event));
    Events.on('tool_calls:response', (event) => this.onToolsResponse(event));
    
    this.toolbox = new Toolbox([
      new ReadTool(),
      new EditTool(),
      new LsTool(),
      new GrepTool(),
      new BashTool()
    ]);
    this.session = new Session({
      tools: this.toolbox.all(),
      ...(props && props.session || null)
    });
    this.session.ensureTempDir().then(_ => {
      Events.emit('harness:ready');
    });
  }
  
  async dispose() {
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
    if (!response || !response.message) return;
    let { message, done } = response;
    
    // According to Qwen3.5:9B, this is not accumulated.
    this.#inputTokens = response.prompt_eval_count;
    this.#outputTokens += response.eval_count;
    Events.emit('metrics:tokens', {
      inputTokens: this.#inputTokens,
      outputTokens: this.#outputTokens
    });
    
    if (message.content || message.tool_calls) {
      this.session.messages.push(message);
      if (done) this.#abortTarget = null;
      if (message.content) {
        // TODO: remove me
        this.session.messages.push(message);
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
  }
  
  estimateHistoryTokens() {
    return this.session.history.reduce((m, entry) => {
      if (entry.content) {
        m += Harness.estimteTokens(`${entry.role}: ${entry.content}`);
      }
      if (entry.tool_calls) {
        m += Harness.estimteTokens(JSON.stringify(entry.tool_calls));
      }
      return m
    }, 0);
  }
  
  static estimteTokens(s) {
    // TODO: temporary shim
    return Context.estimateTokens(s);
  }
}

module.exports = Harness;