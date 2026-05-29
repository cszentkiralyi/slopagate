const { Logger } = require('../util.js');
const Hooks = require('./hooks.js');

/**
 * Agent - Pure turn loop orchestrator.
 * 
 * Responsibilities:
 * - Manage active context (forked from session's master)
 * - Run the turn loop: send → parse → handle tools → repeat
 * - NO business logic, NO decision-making
 * 
 * @param {Object} props - { context, callbacks?, config }
 */
class Agent {
  constructor(props) {
    this.context = props.context;
    this.callbacks = props.callbacks;
    this.config = props.config;
    this.compact = props.compact || null;
    this.tools = props.tools || [];  // Tool specs to send to model
    this.#abortController = props.abortController || null;
    this.onTokens = props.onTokens || null;
    this.hooks = new Hooks({ hooks: ['message'] });  // Own isolated hooks
    // Accept hooks prop but ignore it - use internal Hooks instance
    if (props.hooks) {
      // Can be extended later to support registering handlers
    }
  }
  
  #abortController;
  #modelResponded = false;

  get modelResponded() { return this.#modelResponded; }

  /**
   * Start a model turn with the given user message.
   * @param {string} userMessage - User's input
   * @param {AbortController} abortController - Optional abort controller
   * @param {Object} context - Optional context (sets this.context if provided)
   * @returns {Promise<Object>} Final result (model content or tool results)
   */
  async startTurn(userMessage, abortController, context) {
    if (context !== null && context !== undefined) {
      this.context = context;
    }
    
    // Reset per-turn
    this.#modelResponded = false;
    
    // Store abort controller so agent.abort() can fire it
    this.#abortController = abortController;
    const startTime = Date.now();
    
    // Fire 'message' hook before adding to context
    this.hooks.emit('message', { role: 'user', content: userMessage });
    
    // Add user message to context
    this.context.add({ role: 'user', content: userMessage });
    
    // Turn loop: send, parse, handle tools, repeat
    let response;
    let content = null;
    let toolResults = null;
    let hasError = false;
    
    do {
      // Send context to model endpoint
      try {
        response = await this.sendToEndpoint(this.context, abortController);
        // Token counts handled by Harness.onModelResponse
      } catch (err) {
        hasError = true;
        Logger.log(`Agent.startTurn request error: ${err.message || JSON.stringify(err)}`);
        response = { error: err.message || 'Request failed', message: null };
      }
      
      // Parse response
      const { content: currentContent, toolCalls } = this.handleResponse(response);
      content = currentContent;
      
      // Add model's single message to context once
      this.callbacks.onModelContent?.(content);
      this.hooks.emit('message', { role: 'assistant', content, tool_calls: toolCalls });
      this.context.add({ role: 'assistant', content, tool_calls: toolCalls });
      
      // Mark that the model has responded — no longer safe to undo user message
      if (!this.#modelResponded) {
        this.#modelResponded = true;
      }

      // If tool calls, execute them and return results for next iteration
      if (toolCalls && toolCalls.length > 0) {
        toolResults = this.callbacks.onToolCalls ? await this.callbacks.onToolCalls(toolCalls) : [];
        this.hooks.emit('message', { role: 'tool', content: JSON.stringify(toolResults) });
        this.context.add({ role: 'tool', content: JSON.stringify(toolResults) });
        
        // Compact after tool results to prevent context from filling up
        // with large tool responses before the next model call
        /*
        if (this.compact) {
          this.context = await this.compact(this.context);
        }
        */
      }
      
      // Break on error, no more tool calls, or abort signal
      if (hasError || response.error || !toolCalls || toolCalls.length === 0) {
        break;
      }
      if (this.#abortController?.signal.aborted) {
        break;
      }
    } while (true);
    
    return { content, toolResults, aborted: !!this.#abortController?.signal.aborted, duration: Date.now() - startTime };
  }

  /**
   * Send context to model endpoint.
   * @param {Object} context - Current context
   * @param {AbortSignal} signal - Optional abort signal
   * @returns {Promise<Object>} Model response
   */
  async sendToEndpoint(context, signal) {
    const provider = this.config.get('provider') || 'ollama';
    const connection = this.config.get('connection');
    const model = this.config.get('model');
    const think = this.config.get('think') || false;
    const stream = this.config.get('stream') || false;
    const keep_alive = this.config.get('keep_alive') || '5m';
    const num_predict = this.config.get('num_predict') || 2 ** 14;
    const reasoning_budget = this.config.get('reasoning_budget') || 2 ** 18;
    const tools = (this.tools || []).map(t => t.spec);
    
    let payload = {
      model: model,
      think: think,
      stream: stream,
      keep_alive: keep_alive,
      num_predict: num_predict,
      thinking_budget_tokens: reasoning_budget,
      messages: [
        { role: 'system', content: context.system_prompt },
        ...context.messages
      ],
      tools: tools
    };
    
    if (provider === 'openai') {
      if ('think' in payload) {
        payload.chat_template_kwargs = `{"enable_thinking":${payload.think}}`;
      }
    }
    
    let responseObj;
    try {
      // Use provided signal or create new AbortController
      const controller = signal || new AbortController();
      responseObj = await fetch(connection, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      responseObj = JSON.parse(await responseObj.text());
    } catch (err) {
      const errorDetails = {
        message: err.message,
        stack: err.stack,
        provider: provider,
        connection: connection,
        model: model,
        errorType: err.constructor.name,
        isAbort: err.name === 'AbortError'
      };
      Logger.log(`Agent.sendToEndpoint error: ${JSON.stringify(errorDetails)}`);
      responseObj = { error: err.message || 'Request failed', message: null };
    }
    
    let normalized = this.normalizeResponse(responseObj);
    
    // Emit token counts to harness
    let tokensUp = normalized.prompt_eval_count
        ?? normalized.usage?.prompt_tokens
        ?? responseObj?.usage?.prompt_tokens
        ?? 0;
    let tokensDown = normalized.eval_count
        ?? normalized.usage?.completion_tokens
        ?? responseObj?.usage?.completion_tokens
        ?? 0;
    this.onTokens?.({ inputTokens: tokensUp, outputTokens: tokensDown });
    
    return normalized;
  }

  /**
   * Parse XML-like tool call tags from model output text.
   * Handles format: <function=toolName><parameter=arg>val</parameter></function>
   * Returns array of {id, type, function: {name, arguments}} objects.
   */
  #parseXmlToolCalls(text) {
    const results = [];
    if (typeof text !== 'string') return results;

    const tagRegex = /<function=(\w+)>([\s\S]*?)<\/function>/g;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      const name = match[1];
      const inner = match[2].trim();

      if (!name) continue;

      const params = {};
      const paramRegex = /<parameter=(\w+)>([\s\S]*?)<\/parameter>/g;
      let pm;
      while ((pm = paramRegex.exec(inner)) !== null) {
        params[pm[1]] = pm[2].trim();
      }

      let argumentsObj = params;
      if (Object.keys(params).length === 1 && params.arguments) {
        try { argumentsObj = JSON.parse(params.arguments); } catch { /* keep as string */ }
      }

      results.push({
        id: crypto.randomUUID(),
        type: 'function',
        function: { name, arguments: argumentsObj }
      });
    }

    return results;
  }

  normalizeResponse(response) {
    const provider = this.config.get('provider') || 'ollama';
    Logger.log(`Session.normalize: ${JSON.stringify(response)}`);

    if (provider === 'openai') {
      const usage = (response && response.usage) || {};
      let message = response && response.choices && response.choices.length
        ? response.choices[0].message
        : null;
      if (message && message.tool_calls && message.tool_calls.length) {
        message.tool_calls.forEach(tc => {
          try { tc.function.arguments = JSON.parse(tc.function.arguments); }
          catch { /* keep raw string if parse fails */ }
        });
      }

      if (message?.reasoning_content?.length && !message?.content?.length) {
        const endThink = message.reasoning_content.indexOf('</think>');
        if (endThink > -1 && endThink < message.reasoning_content.length - 1 - 7) {
          message.content = message.reasoning_content.slice(endThink + 8);
          message.reasoning_content = message.reasoning_content.slice(0, endThink);
        }
      }

      // Sometimes the model embeds tool calls as XML in reasoning_content or content
      // instead of having the inference engine parse them into tool_calls. Extract and convert.
      if (!message.tool_calls) {
        for (const field of ['reasoning_content', 'content']) {
          if (message[field]) {
            const xmlCalls = this.#parseXmlToolCalls(message[field]);
            if (xmlCalls.length) {
              message.tool_calls = xmlCalls;
              // Remove the XML tool calls from the text content to avoid duplication
              message[field] = message[field].replace(/<function=\w+>[\s\S]*?<\/function>/g, '').trim();
              break;
            }
          }
        }
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
   * Handle model response.
   * @param {Object} response - Raw model response
   * @returns {Object} { content, toolCalls }
   */
  handleResponse(response) {
    let message = response.message;
    
    let content = null;
    let toolCalls = [];
    
    if (message && message.content) {
      content = message.content;
    }
    if (message && message.tool_calls && message.tool_calls.length) {
      toolCalls = message.tool_calls
        .filter(tc => tc.function && tc.function.name)
        .map(tc => ({
          type: 'function',
          id: tc.id,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        }));
    }
    
    return { content, toolCalls };
  }

 
  
  /**
   * Abort the current model turn.
   */
  abort() {
    this.#abortController?.abort();
  }
}

module.exports = Agent;