/**
 * Hooks - a global event emitter for cross-module communication.
 *
 * Design:
 * - Single shared instance exported as a module.
 * - No whitelist: any module can register or emit any hook name.
 * - Handlers run in insertion order.
 *
 * Public API:
 *   Hooks.on(name, fn)          — subscribe
 *   Hooks.once(name, fn)        — subscribe, auto-remove after first call
 *   Hooks.off(name, fn)         — unsubscribe
 *   Hooks.emit(name, ...args)   — fire synchronously
 *   Hooks.emitWithResults(name, ...args) -> any[]  — fire, collect sync results
 *   Hooks.emitWithResultsAsync(name, ...args) -> Promise<any[]>  — fire, collect async results
 */
const handlers = new Map();

function getHandlers(name) {
  if (!handlers.has(name)) {
    handlers.set(name, []);
  }
  return handlers.get(name);
}

const Hooks = {
  /**
   * Register a handler for a hook.
   * @param {string} name - Hook name
   * @param {function} fn - Handler function
   */
  on(name, fn) {
    getHandlers(name).push(fn);
  },

  /**
   * Register a single-use handler.
   * @param {string} name - Hook name
   * @param {function} fn - Handler function
   */
  once(name, fn) {
    const onceFn = (...args) => {
      fn(...args);
      const h = getHandlers(name);
      const index = h.indexOf(onceFn);
      if (index > -1) h.splice(index, 1);
    };
    onceFn.__once = true;
    getHandlers(name).push(onceFn);
  },

  /**
   * Unregister a handler by exact function reference.
   * @param {string} name - Hook name
   * @param {function} fn - Handler function to remove
   */
  off(name, fn) {
    const h = getHandlers(name);
    const index = h.indexOf(fn);
    if (index > -1) h.splice(index, 1);
  },

  /**
   * Trigger all registered handlers for a hook in insertion order.
   * @param {string} name - Hook name
   * @param {...any} args - Arguments to pass to handlers
   */
  emit(name, ...args) {
    for (const handler of getHandlers(name)) {
      handler(...args);
    }
  },

  /**
   * Trigger all registered handlers for a hook, collecting results.
   * @param {string} name - Hook name
   * @param {...any} args - Arguments to pass to handlers
   * @returns {any[]} Array of handler return values
   */
  emitWithResults(name, ...args) {
    const results = [];
    for (const handler of getHandlers(name)) {
      results.push(handler(...args));
    }
    return results;
  },

  /**
   * Trigger all registered handlers for a hook, collecting results asynchronously.
   * @param {string} name - Hook name
   * @param {...any} args - Arguments to pass to handlers
   * @returns {Promise<any[]>} Array of handler return values
   */
  async emitWithResultsAsync(name, ...args) {
    const results = [];
    for (const handler of getHandlers(name)) {
      results.push(await handler(...args));
    }
    return results;
  },
};

module.exports = Hooks;