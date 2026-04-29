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
  get model() { return this.#config.get('model'); }
  get think() { return this.#config.get('think'); }
  get connection() { return this.#config.get('connection'); }
  get systemPrompt() { return this.#systemPrompt; }
  get tempdir() { return this.#tempdir; }
  get temppath() { return this.#tempdir ? this.#tempdir.path : null; }
  
  constructor(props) {
    this.#id = props.id || ID();
    this.#config = props.config || new Map();
    this.tools = props.tools || [];
    
    let ctx_window = this.#config.get('context_window_length');
    this.#masterContext = this.#activeContext = new Context({
      tools: this.tools.reduce((m, t) => {
        m[t.name] = { name: t.name, ttl: t.ttl };
        return m;
      }, {}),
      limits: {
        window: ctx_window,
        tool_age: 5
      },
      budgets: {
        generation: ctx_window ? (ctx_window * 0.2) : 2000
      },
      requestSummary: async (transcript) => {
        let summaryContext = new Context({
          system_prompt: `Please summarize the following conversation history. Preserve all essential context, logic, decisions, and conclusions in a concise form. Output only the summary — no preamble, no extra text.`,
          tools: {},
          limits: {},
          budgets: {},
          messages: [{ role: 'user', content: transcript }]
        });
        let summaryMessage = { role: 'user', content: 'Please summarize the above conversation.' };
        let response = await this.send_private(summaryContext, summaryMessage);
        if (response.message && response.message.content) {
          return response.message.content;
        } else if (response.message && response.message.tool_calls) {
          let txt = response.message.tool_calls[0]?.function?.arguments ?? '';
          if (typeof txt === 'string') {
            try { let p = JSON.parse(txt); return p.summary || txt; } catch { return txt; }
          }
        }
        return null;
      }
    });
    
    this._tempdirPromise = fs.mkdtempDisposable('.sloptmp/');
    
    if (props.systemPrompt) {
      this.#masterContext.system_prompt = props.systemPrompt;
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

  async send_internal(messages, signal)  {
    let payload = {
      model: this.model,
      think: (this.think || false),
      stream: (this.stream || false),
      keep_alive: (this.#config.get('keep_alive') || '5m'),
      num_predict: (this.#config.get('num_predict') || 16384),
      messages: messages,
      tools: this.tools.map(t => t.spec)
    }, responseObj, controller, idx;
    
    if (signal) {
      controller = signal;
    } else {
      controller = new AbortController();
      this.#abortControllers ||= [];
      this.#abortControllers.push(controller);
    }
    
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
      if (!signal
        && this.#abortControllers
        && -1 < (idx = this.#abortControllers.indexOf(controller))) {
        this.#abortControllers.splice(idx, 1);
      }
      return this.normalizeResponse(responseObj);
    }
  }

  async send_private(context, message, signal) {
    return await this.send_internal([
      { role: 'system', content: context.system_prompt },
      ...context.messages,
      message
    ], signal);
  }

  normalizeResponse(response) {
    const provider = this.#config.get('provider') || 'ollama';

    if (provider === 'openai') {
      // This documentation is absolutely atrocious on a 1080p display, whose idea
      // was it to make you scroll all the way to the bottom to see more than a tiny
      // fraction of the response example sidebar?? Absolute clown UX.
      // <https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create>
      //const { usage } = response;
      const usage = (response && response.usage) || {};
      let message = response.choices && response.choices.length
        ? response.choices[0].message
        : null
      if (message && message.tool_calls && message.tool_calls.length) {
        message.tool_calls.forEach(tc => {
          Logger.log(`tc = ${JSON.stringify(tc)}`);
          tc.function.arguments = JSON.parse(tc.function.arguments);
        });
      }
      return {
        error: response.error,
        message: message,
        prompt_eval_count: usage.prompt_tokens,
        eval_count: usage.completion_tokens
      };
    }
    
    return response;
  }

  /**
   * Summarize the oldest portion of context messages using the side channel.
   * Walks messages backwards to find the 3rd user message; everything before it
   * is collected and summarized. Tool call content is replaced with '[Tool response]'.
   * Replaces the collected messages with a single 'user' summary and an
   * assistant acknowledgment, then returns the new Context.
   */
  async summarize(context) {
    let cutoffIdx = context.messages.length;
    let userCount = 0;

    // Walk backwards to find the 3rd user message
    for (let i = context.messages.length - 1; i >= 0; i--) {
      if (context.messages[i].role === 'user') {
        userCount++;
        if (userCount === 3) {
          cutoffIdx = i; // include this message in the summary
          break;
        }
      }
    }

    // Nothing to summarize: fewer than 3 user messages, or cutoffIdx === 0
    if (userCount < 3 || cutoffIdx <= 0) {
      return null;
    }

    // Collect messages from 0..cutoffIdx (inclusive), replacing tool content
    let collected = [];
    for (let i = 0; i <= cutoffIdx; i++) {
      let m = context.messages[i];
      let content = m.content;
      if (m.role === 'tool') {
        content = '[Tool response]';
      }
      collected.push({ ...m, content });
    }

    // Convert to transcript string
    let transcript = collected
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    let summaryContext = new Context({
      system_prompt: `Please summarize the following conversation history. Preserve all essential context, logic, decisions, and conclusions in a concise form. Output only the summary — no preamble, no extra text.`,
      tools: {},
      limits: {},
      budgets: {},
      messages: [{ role: 'user', content: transcript }],
      requestSummary: this.#masterContext.requestSummary
    });

    let summaryMessage = { role: 'user', content: 'Please summarize the above conversation.' };

    let response = await this.send_private(summaryContext, summaryMessage);

    let summaryText = (response.message && response.message.content)
      || (response.message && response.message.tool_calls)
      || (response.message && response.message.content)
      || '';

    // Find the summary text — handle both direct content and tool call arguments
    if (response.message && response.message.content) {
      summaryText = response.message.content;
    } else if (response.message && response.message.tool_calls) {
      summaryText = response.message.tool_calls[0]?.function?.arguments ?? '';
      if (typeof summaryText === 'string') {
        try { summaryText = JSON.parse(summaryText).summary || summaryText; } catch { /* pass */ }
      }
    }

    if (!summaryText) return null;

    // Build the new compacted messages array
    let remaining = context.messages.slice(cutoffIdx + 1);
    let newContext = new Context({
      system_prompt: context.system_prompt,
      tools: { ...context.tools },
      limits: { ...context.limits },
      budgets: { ...context.budgets },
      messages: [
        { role: 'user', content: summaryText },
        { role: 'assistant', content: 'I have the context I need now. Thank you.' },
        ...remaining
      ],
      requestSummary: context.requestSummary
    });

    return newContext;
  }

  async send(...outgoing) {
    if (this.#masterContext !== this.#activeContext)
      this.#masterContext.messages.push(...outgoing);
    this.#activeContext.messages.push(...outgoing);
    
    this.#activeContext = await this.#activeContext.fork({
      layers: [ 'system_prompt', 'tool_age', 'tool_redundancy', 'chat_importance', 'tool_error' ]
    });
    
    return await this.send_internal([
      { role: 'system', content: this.#activeContext.system_prompt },
      ...this.#activeContext.messages
    ]);
  }

  async compact() {
    Logger.log(`Session: compact() called, forking context.`);
    // Replace activeContext with a full compact fork, keeping masterContext history
    let newActive = await this.#activeContext.fork({
      layers: [ 'tool_age', 'tool_redundancy', 'tool_length', 'tool_error', 'chat_summary' ]
    });
    Logger.log(`Session: fork completed.`);
    this.#activeContext = newActive;
    return this.#activeContext;
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