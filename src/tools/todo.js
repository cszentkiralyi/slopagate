const Tool = require('./tool.js');
const { truncate } = require('../util.js');
const Hooks = require('../lib/hooks.js');

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
  #mutationCount = 0;
  #nextNudgeThreshold = null;
  #nudgeGiven = 0;
  #nextEditNudgeThreshold = null;
  #editNudgeGiven = 0;

  constructor(props) {
    super(props);
    Object.assign(this, props);
    Hooks.on('before_user_message', () => {
      if (this.#todos.length > 0) {
        // Auto-clear if every item is checked off
        const allDone = this.#todos.every(item => /^- \[[xX]\]/.test(item));
        if (allDone) {
          this.#todos = [];
          return;
        }
        const compactList = this.#getCompactList();
        this.ambientReminder(`[Todo]\n${compactList}`);
      }
    });
    Hooks.on('before_tool_call', this.beforeToolCall.bind(this));
    Hooks.on('before_agent_iteration', this.beforeAgentIteration.bind(this));
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
      this.#mutationCount = 0;
      tool.message({ state: 'done', summary: mode });
      this.harness.nudge(`Todo list updated:\n${this.#getCompactList()}`);
      this.#editNudgeGiven = 0;
      this.#nextEditNudgeThreshold = null;
      const allDone = this.#todos.every(item => /^- \[[xX]\]/.test(item));
      if (allDone && this.#todos.length > 0) {
        this.harness.nudge(`Todo list is fully completed. You can use the ${this.name} tool to uncheck any items that weren't actually finished, or add new items if needed. If accurate, continue.`);
      }
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

  static NON_MUTATION_TOOLS = new Set([
    'Read', 'Ls', 'Grep', 'Todo', 'Memory', 'ActivateSkill',
  ]);

  beforeToolCall({ toolCall }) {
    if (!TodoTool.NON_MUTATION_TOOLS.has(toolCall.function.name)) {
      this.#mutationCount++;
    }
  }

  beforeAgentIteration() {
    if (this.#todos.length > 0) {
      // Have a todo list — nudge to update it
      if (this.#editNudgeGiven >= 2) return;
      if (this.#nextEditNudgeThreshold === null) {
        this.#nextEditNudgeThreshold = this.config.get('todo_edit_threshold');
      }
      if (this.#mutationCount >= this.#nextEditNudgeThreshold) {
        this.harness.nudge(`You've made ${this.#mutationCount} write operations without updating your todo list. Consider editing it to reflect what's been done.`);
        this.#editNudgeGiven++;
        if (this.#editNudgeGiven === 1) {
          this.#nextEditNudgeThreshold *= 2;
        }
      }
    } else {
      // No todo list — nudge to create one
      if (this.#nudgeGiven >= 1) return;
      if (this.#nextNudgeThreshold === null) {
        this.#nextNudgeThreshold = this.config.get('todo_create_threshold');
      }
      if (this.#mutationCount >= this.#nextNudgeThreshold) {
        this.harness.nudge(`You've made ${this.#mutationCount} write operations without setting a todo list. Consider creating one to track your work.`);
        this.#nudgeGiven++;
      }
    }
  }
}

module.exports = TodoTool;