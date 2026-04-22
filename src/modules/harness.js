const Events = require('./events.js');
const Session = require('./session.js');
const Toolbox = require('./toolbox.js');

const { Logger } = require('../util.js');

const ReadTool = require('../tools/read.js');
const EditTool = require('../tools/edit.js');
const LsTool = require('../tools/ls.js');
const GrepTool = require('../tools/grep.js');

class Harness {
  #abortTarget = null;
  
  session = null;
  toolbox = null;

  constructor(props) {
    Events.on('user:message', (event) => this.onUserMessage(event));
    Events.on('user:abort', (event) => this.onUserAbort(event));
    Events.on('model:response', (event) => this.onModelResponse(event));
    Events.on('tool_calls:response', (event) => this.onToolsResponse(event));
    
    this.toolbox = new Toolbox([
      ReadTool,
      EditTool,
      LsTool,
      GrepTool
    ]);
    this.session = new Session(
      Object.assign(
        { tools: this.toolbox.all() },
        (props && props.session || null))
    );
    this.session.ensureTempDir().then(_ => {
      Events.emit('harness:ready');
    });
  }
  
  async onUserMessage(event) {
    // TODO: turns, right now the user can just send stuff whenever
    let message = { role: 'user', content: event.message };
    this.#abortTarget = this.session;
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
     */
    if (!response || !response.message) return;
    let { message, done } = response;
    
    if (message.content || message.tool_calls) {
      this.session.history.push(message);
      if (done) this.#abortTarget = null;
      if (message.content) {
        Events.emit('model:content', { done, content: message.content });
      }
      if (message.tool_calls) {
        await this.session.ensureTempDir();
        // Toolbox doesn't support abort() yet
        //this.#abortTarget = this.toolbox;
        //Logger.log(`tool_calls: ${JSON.stringify(message.tool_calls)}`);
        
        let toolPromises = [];
        
        // Remove existing listener before adding new ones to avoid duplicates
        Events.off('tool:response', this.#handleToolResponse);
        
        for (let call of message.tool_calls) {
          let id = call.id;
          let name = call.function.name;
          let args = call.function.arguments;
          //Logger.log(`tool_call: ${JSON.stringify(call)}`);
          Events.emit('tool:call', { id, name, args, temppath: this.session.temppath });
          
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
        
        let results = await Promise.all(toolPromises);
        results.forEach(msg => msg.role = 'tool');
        Events.emit('tool_calls:response', results);
      }
    }
  }
  
  // Fallback handler for any tool:response events emitted during normal flow
  #handleToolResponse(event) {
    // This handler is removed per-tool in onModelResponse above
    // Kept here for potential global event processing if needed
  }
  
  async onToolsResponse(message) {
    this.#abortTarget = this.session;
    let response = await this.session.send(message);
    Events.emit('model:response', { response });
  }
}

module.exports = Harness;