const ANSI = require('./ansi.js');

class Context {
  static FORCE_COMPACT_RATIO = 0.70;

  #estimated_tokens = 0;
  
  limits = {};
  budgets = {};
  system_prompt;
  tools;
  messages = [];
  
  get estimated_tokens() {
    return this.#estimated_tokens;
  }
  
  constructor(props) {
    Object.assign(this, props);
    
    if (this.messages && this.messages.length) {
      let s = this.messages.map(m => Context.toTranscript(m)).join('\n');
      this.#estimated_tokens = Context.estimateTokens(s);
      this.#estimated_tokens += this.budgets.generation || 0;
    }
  }
  
  add(message) {
    this.messages.push(message);
    this.#estimated_tokens += Context.estimateTokens(Context.toTranscript(message));
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
      if (layer = Context.COMPACT_LAYERS[layerName]) {
        arg = layer(arg);
      }
    });
    this.messages = arg.messages || this.messages;
    this.system_prompt = arg.system_prompt || this.system_prompt;
    
    return this;
  }

  // requestSummary(s: string) => string
  
  static toTranscript(m) {
    return `${m.role}: ${m.content}`;
  }
  static estimateTokens(s) {
    let len = ANSI.measure(s);
    return Math.ceil(len / 3.5); // rough estimate: 3.5 char/tok
  }
  
  
  
  static COMPACT_LAYERS = {

    'system_prompt': ({ messages, system_prompt, limits, estimated_tokens }) => {
      if (!system_prompt || !system_prompt.length
          || !limits || !limits.system_prompt
          || estimated_tokens < limits.system_prompt)
        return;
      let budget = limits.system_prompt,
          prompt = system_prompt.split('\n'),
          lines = [];
          i;
      for (i = 0; i < prompt.length && budget > 0; i++) {
        lines.push(prompt[i]);
        budget -= Context.estimateTokens(prompt[i]);
      }
      // We currently allow overshooting if there's no newline.
      return { system_prompt: lines.join('\n') };
    },

    'tool_age': ({ messages, tools }) => {
      if (!tools || !tools.length || !tools.some(t => t.ttl))
        return;
      let len = messages.length, msg, i, tool, ttl;
      for (i = 0; i < len;) {
        msg = messages[len - i - 1];
        if (msg.role === 'user') i++;
        ttl = this.limits.tool_age;
        if (msg.role === 'tool' && (tool = tools[msg.name])
            && (ttl = (ttl || tool.ttl)) && ttl < i) {
          msg.content = '[Old tool result content cleared]';
        }
      }
    },

    'tool_length': ({ messages }) => {
      return { messages };
    },

    'tool_redundancy': ({ messages }) => {
      return { messages };
    },

    'chat_importance': ({ messages }) => {
      return { messages };
    },

    'chat_summary': ({ messages }) => {
      return { messages };
    }

  };
}

module.exports = Context;