const fs = require('node:fs/promises');

const { ID } = require('../util.js');
const Context = require('./context.js');

class Session {
  #id;
  #config;
  #model;
  #think;
  #connection;
  #systemPrompt;
  #tempdir = null;
  
  #activeContext = null;
  #masterContext = null;

  #abortController = null;

  tools;
  get history() { return this.#masterContext.messages; }
  get messages() { return this.#activeContext.messages; }
  set messages(m) { this.#activeContext.messages = m; }
  get context() { return this.#activeContext; }
  get id() { return this.#id; }
  get model() { return this.#model; }
  get think() { return this.#think; }
  get connection() { return this.#connection; }
  get systemPrompt() { return this.#systemPrompt; }
  get tempdir() { return this.#tempdir; }
  get temppath() { return this.#tempdir ? this.#tempdir.path : null; }
  
  constructor(props) {
    this.#id = props.id || ID();
    this.#config = props.config || {};
    this.#model = props.model;
    this.#think = props.think || false;
    this.#connection = props.connection;
    this.#masterContext = this.#activeContext = new Context({
      tools: this.tools.reduce((m, t) => {
        m[t.name] = { name: t.name, ttl: t.ttl };
        return m;
      }, {}),
      limits: {
        window: this.#config.context_window_length,
        tool_age: 5
      },
      budgets: {
        generation: 2000
      }
    });
    this.tools = props.tools || [];
    
    this._tempdirPromise = fs.mkdtempDisposable('.sloptmp/');
    
    if (props.systemPrompt) {
      this.#masterContext.system_prompt = props.system_prompt;
    }
  }
  
  async dispose() {
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
    await this.#tempdir.remove();
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

  async send(...outgoing) {
    if (this.#masterContext !== this.#activeContext)
      this.#masterContext.messages.push(...outgoing);
    this.#activeContext.messages.push(...outgoing);
    
    this.#activeContext = this.#activeContext.fork([
      'system_prompt', 'tool_age', 'tool_redundancy', 'chat_importance'
    ]);
    
    // TODO: take ownership of this result and add it to context,
    // we already have the entire user half for god's sake

    return await this.send_internal(this.#activeContext.messages);
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