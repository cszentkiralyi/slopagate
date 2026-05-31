const fs = require('node:fs/promises');

const { ID, Logger } = require('../util.js');
const Context = require('./context.js');

class Session {
  #id;
  #model;
  config;

  #connection;
  #systemPrompt;
  #promptDoc;
  #tempdir = null;
  
  #masterContext = null;

  #abortController = null;
  #loggedSystemMessage = false;

  turn;

  tools;

  get context() { return this.#masterContext; }
  get history() { return this.#masterContext.messages; }
  get messages() { return this.#masterContext.messages; }
  get id() { return this.#id; }
  get model() { return this.config.get('model'); }
  get think() { return this.config.get('think'); }
  get connection() { return this.config.get('connection'); }
  get systemPrompt() { return this.#systemPrompt; }
  get tempdir() { return this.#tempdir; }
  get temppath() { return this.#tempdir ? this.#tempdir.path : null; }
  get canAbort() { return this.#abortController !== null; }
  
  constructor(props) {
    this.#id = props.id || ID();

    this.config = props.config || new Map();
    this.tools = props.tools || [];
    
    this.#masterContext = new Context({
      config: this.config,
      appendOnly: true,
      summarize: async (t) => this.summarize(t)
    });
    
    this._tempdirPromise = new Promise(async (resolve, reject) => {
     await fs.mkdir('.sloptmp', { recursive: true });
     await fs.mkdtempDisposable('.sloptmp/').then(resolve);
    });
    
    if (props.promptDoc) {
      this.#promptDoc = props.promptDoc;
      this.#masterContext.system_prompt = this.#promptDoc.render(this.config);
    }

    // Load initial messages (for resumed sessions)
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
  
  async send_internal(messages, signal)  {
    messages.forEach((m, idx)=> {
      if (!m || !('content' in m))
        throw new Error(`No message or message content! ${JSON.stringify(m)}, idx, ${JSON.stringify(messages)}`);
    });
    let payload = {
      model: this.model,
      think: (this.think || false),
      stream: (this.stream || false),
      keep_alive: (this.config.get('keep_alive') || '5m'),
      num_predict: (this.config.get('num_predict') || 2 ** 14), // 16K
      thinking_budget_tokens: (this.config.get('reasoning_budget') || 2 ** 18), // 256K
      messages: messages,
      tools: this.tools.map(t => t.spec)
    }, responseObj, controller, idx;
    
    if (this.config.get('provider') === 'openai') {
      if ('think' in payload) {
        payload.chat_template_kwargs = `{"enable_thinking":${payload.think}}`;
      }
    }
    
    if (signal) {
      controller = signal;
    } else {
      this.#abortController = new AbortController();
      controller = this.#abortController;
    }
    
    try {
      /*
      Logger.log(`Session: sending ${JSON.stringify({
        system: this.#masterContext.other_tokens,
        up: this.#masterContext.tokens_up,
        down: this.#masterContext.tokens_down
      })}`);
      */
      let response = await fetch(this.connection, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      responseObj = JSON.parse(await response.text());
    } catch (err) {
      Logger.log(`Session.send_internal response error: ${JSON.stringify(err)}`);
      if (err.name === 'AbortError') {
        responseObj = { role: 'assistant', message: { } };
      }
    } finally {
      return this.normalizeResponse(responseObj);
    }
  }

  async private(context, message, signal) {
    return await this.send_internal([
      { role: 'system', content: context.system_prompt },
      ...context.messages,
      message
    ], signal);
  }

  normalizeResponse(response) {
    const provider = this.config.get('provider') || 'ollama';
    Logger.log(`Session.normalize: ${JSON.stringify(response)}`);

    if (provider === 'openai') {
      // This documentation is absolutely atrocious on a 1080p display, whose idea
      // was it to make you scroll all the way to the bottom to see more than a tiny
      // fraction of the response example sidebar?? Absolute clown UX.
      // <https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create>
      //const { usage } = response;
      const usage = (response && response.usage) || {};
      let message = response && response.choices && response.choices.length
        ? response.choices[0].message
        : null, endThink;
      if (message && message.tool_calls && message.tool_calls.length) {
        // OpenAI gives us JSON strings, instead of parsing automatically like Ollama
        message.tool_calls.forEach(tc => {
          try { tc.function.arguments = JSON.parse(tc.function.arguments); }
          catch { /* keep raw string if parse fails */ }
        });
      }

      // On occasion, we get reasoning='thoughts....</think>main content' instead of
      // having the reasoning & content split across the proper attributes.
      if (typeof message?.reasoning_content === 'string'
          && message.reasoning_content.length
          && (typeof message?.content !== 'string' || !message.content.length)
          && (endThink = message.reasoning_content.indexOf('</think>')) > -1
              && endThink < message.reasoning_content.length - 1 - 7) {
        message.content = message.reasoning_content.slice(endThink + 8);
        message.reasoning_content = message.reasoning_content.slice(0, endThink);
      }
      
      Logger.log(`Session: final message ${JSON.stringify(message)}`);
      
      if (message) message.finish_reason = response.choices[0].finish_reason;

      return {
        error: (response && response.error) ? response.error.message : null,
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

    // TODO
    let summaryContext = new Context({
      config: this.config,
      system_prompt: `Please summarize the following conversation history. Preserve all essential context, logic, decisions, and conclusions in a concise form. Output only the summary — no preamble, no extra text.`,
      tools: {},
      limits: {},
      budgets: {},
      messages: [{ role: 'user', content: transcript }],
      summarize: this.#masterContext.summarize
    });

    let summaryMessage = { role: 'user', content: 'Please summarize the above conversation.' };

    let response = await this.private(summaryContext, summaryMessage);

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
    // TODO
    let remaining = context.messages.slice(cutoffIdx + 1);
    let newContext = new Context({
      config: this.config,
      system_prompt: context.system_prompt,
      tools: { ...context.tools },
      limits: { ...context.limits },
      budgets: { ...context.budgets },
      messages: [
        { role: 'user', content: summaryText },
        { role: 'assistant', content: 'I have the context I need now. Thank you.' },
        ...remaining
      ],
      summarize: context.summarize
    });

    return newContext;
  }

  async send(...outgoing) {
    // Fork from master context
    let forked = await this.#masterContext.fork({
      system_prompt: this.#promptDoc?.render(this.config),
      layers: [
        //'system_prompt',
        'tool_age',
        'tool_error',
        'tool_length',
        'tool_total',
        'chat_score',
        'model_reasoning'
      ]
    });
    
    // Add outgoing messages to forked context
    for (let msg of outgoing) {
      forked.add(msg);
    }
    
    const systemMsg = forked.system_prompt;
    if (!this.#loggedSystemMessage) {
      Logger.log(`Session: system message = ${systemMsg}`);
      this.#loggedSystemMessage = true;
    }
    
    return await this.send_internal([
      { role: 'system', content: systemMsg },
      ...forked.messages
    ]);
  }
  
  
}

module.exports = Session;