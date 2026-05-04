const { Logger } = require('../util.js');

class Permissions {
  #tree = new Map();  // Map<ToolName, Set<scope>>

  /**
   * Check if a tool request is approved.
   * @param {string} tool - Tool name (e.g., 'Bash', 'Edit')
   * @param {string} scope - The specific request (e.g., 'git commit*', 'src/lib/context.js')
   * @returns {{ allowed: boolean, suggestions: string[] }}
   */
  check(tool, scope) {
    const toolMap = this.#tree.get(tool);
    if (!toolMap) return { allowed: false, suggestions: [], scope };

    // Exact match
    if (toolMap.has(scope)) return { allowed: true, suggestions: [], scope };

    // Prefix match: find existing entries that are prefixes of scope
    const suggestions = [];
    for (const approved of toolMap) {
      if (approved.endsWith('*') && scope.startsWith(approved.slice(0, -1))) {
        suggestions.push(approved);
      }
    }

    return { allowed: false, suggestions, scope };
  }

  /**
   * Approve a scope for a tool.
   * @param {string} tool - Tool name
   * @param {string} scope - The scope to approve
   */
  approve(tool, scope) {
    if (!this.#tree.has(tool)) {
      this.#tree.set(tool, new Set());
    }
    this.#tree.get(tool).add(scope);
    Logger.log(`Permissions: approved ${tool}:${scope}`);
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
   * @param {string} tool - Tool name
   * @param {string} scope - The scope to find parents for
   * @returns {string[]} Array of broader scopes
   */
  findParents(tool, scope) {
    const toolMap = this.#tree.get(tool);
    if (!toolMap) return [];

    return Array.from(toolMap)
      .filter(approved => approved.endsWith('*') && scope.startsWith(approved.slice(0, -1)))
      .slice(0, 5);
  }

  /**
   * Get all approved scopes for a tool.
   * @param {string} tool - Tool name
   * @returns {string[]} Array of approved scopes
   */
  getScopes(tool) {
    const toolMap = this.#tree.get(tool);
    return toolMap ? Array.from(toolMap) : [];
  }

  /**
   * Remove an approved scope.
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
   * Check if a specific scope is approved.
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
    for (const [tool, scopes] of this.#tree) {
      result[tool] = Array.from(scopes);
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
    for (const [tool, scopes] of Object.entries(data || {})) {
      if (Array.isArray(scopes)) {
        for (const scope of scopes) {
          p.approve(tool, scope);
        }
      }
    }
    return p;
  }

  /**
   * Get the number of approved scopes.
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
