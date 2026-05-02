const Memory = require('./memory.js');
const Context = require('./context.js');

class Trigger {
  constructor(options) {
    this.name = options.name || 'unnamed';
    this.pattern = options.pattern;
    this.priority = options.priority || 0;
  }

  test(message) {
    const msg = message.content || message;
    return typeof this.pattern === 'string' 
      ? msg.toLowerCase().includes(this.pattern.toLowerCase())
      : this.pattern.test(msg);
  }

  async execute(harness, message) {
    // Base execute method - overridden by subclasses
    return false;
  }
}

class CompactTrigger extends Trigger {
  constructor(options = {}) {
    super({
      ...options,
      name: 'compact',
      pattern: /\bcompact\b|\bsummarize\s+context\b|\bclear\s+context\b/i,
      priority: 100
    });
  }

  async execute(harness, message) {
    // Check if context is actually getting large
    const est = harness.session.context.estimates;
    const total = est.system_prompt + est.messages + est.reserved;
    const win = est.context_window;
    
    if (total / win > 0.85) {
      await harness.compactCommand();
      harness.emitCommandMessage('Auto-compact triggered by context pressure.');
      return true;
    }
    return false;
  }
}

class MemorySaveTrigger extends Trigger {
  constructor(options = {}) {
    super({
      ...options,
      name: 'memory:save',
      // Broader trigger patterns per TODO.md spec
      pattern: /\b(remember\s+(?:that|:|this|)|note\s+(?:that|:|this|)|save\s+(?:this|for\s+later)|keep\s+in\s+mind|important:|don't\s+forget)\s*/i,
      priority: 90
    });
  }

  async execute(harness, message) {
    try {
      const memory = new Memory(harness.config);
      await memory.init();
      
      // Extract content to save (everything after the trigger phrase)
      const content = message.content.replace(this.pattern, '').trim();
      
      if (!content || content.length < 5) {
        harness.emitCommandMessage('Nothing to save. Please provide context to remember.');
        return false;
      }
      
      // Generate a descriptive filename based on content
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      // Create a simple descriptive name from the first few meaningful words
      const words = content.split(/\s+/).filter(w => w.length > 3);
      const namePrefix = words.slice(0, 3).join('-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
      const filename = `memory_${namePrefix || dateStr}_${now.getHours()}h${now.getMinutes()}m.md`;
      
      // Create a summary heading from the content
      const heading = `# ${content.split('\n')[0].substring(0, 60)}`;
      memory.write(filename, `${heading}\n\n${content}`);
      
      // Auto-save notification: "Memory: saved as '<filename>' — <first line>"
      const firstLine = content.split('\n')[0].substring(0, 80);
      harness.emitCommandMessage(`Memory: saved as '${filename}' — ${firstLine}`);
      return true;
    } catch (error) {
      harness.emitCommandMessage(`Memory save failed: ${error.message}`);
      return false;
    }
  }
}

class MemorySearchTrigger extends Trigger {
  constructor(options = {}) {
    super({
      ...options,
      name: 'memory:search',
      pattern: /\bsearch.*memory\b|\bfind.*memory\b|\blook\s+up.*memory\b/i,
      priority: 80
    });
  }

  async execute(harness, message) {
    try {
      const memory = new Memory(harness.config);
      await memory.init();
      
      // Extract search query from message
      const query = message.content.replace(/\bsearch.*memory\b|\bfind.*memory\b|\blook\s+up.*memory\b/i, '').trim();
      
      if (!query) {
        harness.emitCommandMessage('Please provide a search query, e.g., "search memory for API keys"');
        return true;
      }
      
      const results = memory.search(query);
      if (results.length === 0) {
        harness.emitCommandMessage(`No memories found for "${query}"`);
      } else {
        harness.emitCommandMessage(`Found ${results.length} memories for "${query}":\n${results.map(r => `- ${r.summary} (${r.file})`).join('\n')}`);
      }
      return true;
    } catch (error) {
      harness.emitCommandMessage(`Memory search failed: ${error.message}`);
      return false;
    }
  }
}

class AutoRecapTrigger extends Trigger {
  constructor(options = {}) {
    super({
      ...options,
      name: 'recap',
      pattern: /\brecap\b|\bwhat.*we.*talking.*about\b|\bremind.*me\b/i,
      priority: 70
    });
  }

  async execute(harness, message) {
    await harness.recap();
    return true;
  }
}

class BugTrigger extends Trigger {
  constructor(options = {}) {
    super({
      ...options,
      name: 'bug',
      pattern: /\bbug\s+:\s*\S/i,
      priority: 60
    });
  }

  async execute(harness, message) {
    const match = message.content.match(/\bbug\s+:\s*(.+)/i);
    if (match) {
      await harness.bugCommand(match[1].trim());
      return true;
    }
    return false;
  }
}

// Create a default set of triggers
const DEFAULT_TRIGGERS = [
  new CompactTrigger({ priority: 100 }),
  new MemorySaveTrigger({ priority: 90 }),
  new MemorySearchTrigger({ priority: 80 }),
  new AutoRecapTrigger({ priority: 70 }),
  new BugTrigger({ priority: 60 })
];

// Default triggers for between-respond (context pressure compaction)
const BETWEEN_RESPOND_TRIGGERS = [
  new CompactTrigger({ name: 'compact:pressure', pattern: null, priority: 100 })
];

// Default triggers for after-respond (cleanup, etc.)
const AFTER_RESPOND_TRIGGERS = [];

class Triggers {
  constructor(options = {}) {
    this.byEvent = {
      'before-send': options.triggers ? options.triggers.filter(t => t.eventType === 'before-send') : DEFAULT_TRIGGERS,
      'between-respond': options.betweenTriggers ? options.betweenTriggers : BETWEEN_RESPOND_TRIGGERS,
      'after-respond': options.afterTriggers ? options.afterTriggers : AFTER_RESPOND_TRIGGERS
    };
  }

  /**
   * Check triggers for an event type.
   * @param {string} eventType - One of: before-send, between-respond, after-respond
   * @param {object} context - { harness?, message?, session?, response?, config? }
   * @returns {object|null} - { cancelled, error, response } or null if no triggers matched/fired
   */
  async check(eventType, context) {
    const triggers = this.byEvent[eventType] || [];
    const harness = context.harness || context.session; // backward compat
    
    // Sort by priority (higher first)
    const sorted = [...triggers].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const trigger of sorted) {
      // For before-send, test pattern against message
      if (eventType === 'before-send' && context.message) {
        if (!trigger.test(context.message.content || context.message)) {
          continue; // pattern didn't match, skip this trigger
        }
      }

      // For between-respond/after-respond, check if trigger should run
      if (eventType === 'between-respond' && trigger.pattern) {
        // If trigger has a pattern but we're in between-respond, only run if pattern matches
        // or if the trigger has no pattern (like compact:pressure)
        if (trigger.pattern && context.message) {
          if (!trigger.test(context.message.content || context.message)) {
            continue;
          }
        }
      }

      try {
        const result = await trigger.execute(harness, context);
        if (result === true || result === 'cancelled') {
          return { cancelled: true };
        }
        if (typeof result === 'string') {
          return { response: result };
        }
        if (result && typeof result === 'object') {
          if (result.cancelled) return result;
          if (result.response) return result;
        }
      } catch (err) {
        return { cancelled: true, error: err };
      }
    }
    return null;
  }
}

module.exports = {
  Triggers,
  Trigger,
  CompactTrigger,
  MemorySaveTrigger,
  MemorySearchTrigger,
  AutoRecapTrigger,
  BugTrigger,
  DEFAULT_TRIGGERS,
  BETWEEN_RESPOND_TRIGGERS,
  AFTER_RESPOND_TRIGGERS
};