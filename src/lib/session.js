const fs = require('node:fs/promises');

const { ID, Logger } = require('../util.js');
const Context = require('./context.js');

class Session {
  #id;
  #config;
  #model;

  #connection;
  #systemPrompt;
  #tempdir = null;
  
  #activeContext = null;
  #masterContext = null;

  #abortControllers = null;

  tools;
  get history() { return this.#masterContext.messages; }
  get messages() { return this.#activeContext.messages; }
  set messages(m) { this.#activeContext.messages = m; }
  get context() { return this.#activeContext; }
  get id() { return this.#id; }
  get model() { return this.#model; }
  get think() { return this.#config.think; }
  get connection() { return this.#connection; }
  get systemPrompt() { return this.#systemPrompt; }
  get tempdir() { return this.#tempdir; }
  get temppath() { return this.#tempdir ? this.#tempdir.path : null; }
  
  constructor(props) {
    this.#id = props.id || ID();
    this.#config = props.config || {};
    this.#model = props.model;

    this.#connection = props.connection;
    this.tools = props.tools || [];
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
      },
    });
    
    this._tempdirPromise = fs.mkdtempDisposable('.sloptmp/');
    
    if (props.systemPrompt) {
      this.#masterContext.system_prompt = props.systemPrompt;
    }
  }

  setConfig(k, v) {
    if (typeof this.#config === 'Map') {
      this.#config.set(k, v);
    } else {
      this.#config[k] = v;
    }
  }

  getConfig(k) {
    if (typeof this.#config === 'Map') {
      return this.#config.get(k);
    } else {
      return this.#config[k];
    }
  }
  
  async dispose() {
    this.removeTempDir();
  }
  abort() {
    if (this.#abortControllers && this.#abortControllers.length)
      this.#abortControllers.forEach(c => c.abort());
    this.#abortControllers = null;
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
      think: (this.#config.think || false),
      stream: (this.#config.stream || false),
      messages: messages,
      tools: this.tools.map(t => t.spec)
    }, responseObj, controller;
    
    controller = new AbortController();
    this.#abortControllers ||= [];
    this.#abortControllers.push(controller);
    
    try {
      let response = await fetch(this.connection, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      responseObj = JSON.parse(await response.text());
    } catch (err) {
      if (err.name === 'AbortError') {
        responseObj = { role: 'assistant', message: { } };
      }
    } finally {
      let idx;
      if (this.#abortControllers
          && -1 < (idx = this.#abortControllers.indexOf(controller))) {
        this.#abortControllers.splice(idx, 1);
      }
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
    
    return await this.send_internal([
      { role: 'system', content: this.#activeContext.system_prompt },
      ...this.#activeContext.messages
    ]);
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