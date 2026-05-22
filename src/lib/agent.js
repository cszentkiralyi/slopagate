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
    this.tools = props.tools || [];  // Tool specs to send to model
    this.#abortController = props.abortController || null;
    this.hooks = new Hooks({ hooks: ['message'] });  // Own isolated hooks
    // Accept hooks prop but ignore it - use internal Hooks instance
    if (props.hooks) {
      // Can be extended later to support registering handlers
    }
  }
  
  #abortController;

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
    
    // Fire 'message' hook before adding to context
    this.hooks.emit('message', { role: 'user', content: userMessage });
    
    // Add user message to context
    this.context.messages.push({ role: 'user', content: userMessage });
    
    // Turn loop: send, parse, handle tools, repeat
    let response;
    let content = null;
    let toolResults = null;
    let hasError = false;
    
    do {
      // Send context to model endpoint
      try {
        response = await this.sendToEndpoint(this.context, abortController);
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
      this.context.messages.push({ role: 'assistant', content, tool_calls: toolCalls });

      // If tool calls, execute them and return results for next iteration
      if (toolCalls && toolCalls.length > 0) {
        toolResults = this.callbacks.onToolCalls ? await this.callbacks.onToolCalls(toolCalls) : [];
        this.hooks.emit('message', { role: 'tool', content: JSON.stringify(toolResults) });
        this.context.messages.push({ role: 'tool', content: JSON.stringify(toolResults) });
      }
      
      // Break on error or no more tool calls
      if (hasError || response.error || !toolCalls || toolCalls.length === 0) {
        break;
      }
    } while (true);
    
    return { content, toolResults };
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
      Logger.log(`Agent.sendToEndpoint error: ${err.message || JSON.stringify(err)}`);
      responseObj = { error: err.message || 'Request failed', message: null };
    }
    
    return this.normalizeResponse(responseObj);
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

      if (message && message.reasoning_content.length && !message.content.length) {
        const endThink = message.reasoning_content.indexOf('</think>');
        if (endThink > -1 && endThink < message.reasoning_content.length - 1 - 7) {
          message.content = message.reasoning_content.slice(endThink + 8);
          message.reasoning_content = message.reasoning_content.slice(0, endThink);
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