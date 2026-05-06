const { Logger } = require('../util.js');
const ANSI = require ('./ansi.js');
const Layers = require('./layers/layers.js');

const CONTEXT_CONFIGS = {
  low: {
    max_context_window: null, // no upper limit — fallback
    tool_output_limit: 20,
    tool_line_limit: 256,
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
      tool_length: { user_turns: 3, max: (1 / 10) },
      tool_total: { disable: true },
      model_reasoning: { user_turns: 2, ttl: 8 }
    }
  },
  medium: {
    max_context_window: 2 ** 16, // 65K
    tool_output_limit: 20,
    tool_line_limit: 256,
    budget: {
      system_prompt: (1 / 8),
      injection: (1 / 8),
      reserved: (1 / 5)
    },
    layers: {
      system_prompt: { soft: true },
      chat_score: { threshold: 0.25 },
      tool_error: { ttl: 0, hint_ttl: 3, user_turns: 1 }, // "hint"-type errors get more TTL
      tool_age: { ttl: 0, user_turns: 3 },
      tool_length: { user_turns: 2, max: (1 / 10) },
      tool_total: { max: (1 / 4) },
      model_reasoning: { user_turns: 1, ttl: 4 }
    }
  },
  high: {
    max_context_window: 2 ** 14, // 16K
    tool_output_limit: 20,
    tool_line_limit: 256,
    budget: {
      system_prompt: (1 / 8),
      injection: (1 / 16),
      reserved: (1 / 5)
    },
    layers: {
      system_prompt: { soft: true }, // Enable section-based trimming if possible
      chat_score: { threshold: 0.4 },
      tool_error: { ttl: 0, user_turns: 1 }, // Remove tool errors from previous turns
      tool_age: { ttl: 0, user_turns: 2 }, // Remove tool responses older than the previous turn
      tool_length: { user_turns: 1, max: (1 / 20) }, // Truncate tools from previous turns
      tool_total: { max: (1 / 4) },
      model_reasoning: { user_turns: 0, ttl: 8 }
    }
  },
  xhigh: {
    max_context_window: 2 ** 13, // 8K
    tool_output_limit: 20,
    tool_line_limit: 256,
    budget: {
      system_prompt: (ctx) => 500 * (1 + Math.floor(ctx / 2000)),
      injection: (ctx) => 200 + (50 * Math.floor(ctx / 2000)),
      reserved: (1 / 3)
    },
    layers: {
      system_prompt: { soft: false }, // No section-based trimming, only hard truncation
      chat_score: { threshold: 0.5 }, // Cull messages with importance scores < 0.6
      tool_error: { ttl: 3, user_turns: 0 }, // Remove tool errors more than 3 tool calls old this turn
      tool_age: { ttl: 0, user_turns: 1 }, // Remove all tool responses after this turn
      tool_length: { user_turns: 0, max: (1 / 20) }, // No tool response > 20% context length
      tool_total: { max: (1 / 2) },
      model_reasoning: { user_turns: 0, ttl: 4 }
    }
  }
};

class Context {
  static BASE_LAYER_CONFIG = {
    system_prompt: { disable: false, user_turns: 0, soft: true },
    chat_score: { disable: false, user_turns: 3, min_messages: 20, threshold: 0 },
    tool_error: { disable: false, user_turns: 1, ttl: 0, hint_ttl: 0 },
    tool_age: { disable: false, user_turns: 3, ttl: 0 },
    tool_length: { disable: false, user_turns: 0, max: 200 },
    tool_total: { disable: false, user_turns: 0, max: 0.05 },
    model_reasoning: { disable: false, user_turns: 1, ttl: 0 }
  };
  
  config;
  aggression_level;
  system_prompt;
  messages;
  budget;
  layer_config;
  
  #messageEstimate = 0;
  #appendOnly = false;
  get estimates() {
    let ret = {
      context_window: this.config.get('context_window'),
      system_prompt: Context.estimate(this.system_prompt),
      messages: Context.estimate(Context.transcript(this.messages)),
      reserved: this.budget.reserved || 0
    };
    ret.total = ret.system_prompt + ret.messages + ret.reserved;
    // TODO: fix how we get this everywhere we're calculating it manually
    ret.saturation = ret.total / ret.context_window;
    return ret;
  }
  
  constructor(options = {}) {
    this.config = options.config || new Config();
    let aggression = options.aggression_level || this.config.get('aggression_level');
    if (!aggression) {
      aggression = Context.aggressionLevel(this.config.get('context_window'));
      this.config.set('aggression_level', aggression);
    }
    this.aggression_level = aggression;
    this.system_prompt = options.system_prompt || '';
    this.messages = options.messages ? [ ...options.messages ] : [];
    if (this.messages.length)
      this.#messageEstimate = Context.estimate(Context.transcript(this.messages));
    this.budget = this.getBudget(options.budget);
    this.layer_config = options.layer_config || {};
    this.#appendOnly = options.appendOnly ?? false;
  }

  add(...messages) {
    this.#messageEstimate += Context.estimate(Context.transcript(messages));
    this.messages.push(...messages);
  }
  
  async compact(opts) {
    if (this.#appendOnly) throw new Error('Cannot compact an append-only context');
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
    }, saturation = this.estimates.saturation,
      verbatim, n_layer, layer, i, u, m, r;
    //Logger.log(`compact: Starting with ${this.messages.length} messages`);
    for (n_layer of layers) {
      if (!(layer = Layers[n_layer])) continue;
      arg.config = this.getLayerConfig(n_layer);
      if (arg.config.disable) continue;
      if (saturation < (arg.config.saturation || 0)) continue;
      if (arg.messages.length < (arg.config.min_messages || 0)) continue;
      //Logger.log(`compact: running layer ${n_layer}`);
      verbatim = null, r = null;
      // Need at least user + call + resp to bother
      if (arg.config.user_turns) {
        if (arg.messages.length >= arg.config.user_turns) {
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
      try {
        r = (arg.messages.length) ? await layer(arg) : null;
      } catch (ex) {
        Logger.log(`compact: layer ${n_layer} threw error ${JSON.stringify(ex)}`);
        r = null;
      }
      //Logger.log(`compact: layer ${n_layer} sent ${arg.messages.length}, kept ${verbatim ? verbatim.length : 0} verbatim, got ${r?.messages?.length ?? 0}`);
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
        config = CONTEXT_CONFIGS[this.aggression_level],
        bname;
    for (bname of Object.keys(config.budget)) {
      if (bname in budget) continue;
      budget[bname] = ctx * this.resolveValue(config.budget[bname]);
    }
    return budget;
  }
  
  getLayerConfig(layerName) {
    let config = CONTEXT_CONFIGS[this.aggression_level],
        layer_config = { ...(Context.BASE_LAYER_CONFIG[layerName]) };
    if (config.layers[layerName]) Object.assign(layer_config, config.layers[layerName]);
    if (this.layer_config && layerName in this.layer_config)
      Object.assign(layer_config, this.layer_config[layerName] || undefined);
    for (let opt in layer_config) {
      layer_config[opt] = this.resolveValue(layer_config[opt]);
    }
    return layer_config;
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
  static aggressionLevel(ctx_win) {
    const levels = Object.entries(CONTEXT_CONFIGS)
      .filter(([, cfg]) => cfg.max_context_window !== null)
      .sort((a, b) => a[1].max_context_window - b[1].max_context_window);

    for (let [level, cfg] of levels) {
      if (ctx_win <= cfg.max_context_window)
        return level;
    }
    // fall back to lowest aggression level (no limit)
    return 'low';
  }
}

module.exports = Context;