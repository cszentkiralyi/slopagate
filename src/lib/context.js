const { Logger } = require('../util.js');
const ANSI = require ('./ansi.js');
const Layers = require('./layers/layers.js');

const CONTEXT_FAMILIES = {
  'starving': {
    max_context_window: 2 ** 13, // 8K
    aggression_level: 'xhigh',
    budget: {
      system_prompt: (ctx) => 500 * (1 + Math.floor(ctx / 2000)),
      injection: (ctx) => 200 + (50 * Math.floor(ctx / 2000)),
      reserved: (1 / 3)
    },
    layers: {
      system_prompt: { soft: false }, // No section-based trimming, only hard truncation
      chat_score: { threshold: 0.6 }, // Cull messages with importance scores < 0.6
      tool_error: { ttl: 3, user_turns: 0 }, // Remove tool errors more than 3 tool calls old this turn
      tool_age: { ttl: 0, user_turns: 1 }, // Remove all tool responses after this turn
      tool_length: { user_turns: 0, max: (3.5 / 20) } // No tool response > 20% context length
    }
  },
  'hungry': {
    max_context_window: 2 ** 14, // 16K
    aggression_level: 'high',
    budget: {
      system_prompt: (1 / 8),
      injection: (1 / 16),
      reserved: (1 / 5)
    },
    layers: {
      system_prompt: { soft: true }, // Enable section-based trimming if possible
      chat_score: { threshold: 0.5 },
      tool_error: { ttl: 0, user_turns: 1 }, // Remove tool errors from previous turns
      tool_age: { ttl: 0, user_turns: 2 }, // Remove tool responses older than the previous turn
      tool_length: { user_turns: 1, max: (3.5 / 20) * 3.5 } // Truncate tools from previous turns
    }
  },
  'healthy': {
    max_context_window: 2 ** 16, // 65K
    aggression_level: 'medium',
    budget: {
      system_prompt: (1 / 8),
      injection: (1 / 8),
      reserved: (1 / 5)
    },
    layers: {
      system_prompt: { soft: true },
      chat_score: { threshold: 0.3 },
      tool_error: { ttl: 0, hint_ttl: 3, user_turns: 1 }, // "hint"-type errors get more TTL
      tool_age: { ttl: 0, user_turns: 3 },
      tool_length: { user_turns: 2, max: (3.5 / 10) }
    }
  },
  'fat': {
    aggression_level: 'low',
    budget: {
      system_prompt: (1 / 8),
      injection: (1 / 8),
      reserved: (1 / 5)
    },
    layers: {
      system_prompt: { soft: true },
      chat_score: { threshold: 0.2 },
      tool_error: { disable: true },
      tool_age: { disable: true },
      tool_length: { user_turns: 3, max: (3.5 / 10) }
    }
  }
};

class Context {
  static BASE_LAYER_CONFIG = {
    system_prompt: { disable: false, user_turns: 0, soft: true },
    chat_score: { disable: false, user_turns: 3, threshold: 0 },
    tool_error: { disable: false, user_turns: 1, ttl: 0, hint_ttl: 0 },
    tool_age: { disable: false, user_turns: 3, ttl: 0 },
    tool_length: { disable: false, user_turns: 0, max: 200 },
  };
  
  config;
  family;
  system_prompt;
  messages;
  budget;
  layer_config;
  
  #messageEstimate = 0;
  get estimates() {
    let ret = {
      context_window: this.config.get('context_window'),
      system_prompt: Context.estimate(this.system_prompt),
      messages: Context.estimate(Context.transcript(this.messages)),
      reserved: this.budget.reserved || 0
    };
    ret.total = ret.system_prompt + ret.messages + ret.reserved;
    return ret;
  }
  
  constructor({ config, system_prompt, messages, budget, layer_config }) {
    this.config = config;
    this.family = Context.family(this.config.get('context_window'));
    this.config.set('context_family', this.family);
    this.config.set('aggression_level', CONTEXT_FAMILIES[this.family].aggression_level);
    this.system_prompt = system_prompt;
    this.messages = messages ? [ ...messages ] : [];
    if (this.messages.length)
      this.#messageEstimate = Context.estimate(Context.transcript(this.messages));
    this.budget = this.getBudget(budget);
  }

  add(...messages) {
    this.#messageEstimate += Context.estimate(Context.transcript(messages));
    this.messages.push(...messages);
  }
  
  async compact(opts) {
    let layers = opts?.layers || [];
    if (!layers || !layers.length || !this.messages.length) return;
    let arg = {
      messages: [ ...(this.messages) ],
      system_prompt: this.system_prompt,
      context_window: this.config.get('context_window'),
      budget: this.budget,
      // TODO: request({ system_prompt, messages }) for one-off
      estimate: (s) => Context.estimate(s),
      transcript: (s) => Context.transcript(s),
      summarize: opts?.summarize ?? (async () => 'Summary')
    }, verbatim, n_layer, layer, i, u, m, r;
    for (n_layer of layers) {
      if (!(layer = Layers[n_layer])) continue;
      arg.config = this.getLayerConfig(n_layer);
      if (arg.config.disable) continue;
      verbatim = null, r = null;
      // Need at least user + call + resp to bother
      if (arg.config.user_turns) {
        if (arg.messages.length > 2) {
          u = 0;
          for (i = arg.messages.length - 1; i >= 0; i--) {
            if (!(m = arg.messages[i])) continue;
            if (m.role === 'user') u++;
            if (u >= arg.config.user_turns) break;
          }
          if (u >= arg.config.user_turns) {
            verbatim = arg.messages.slice(i);
            arg.messages = i ? arg.messages.slice(0, i) : [];
          }
        }
        if (verbatim == null) {
          verbatim = arg.messages;
          arg.messages = [];
        }
      }
      r = (arg.messages.length) ? await layer(arg) : null;
      if (verbatim) {
        if (!r) {
          r = { messages: verbatim }
        } else if (r.messages) {
          r.messages.push(...verbatim);
        }
      }
      Object.assign(arg, (r || undefined));
    }
    this.messages = arg.messages;
    this.system_prompt = arg.system_prompt;
  }
  
  async fork(opts = {}) {
    let f = new Context({
      config: opts.config || this.config,
      system_prompt: opts.system_prompt || this.system_prompt,
      messages: [ ...(opts.messages || this.messages) ],
      budget: opts.budget || this.budget,
      layer_config: opts.layer_config || this.layer_config
    });
    if (opts.layers) await f.compact(opts);
    return f;
  }

  getBudget(overrides) {
    let budget = { ...overrides },
        ctx = this.config.get('context_window'),
        family = CONTEXT_FAMILIES[this.family],
        bname;
    for (bname of Object.keys(family.budget)) {
      if (bname in budget) continue;
      budget[bname] = ctx * this.resolveValue(family.budget[bname]);
    }
    return budget;
  }
  
  getLayerConfig(layerName) {
    let family = CONTEXT_FAMILIES[this.family],
        config = { ...(Context.BASE_LAYER_CONFIG[layerName]) };
    if (family.layers[layerName]) Object.assign(config, family.layers[layerName]);
    if (this.layer_config && layerName in this.layer_config)
      Object.assign(config, this.layer_config[layerName] || undefined);
    for (let opt in config) {
      config[opt] = this.resolveValue(config[opt]);
    }
    return config;
  }

  resolveValue(v) {
    if (typeof v !== 'function') return v;
    return v.call(this, this.config.get('context_window'));
  }
  
  static estimate(s) {
    return Math.ceil(ANSI.measure(s) / 3.5); // rough estimate: 3.5 char/tok
  }
  static transcript(ms) {
    if (!ms || !ms.length) return '';
    return ms.map(m => `${m.role}: ${m.content}`).join('\n');
  }
  static family(ctx_win) {
    let possible = [], name, family;
    for (name of Object.keys(CONTEXT_FAMILIES)) {
      family = CONTEXT_FAMILIES[name];
      if (!family.max_context_window || family.max_context_window >= ctx_win)
        possible.push(name);
    }
    if (possible.length == 0) return null;
    if (possible.length == 1) return possible[0];
    return possible.sort((a, b) => {
      if (!CONTEXT_FAMILIES[a].max_context_window) return 1;
      if (!CONTEXT_FAMILIES[b].max_context_window) return -1;
      return (CONTEXT_FAMILIES[a].max_context_window - CONTEXT_FAMILIES[b].max_context_window);
    })[0];
  }
}

module.exports = Context;