/**
 * Hooks class - a minimal event emitter for tool call interceptors
 * Maintains handlers keyed by hook names with strict insertion order
 */
class Hooks {
  /**
   * @private Map of hook names to arrays of handler functions
   */
  #handlers = new Map();

  /**
   * @private Set of allowed hook names
   */
  #allowedHooks;

  /**
   * @private Check if hook name is allowed
   * @param {string} name - Hook name to validate
   * @returns {boolean}
   */
  #isValidHook(name) {
    return this.#allowedHooks.has(name);
  }

  /**
   * Constructor
   * @param {Object} options - Configuration options
   * @param {string[]} options.hooks - Array of allowed hook names
   */
  constructor({ hooks }) {
    this.#allowedHooks = new Set(hooks);
  }

  /**
   * Register a handler for a hook
   * @param {string} name - Hook name
   * @param {function} fn - Handler function
   */
  on(name, fn) {
    if (!this.#isValidHook(name)) {
      throw new Error(`Invalid hook: ${name}`);
    }
    const handlers = this.#handlers.get(name) || [];
    handlers.push(fn);
    this.#handlers.set(name, handlers);
  }

  /**
   * Register a single-use handler
   * @param {string} name - Hook name
   * @param {function} fn - Handler function
   */
  once(name, fn) {
    if (!this.#isValidHook(name)) {
      throw new Error(`Invalid hook: ${name}`);
    }
    const handlers = this.#handlers.get(name) || [];
    const onceFn = (...args) => {
      fn(...args);
      const index = handlers.indexOf(onceFn);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
    onceFn.__once = true;
    handlers.push(onceFn);
    this.#handlers.set(name, handlers);
  }

  /**
   * Trigger all registered handlers for a hook in insertion order
   * @param {string} name - Hook name
   * @param {...any} args - Arguments to pass to handlers
   */
  emit(name, ...args) {
    if (!this.#isValidHook(name)) {
      throw new Error(`Invalid hook: ${name}`);
    }
    const handlers = this.#handlers.get(name) || [];
    for (const handler of handlers) {
      handler(...args);
    }
  }

  /**
   * Unregister a handler by exact function reference
   * @param {string} name - Hook name
   * @param {function} fn - Handler function to remove
   */
  remove(name, fn) {
    if (!this.#isValidHook(name)) {
      throw new Error(`Invalid hook: ${name}`);
    }
    const handlers = this.#handlers.get(name);
    if (handlers) {
      const index = handlers.indexOf(fn);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }
}

module.exports = Hooks;