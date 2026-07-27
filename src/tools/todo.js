const Tool = require('./tool.js');
const { Logger, truncate } = require('../util.js');
const Hooks = require('../lib/hooks.js');

class TodoTool extends Tool {
  static MIN_APPROVED_LENGTH = 5;

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
  #lastNudgeType = null;
  #lastNudgeTodosSnapshot = null;
  #nudgeHistory = [];

  #snapshotTodos() {
    return this.#todos.map(i => i.trim()).join('\n');
  }

  #logNudgeResponse(mutationCount) {
    if (this.#lastNudgeTodosSnapshot === null) return;
    const current = this.#snapshotTodos();
    if (current !== this.#lastNudgeTodosSnapshot) {
      Logger.log(`[Todo] nudge response: model acted on ${this.#lastNudgeType} nudge (todos changed, ${mutationCount} mutations since)`);
      this.#nudgeHistory.push({ type: this.#lastNudgeType, responded: true, mutations: mutationCount });
    } else {
      Logger.log(`[Todo] nudge response: model ignored ${this.#lastNudgeType} nudge (${mutationCount} mutations, todos unchanged)`);
      this.#nudgeHistory.push({ type: this.#lastNudgeType, responded: false, mutations: mutationCount });
    }
    this.#lastNudgeTodosSnapshot = null;
  }

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
        const incomplete = this.#todos.filter(item => !/^- \[[xX]\]/.test(item)).length;
        Logger.log(`[Todo] ambient reminder: ${this.#todos.length} total, ${incomplete} incomplete`);
        this.harness.ambientReminder(`[Todo]\n${this.#getCompactList()}`);
      }
    });
    Hooks.on('after_tool_call', this.afterToolCall.bind(this));
    Hooks.on('before_agent_iteration', this.beforeAgentIteration.bind(this));
  }

  normalize() { return null; }

  permissions(args) {
    if (args.mode !== 'edit' || !args.content) {
      return null;
    }
    // Only check permissions when there's no existing list
    if (this.#todos.length > 0) {
      return null;
    }
    const items = this.#parse(args.content);
    if (items.length <= TodoTool.MIN_APPROVED_LENGTH) {
      return null;
    }
    return { scope: this.#getCompactList() };
  }

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

    if (mode === 'edit') {
      this.#todos = this.#parse(args.content);
      this.#mutationCount = 0;
      const nudgeMsg = `Todo list updated:\n${this.#getCompactList()}`;
      Logger.log(`[Todo] nudge: ${nudgeMsg.replace(/\n/g, ' | ')}`);
      this.harness.nudge(nudgeMsg);
      this.#editNudgeGiven = 0;
      this.#nextEditNudgeThreshold = null;
      const allDone = this.#todos.every(item => /^- \[[xX]\]/.test(item));
      if (allDone && this.#todos.length > 0) {
        const nudgeMsg2 = `Todo list is fully completed. Use the ${this.name} tool to uncheck any items that weren't actually finished, or add new items if needed. If accurate, continue.`;
        Logger.log(`[Todo] nudge: ${nudgeMsg2}`);
        this.harness.nudge(nudgeMsg2);
      }
      return `Todo list updated (${this.#todos.length} items).`;
    }

    if (mode === 'view') {
      const result = this.#todos.length > 0
        ? this.#todos.join('\n')
        : '(empty)';
      return result;
    }

    return 'Error: Invalid mode. Use "edit" or "view".';
  }

  static NON_MUTATION_TOOLS = new Set([
    'Read', 'Ls', 'Grep', 'Todo', 'Memory', 'ActivateSkill',
  ]);

  afterToolCall({ toolCall, success }) {
    if (success && !TodoTool.NON_MUTATION_TOOLS.has(toolCall.function.name)) {
      this.#mutationCount++;
      if (this.#lastNudgeTodosSnapshot !== null) {
        this.#logNudgeResponse(this.#mutationCount);
      }
    }
  }

  beforeAgentIteration() {
    if (this.#todos.length > 0) {
      // Have a todo list — nudge to update it
      if (this.#editNudgeGiven >= 2) return;
      if (this.#nextEditNudgeThreshold === null) {
        this.#nextEditNudgeThreshold = this.harness.config.get('todo_edit_threshold');
      }
      if (this.#mutationCount >= this.#nextEditNudgeThreshold) {
        const nudgeMsg = `You've made ${this.#mutationCount} write operations without updating your todo list. Use the ${this.name} tool to update it, then continue.`;
        this.#lastNudgeType = 'edit';
        this.#lastNudgeTodosSnapshot = this.#snapshotTodos();
        Logger.log(`[Todo] nudge: ${nudgeMsg}`);
        this.harness.nudge(nudgeMsg);
        this.#editNudgeGiven++;
        if (this.#editNudgeGiven === 1) {
          this.#nextEditNudgeThreshold *= 2;
        }
      }
    } else {
      // No todo list — nudge to create one
      if (this.#nudgeGiven >= 1) return;
      if (this.#nextNudgeThreshold === null) {
        this.#nextNudgeThreshold = this.harness.config.get('todo_create_threshold');
      }
      if (this.#mutationCount >= this.#nextNudgeThreshold) {
        const nudgeMsg = `You've made ${this.#mutationCount} write operations without setting a todo list. Use the ${this.name} tool to create one, then continue.`;
        this.#lastNudgeType = 'create';
        this.#lastNudgeTodosSnapshot = this.#snapshotTodos();
        Logger.log(`[Todo] nudge: ${nudgeMsg}`);
        this.harness.nudge(nudgeMsg);
        this.#nudgeGiven++;
      }
    }
  }
}

module.exports = TodoTool;
