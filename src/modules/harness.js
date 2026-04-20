const Events = require('./events.js');
const Session = require('./session.js');
const Toolbox = require('./toolbox.js');

const ReadTool = require('../tools/read.js');
const EditTool = require('../tools/edit.js');

class Harness {
  _abortControllers = new Map();
  _primaryAbort = null;
  
  session = null;
  toolbox = null;

  constructor(props) {
    Events.on('user:message', (event) => this.onUserMessage(event));
    Events.on('user:abort', (event) => this.onUserAbort(event));
    Events.on('model:response', (event) => this.onModelResponse(event));
    Events.on('tool:response', (event) => this.onToolResponse(event));
    
    this.toolbox = new Toolbox([
      ReadTool,
      EditTool
    ]);
    this.session = new Session(
      Object.assign(
        { tools: this.toolbox.all() },
        (props && props.session || null))
      );
  }
  
  async onUserMessage(event) {
    let message = { role: 'user', content: event.message }
    let response = await this.session.send(message);
    Events.emit('model:response', { response });
  }
  
  onUserAbort(event) {
    // TODO: what *do* we do if we don't have a primary abort? Should we
    // even be making that call, or should the event be passing us some
    // kind of "abort ID" we use to target a specific controller?
    if (!this._primaryAbort) return;
    let abort = this._abortControllers.get(this._primaryAbort);
    abort.abort();
    this._abortControllers.delete(this._primaryAbort);
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
    
    if (message.content) {
      Events.emit('model:content', { done, content: message.content });
    }
    if (message.tool_calls) {
      await this.session.ensureTempDir();
      message.tool_calls.forEach(call => {
        let id = call.id;
        let name = call.function.name;
        let args = call.function.arguments;
        Events.emit('tool:call', { id, name, args, dir: this.session.tempdir });
      });
    }
  }
  
  async onToolResponse(event) {
    let message = event;
    message.role = 'tool';
    let response = await this.session.send(message);
    Events.emit('model:response', { response });
  }
}

module.exports = Harness;