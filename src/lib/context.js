const ANSI = require('./ansi.js');
const Layers = require('./layers/layers.js');

class Context {
  static FORCE_COMPACT_RATIO = 0.70;

  #tokens_up = 0
  #tokens_down = 0;
  #other_tokens = 0;
  #system_prompt = null;
  
  limits = {};
  budgets = {};
  tools;
  messages = [];
  
  get tokens_up() { return this.#tokens_up; }
  get tokens_down() { return this.#tokens_down; }
  get other_tokens() { return this.#other_tokens; }
  get estimated_tokens() { return this.tokens_up + this.tokens_down + this.other_tokens }
  
  get system_prompt() { return this.#system_prompt; }
  set system_prompt(sp) {
    this.#estimate({ system_prompt: sp });
    this.#system_prompt = sp;
  }
  
  constructor(props) {
    Object.assign(this, props);
    
    this.#estimate();
  }
  
  add(message) {
    this.messages.push(message);
    let tok = Context.estimateTokens(Context.toTranscript(message));
    if (message.role === 'assistant') {
      this.#tokens_down += tok;
    } else {
      this.#tokens_up += tok;
    }
  }
  
  fork({ system_prompt, layers }) {
    let f = new Context({
      system_prompt: system_prompt || this.system_prompt, 
      tools: { ...this.tools },
      limits: { ...this.limits },
      budgets: { ...this.budgets },
      messages: this.messages.map(m => { return { ...m }; }),
    });
    f.compact(layers);
    return f;
  }
  
  compact(layers) {
    if (!layers || !layers.length
        || !this.messages || !this.messages.length)
      return this;
    let arg = {
      messages: this.messages,
      system_prompt: this.system_prompt,
      tools: this.tools, // TODO: feed tool names, ttls
      limits: this.limits,
      budgets: this.budgets,
      estimated_tokens: this.estimated_tokens,
      requestSummary: (s) => this.requestSummary(s)
    }, layer;
    layers.forEach(layerName => {
      // Not an accident
      if (layer = Layers[layerName]) {
        Object.assign(arg, layer(arg));
      }
    });
    this.messages = arg.messages || this.messages;
    this.system_prompt = arg.system_prompt || this.system_prompt;
    
    this.#estimate();
    
    return this;
  }

  requestSummary(s) {
    const prompt = `Summarize the following conversation in under 200 tokens. Keep all essential context and details.\n\n${this.messages.map(m => Context.toTranscript(m)).join('\n')}`;
    return `Summarized: ${this.getModelResponse(prompt)}`;
  }

  // requestSummary(s: string) => string
  // requestSummary: callback to hit the LLM agent

  // getResponse(s: string) => void
  // Uses getModelResponse() to summarize the provided transcript
  getResponse(s) {
    return this.getModelResponse(s);
  }
  
  #estimate({ system_prompt } = {}) {
    let diff;
    this.#other_tokens = this.system_prompt ? Context.estimateTokens(this.system_prompt) : 0;
    if (system_prompt
        && (diff = Context.estimateTokens(system_prompt) - this.#other_tokens)) {
      this.#other_tokens += diff;
    } else {
      let tok
      this.#tokens_up = 0;
      this.#tokens_down = 0;
      this.messages.forEach(m => {
        tok = Context.estimateTokens(Context.toTranscript(m));
        if (m.role === 'assistant') {
          this.#tokens_down += tok;
        } else {
          this.#tokens_up += tok;
        }
      });
    }
  }
  
  static toTranscript(m) {
    return `${m.role}: ${m.content}`;
  }
  static estimateTokens(s) {
    let len = ANSI.measure(s);
    return Math.ceil(len / 3.5); // rough estimate: 3.5 char/tok
  }
}

module.exports = Context;