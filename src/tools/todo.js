const Tool = require('./tool.js');
const { truncate } = require('../util.js');

class TodoTool extends Tool {
  name = 'Todo';
  nounPlural = 'todos';
  description = `# Todo System — Persistent Task Tracker

Use proactively to track tasks across conversations. Save: action items, multi-step plans, and tasks needing follow-up. Don't save: transient details or info already resolved.

Best practices: call with mode "edit" to set the full list, and "view" to check status. Keep items concise and actionable.`;
  ttl = 5;
  parameters = {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['edit', 'view'] },
      content: { type: 'string' },
    },
    required: ['mode']
  };

  #todos = [];

  constructor(props) {
    super(props);
    Object.assign(this, props);
  }

  normalize() { return null; }

  #getCompactList() {
    if (this.#todos.length === 0) return '(empty)';
    const LIMIT = 70;
    let foundUnchecked = false;
    return this.#todos.map(item => {
      const isUnchecked = !/^- \[[xX]\]/.test(item);
      if (isUnchecked && !foundUnchecked) {
        foundUnchecked = true;
        return item;
      }
      return truncate(item, LIMIT);
    }).join('\n');
  }

  #parse(content) {
    if (!content) return [];
    const lines = content.split('\n');
    let items = [];
    let currentItem = null;
    let started = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if this line starts a new todo item
      if (/^- \[[ xX]\]/.test(trimmed)) {
        // Save previous item if exists
        if (currentItem !== null) {
          items.push(currentItem);
        }
        // Start new item — only begin collecting once we've seen the first item marker
        if (!started) {
          started = true;
        }
        currentItem = trimmed;
      } else if (started && currentItem !== null) {
        // Continuation of the current item — join with a space
        if (trimmed) {
          currentItem += ' ' + trimmed;
        }
      }
    }

    // Don't forget the last item
    if (currentItem !== null) {
      items.push(currentItem);
    }

    return items;
  }

  async handler(args, tool) {
    const mode = args.mode || 'unknown';
    tool.message({ state: 'spin', summary: mode });

    if (mode === 'edit') {
      this.#todos = this.#parse(args.content);
      tool.message({ state: 'done', summary: mode });
      return `Todo list updated (${this.#todos.length} items).`;
    }

    if (mode === 'view') {
      const result = this.#todos.length > 0
        ? this.#todos.join('\n')
        : '(empty)';
      tool.message({ state: 'done', summary: mode });
      return result;
    }

    tool.message({ state: 'done', summary: mode });
    return 'Error: Invalid mode. Use "edit" or "view".';
  }
}

module.exports = TodoTool;