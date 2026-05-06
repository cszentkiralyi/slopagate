const { Logger } = require('../util.js');

class Permissions {
  #tree = new Map();  // Map<ToolName, Map<scope, boolean>>

  /**
   * Check if a tool request is approved.
   * @param {string} tool - Tool name (e.g., 'Bash', 'Edit')
   * @param {string} scope - The specific request (e.g., 'git commit*', 'src/lib/context.js')
   * @returns {{ allowed: boolean, suggestions: string[] }}
   */
  check(tool, scope) {
    const toolMap = this.#tree.get(tool);
    if (!toolMap) return { allowed: null, suggestions: [], scope };

    // Exact verdict exists (approved or denied)
    if (toolMap.has(scope)) {
      return { allowed: toolMap.get(scope), suggestions: [], scope };
    }

    // No verdict yet — check for wildcard matches that were actually approved
    const suggestions = [];
    for (const [wildcard, verdict] of toolMap) {
      if (verdict && wildcard.endsWith('*') && scope.startsWith(wildcard.slice(0, -1))) {
        return { allowed: true, suggestions: [], scope: wildcard };
      }
    }

    return { allowed: null, suggestions, scope };
  }

  /**
   * Approve a scope for a tool.
   * @param {string} tool - Tool name
   * @param {string} scope - The scope to approve
   */
  approve(tool, scope) {
    if (!this.#tree.has(tool)) {
      this.#tree.set(tool, new Map());
    }
    this.#tree.get(tool).set(scope, true);
    Logger.log(`Permissions: approved ${tool}:${scope}`);
  }

  /**
   * Deny a scope for a tool.
   * @param {string} tool - Tool name
   * @param {string} scope - The scope to deny
   */
  deny(tool, scope) {
    if (!this.#tree.has(tool)) {
      this.#tree.set(tool, new Map());
    }
    this.#tree.get(tool).set(scope, false);
    Logger.log(`Permissions: denied ${tool}:${scope}`);
  }

  /**
   * Check all tools and scopes for approval.
   * @param {string} scope - Scope string in format "tool:scope"
   * @returns {{ allowed: boolean, suggestions: string[] }}
   */
  checkScope(scope) {
    const [tool, ...scopeParts] = scope.split(':');
    if (!tool || scopeParts.length === 0) {
      return { allowed: false, suggestions: [] };
    }
    return this.check(tool, scopeParts.join(':'));
  }

  /**
   * Find potential broader scopes (prefix matches) for a given scope.
   * Only returns suggestions if no exact verdict exists yet.
   * @param {string} tool - Tool name
   * @param {string} scope - The scope to find parents for
   * @returns {string[]} Array of broader scopes
   */
  findParents(tool, scope) {
    const toolMap = this.#tree.get(tool);
    if (!toolMap) return [];

    // If verdict already decided, no need to suggest parents
    if (toolMap.has(scope)) return [];

    return Array.from(toolMap)
      .filter(([wildcard, verdict]) => verdict && wildcard.endsWith('*') && scope.startsWith(wildcard.slice(0, -1)))
      .slice(0, 5)
      .map(([wildcard]) => wildcard);
  }

  /**
   * Get all scopes with their verdicts for a tool.
   * @param {string} tool - Tool name
   * @returns {string[]} Array of scopes (approved ones only, for backwards compat)
   */
  getScopes(tool) {
    const toolMap = this.#tree.get(tool);
    if (!toolMap) return [];
    return Array.from(toolMap)
      .filter(([, verdict]) => verdict)
      .map(([scope]) => scope);
  }

  /**
   * Remove a scope (regardless of verdict).
   * @param {string} tool - Tool name
   * @param {string} scope - The scope to remove
   */
  remove(tool, scope) {
    const toolMap = this.#tree.get(tool);
    if (toolMap) {
      toolMap.delete(scope);
      if (toolMap.size === 0) this.#tree.delete(tool);
    }
  }

  /**
   * Check if a specific scope has been decided (approved or denied).
   * @param {string} tool - Tool name
   * @param {string} scope - The scope to check
   * @returns {boolean}
   */
  has(tool, scope) {
    const toolMap = this.#tree.get(tool);
    return toolMap ? toolMap.has(scope) : false;
  }

  /**
   * Serialize to a plain object for persistence.
   * @returns {object}
   */
  serialize() {
    const result = {};
    for (const [tool, scopeMap] of this.#tree) {
      result[tool] = Array.from(scopeMap.entries()).map(([scope, verdict]) => ({ scope, verdict }));
    }
    return result;
  }

  /**
   * Deserialize from a serialized object.
   * @param {object} data - The serialized data
   * @returns {Permissions}
   */
  static deserialize(data) {
    const p = new Permissions();
    for (const [tool, entries] of Object.entries(data || {})) {
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (entry.scope != null) {
            const scopeMap = p.#tree.get(tool) || new Map();
            if (!p.#tree.has(tool)) p.#tree.set(tool, scopeMap);
            scopeMap.set(entry.scope, entry.verdict);
          }
        }
      }
    }
    return p;
  }

  /**
   * Get the total number of decided scopes (approved + denied).
   * @returns {number}
   */
  get size() {
    let total = 0;
    for (const scopes of this.#tree.values()) {
      total += scopes.size;
    }
    return total;
  }
}

module.exports = Permissions;
