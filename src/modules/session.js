const fs = require('node:fs/promises');

const { ID } = require('../util.js');

class Session {
  _id;
  _model;
  _think;
  _connection;
  _tempdir = null;

  history = [];
  tools;
  get id() { return this._id; }
  get model() { return this._model; }
  get think() { return this._think; }
  get connection() { return this._connection; }
  get systemPrompt() { return this._systemPrompt; }
  get tempdir() { return this._tempdir; }
  get temppath() { return this._tempdir ? this._tempdir.path : null; }
  
  constructor(props) {
    this._id = props.id || ID();
    this._model = props.model;
    this._think = props.think || false;
    this._connection = props.connection;
    this.tools = props.tools || [];
    
    this._tempdirPromise = fs.mkdtempDisposable('.sloptmp/');
    
    if (props.systemPrompt) {
      this.history.push({ role: 'system', content: props.systemPrompt });
    }
  }
  
  dispose() {
    this.removeTempDir();
  }
  
  async ensureTempDir() {
    if (this._tempdir) return;
    this._tempdir = await this._tempdirPromise;
    delete this._tempdirPromise;
  }
  async removeTempDir() {
    this._tempdir.remove();
    this._tempdir = null;
  }
  
  serialize() {
    return Session.serialize(this);
  }

  async send_internal(messages)  {
    let payload = {
      model: this.model,
      think: false, // TODO
      stream: false, // TODO
      messages: messages,
      tools: this.tools.map(t => t.spec)
    };
    
    let response = await fetch(this.connection, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
      // TODO
      // signal: abortSignal
      // Somewhere else, make an AbortController whose c.signal we pass here.
      // Use c.abort() to cancel this request.
    });

    // TODO: blindly assumes success
    let responseJson = await response.text();
    return JSON.parse(responseJson);
  }
  
  async send(outgoing) {
    this.history.push(outgoing);
    return await this.send_internal(this.history);
  }
  
  
  static serialize(session) {
    let data = {
      id: session.id,
      model: session.model,
      think: session.think,
      connection: session.connection,
      tools: session.tools.map(t => t.name),
      history: session.history
    };
    return JSON.stringify(data);
  }
  static deserialize(content, toolDefs) {
    let data = JSON.parse(content);
    data.tools = data.tools.map(name => toolDefs.find(t => t.name === name)).filter(t => t != null);
    return new Session(data);
  }
}

module.exports = Session;