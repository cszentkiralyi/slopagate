class PromptDoc {
  constructor(basePrompt, subPrompts) {
    this.basePrompt = basePrompt;
    this.subPrompts = subPrompts;
  }

  render(config) {
    let text = this.basePrompt;

    // 1. Resolve {Guard(cond)}...{/Guard} blocks
    text = text.replace(
      /\{Guard\(([^)]+)\)\}([\s\S]*?)\{\/Guard\}/g,
      (_, cond, body) => this.#eval(cond, config) ? body : ''
    );

    // 2. Resolve {Inject(name)} sub-prompt references
    text = text.replace(
      /\{Inject\(([^)]+)\)\}/g,
      (_, name) => {
        const subText = this.subPrompts.get(name);
        if (!subText) return `{Inject(${name})}`;
        return new PromptDoc(subText, this.subPrompts).render(config);
      }
    );

    return text;
  }

  #eval(cond, config) {
    const m = cond.match(/^(\w+)\s*(<>|!=|<|>|=)\s*(.+)$/);
    if (!m) return false;
    const [, key, op, rawVal] = m;
    const a = config[key];
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