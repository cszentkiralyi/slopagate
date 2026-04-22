const fs = require('node:fs/promises');

const { ID } = require('../util.js');

class Session {
  #id;
  #model;
  #think;
  #connection;
  #systemPrompt;
  #tempdir = null;

  #abortController = null;

  history = [];
  tools;
  get id() { return this.#id; }
  get model() { return this.#model; }
  get think() { return this.#think; }
  get connection() { return this.#connection; }
  get systemPrompt() { return this.#systemPrompt; }
  get tempdir() { return this.#tempdir; }
  get temppath() { return this.#tempdir ? this.#tempdir.path : null; }
  
  constructor(props) {
    this.#id = props.id || ID();
    this.#model = props.model;
    this.#think = props.think || false;
    this.#connection = props.connection;
    this.tools = props.tools || [];
    
    this._tempdirPromise = fs.mkdtempDisposable('.sloptmp/');
    
    if (props.systemPrompt) {
      this.history.push({ role: 'system', content: props.systemPrompt });
    }
  }
  
  dispose() {
    this.removeTempDir();
  }
  abort() {
    if (this.#abortController) this.#abortController.abort();
  }
  
  async ensureTempDir() {
    if (this.#tempdir) return;
    this.#tempdir = await this._tempdirPromise;
    delete this._tempdirPromise;
  }
  async removeTempDir() {
    this.#tempdir.remove();
    this.#tempdir = null;
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
    }, responseObj;
    
    this.#abortController = new AbortController();
    
    try {
      let response = await fetch(this.connection, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: this.#abortController.signal
      });
      responseObj = JSON.parse(await response.text());
    } catch (err) {
      if (err.name === 'AbortError') {
        responseObj = { role: 'assistant', message: { } };
      }
    } finally {
      this.#abortController = null;
      return responseObj;
    }
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