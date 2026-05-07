const { Logger } = require('../util.js');

class PromptDoc {
  static #id = 0;

  constructor(basePrompt, subPrompts) {
    this.id = ++PromptDoc.#id;
    this.basePrompt = basePrompt;
    this.subPrompts = subPrompts;
  }

  render(config) {
    Logger.log(`[${this.id}] PromptDoc: rendering`);
    let text = this.basePrompt;

    // 1. Resolve {Guard(cond)}...{/Guard} blocks
    text = text.replace(
      /\{Guard\(([^)]+)\)\}([\s\S]*?)\{\/Guard\}/g,
      (_, cond, body) => this.#eval(cond, config) ? body : ''
    );

    // 2. Collapse consecutive newlines left by removed guards
    text = text.replace(/\n{2,}/g, '\n');

    // 3. Resolve {Inject(name)} sub-prompt references
    text = text.replace(
      /\{Inject\(([^)]+)\)\}/g,
      (_, name) => {
        const subText = this.subPrompts.get(name);
        if (!subText) {
          Logger.log(`[${this.id}] PromptDoc: inject missing: ${name}`);
          return `{Inject(${name})}`;
        }
        Logger.log(`[${this.id}] PromptDoc: injecting ${name}`);
        return new PromptDoc(subText, this.subPrompts).render(config);
      }
    );

    Logger.log(`[${this.id}] PromptDoc: done`);
    return text;
  }

  #eval(cond, config) {
    // Bare key: truthy check — key must exist and be non-empty
    const bare = cond.match(/^(\w+)\s*$/);
    if (bare) {
      const val = config.get(bare[1]);
      return !!val && val !== '' && val !== 'false' && val !== '0';
    }
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