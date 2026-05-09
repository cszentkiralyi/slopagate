const { Logger } = require('../util.js');

class PromptDoc {
  static #id = 0;

  constructor(basePrompt) {
    this.id = ++PromptDoc.#id;
    this.basePrompt = basePrompt;
    this.#subPrompts = new Map();
  }

  #subPrompts;

  /**
   * Register or overwrite a named sub-prompt.
   * @param {string} name
   * @param {PromptDoc} promptDoc
   */
  setSubPrompt(name, promptDoc) {
    this.#subPrompts.set(name, promptDoc);
  }

  render(config) {
    //Logger.log(`[${this.id}] PromptDoc: rendering`);
    let text = this.basePrompt;

    // 1. Resolve {Guard(cond)}...{/Guard} blocks
    text = text.replace(
      /\{Guard\(([^)]+)\)\}([\s\S]*?)\{\/Guard\}/g,
      (_, cond, body) => this.#eval(cond, config) ? body : ''
    );

    // 2. Collapse consecutive newlines left by removed guards
    text = text.replace(/\n{2,}/g, '\n');

    // 3. Resolve {Inject(name)} references — check sub-prompts first, then config
    text = text.replace(
      /\{Inject\(([^)]+)\)\}/g,
      (_, name) => {
        const sub = this.#subPrompts.get(name);
        if (sub) {
          //Logger.log(`[${this.id}] PromptDoc: injecting sub-prompt: ${name}`);
          return sub.render(config);
        }
        const injectedText = config.get(name);
        if (!injectedText) {
          //Logger.log(`[${this.id}] PromptDoc: inject missing: ${name}`);
          return '';
        }
        //Logger.log(`[${this.id}] PromptDoc: injecting from config: ${name}`);
        return new PromptDoc(injectedText).render(config);
      }
    );

    //Logger.log(`[${this.id}] PromptDoc: done`);
    return text;
  }

  #eval(cond, config) {
    // 1. config.key — look up in config Map
    const cm = cond.match(/^config\.(\w+)\s*(<>|!=|<|>|=)\s*(.+)$/);
    if (cm) {
      const [, key, op, rawVal] = cm;
      const a = config.get(key);
      const b = this._coerce(rawVal.trim());
      switch (op) {
        case '<>': case '!=': return a !== b;
        case '<':              return a < b;
        case '>':              return a > b;
        case '=':              return a === b;
      }
    }
    // config.key bare — truthy check
    const cb = cond.match(/^config\.(\w+)\s*$/);
    if (cb) {
      const val = config.get(cb[1]);
      return !!val && val !== '' && val !== 'false' && val !== '0';
    }
    // 2. inject.key — truthy check on sub-prompt existence
    const im = cond.match(/^inject\.(\w+)\s*(<>|!=|<|>|=)\s*(.+)$/);
    if (im) {
      const [, key, op, rawVal] = im;
      const sub = this.#subPrompts.get(key);
      const a = !!sub;
      const b = this._coerce(rawVal.trim());
      switch (op) {
        case '<>': case '!=': return a !== b;
        case '=':              return a === b;
      }
    }
    const ib = cond.match(/^inject\.(\w+)\s*$/);
    if (ib) {
      return this.#subPrompts.has(ib[1]);
    }
    // 3. Bare key — legacy truthy check on config (backwards compat)
    const bare = cond.match(/^(\w+)\s*$/);
    if (bare) {
      const val = config.get(bare[1]);
      return !!val && val !== '' && val !== 'false' && val !== '0';
    }
    // 4. Legacy comparison — bare key with operator
    const m = cond.match(/^(\w+)\s*(<>|!=|<|>|=)\s*(.+)$/);
    if (!m) return false;
    const [, key, op, rawVal] = m;
    const a = config.get(key);
    const b = this._coerce(rawVal.trim());
    switch (op) {
      case '<>': case '!=': return a !== b;
      case '<':              return a < b;
      case '>':              return a > b;
      case '=':              return a === b;
    }
  }

  _coerce(v) {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v.replace(/^["']|["']$/g, '');
  }
}

module.exports = { PromptDoc };