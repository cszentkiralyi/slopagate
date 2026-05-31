const fs = require('node:fs/promises');

const { ID } = require('../util.js');
const Context = require('./context.js');

class Session {
  #id;
  config;
  #tempdir = null;
  #masterContext = null;
  #promptDoc;

  tools;

  get context() { return this.#masterContext; }
  get id() { return this.#id; }
  get tempdir() { return this.#tempdir; }

  constructor(props) {
    this.#id = props.id || ID();
    this.config = props.config || new Map();
    this.tools = props.tools || [];
    
    this.#masterContext = new Context({
      config: this.config,
      appendOnly: true
    });
    
    this._tempdirPromise = new Promise(async (resolve) => {
     await fs.mkdir('.sloptmp', { recursive: true });
     await fs.mkdtempDisposable('.sloptmp/').then(resolve);
    });
    
    if (props.promptDoc) {
      this.#promptDoc = props.promptDoc;
      this.#masterContext.system_prompt = this.#promptDoc.render(this.config);
    }

    if (props.messages && props.messages.length) {
      this.#masterContext.add(...props.messages);
    }
  }

  async ensureTempDir() {
    if (this.#tempdir) return;
    this.#tempdir = await this._tempdirPromise;
    delete this._tempdirPromise;
  }
  async removeTempDir() {
    if (!this.#tempdir) return;
    await this.#tempdir.remove();
    this.#tempdir = null;
    try {
      const entries = await fs.readdir('.sloptmp');
      if (entries.length === 0) {
        await fs.rmdir('.sloptmp');
      }
    } catch { /* parent may not exist or may not be empty */ }
  }
}

module.exports = Session;