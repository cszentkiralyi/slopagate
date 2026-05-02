const fs = require('node:fs');
const path = require('node:path');
const Tool = require('./tool.js');
const { Logger } = require('../util.js');

const Memory = require('../lib/memory.js');

class MemoryTool extends Tool {
  name = 'Memory';
  description = `# Memory System — Persistent Storage

Use proactively across conversations. Save: key project facts, architecture decisions, configs, user preferences, recurring patterns, and design rationale. Don't save: transient details, raw code dumps, or info already in SLOP.md/SYSTEM.md.

Best practices: call memory.list() first to avoid duplicates, use memory.read('<file>') before updating, use descriptive names like 'project-config.md', and keep entries concise but complete. Use memory.delete('<file>') to remove outdated or no-longer-relevant memories.`;
  parameters = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'write', 'list', 'search', 'delete'] },
      file: { type: 'string' },
      content: { type: 'array', items: { type: 'string' } },
      query: { type: 'string' }
    },
    required: ['action']
  };

  constructor(props) {
    super(props);
    this.handler = this.handler;
    Object.assign(this, props);
  }

  async handler(args, tool) {
    const memory = new Memory(this.config);
    await memory.init();

    if (args.action === 'read') {
      Logger.log(`Memory action: read ${args.file || '(no file)'}`);
      if (!args.file) {
        return 'Error: Missing file argument';
      }
      const content = memory.read(args.file);
      if (!content) {
        return `Error: File "${args.file}" not found`;
      }
      return content;
    }

    if (args.action === 'write') {
      Logger.log(`Memory action: write ${args.file || '(no file)'}`);
      if (!args.file || !args.content) {
        return 'Error: Missing file or content argument';
      }
      const content = args.content.join('\n');
      memory.write(args.file, content);
      return `Wrote to ${args.file}`;
    }

    if (args.action === 'list') {
      Logger.log(`Memory action: list`);
      const entries = memory.list();
      return entries.length ? entries.map(e => `- ${e.summary} (${e.file})`).join('\n') : 'No memories';
    }

    if (args.action === 'search') {
      Logger.log(`Memory action: search ${args.query || '(no query)'}`);
      if (!args.query) {
        return 'Error: Missing query argument';
      }
      const results = memory.search(args.query);
      return results.length ? results.map(e => `- ${e.summary} (${e.file})`).join('\n') : 'No matches';
    }

    if (args.action === 'delete') {
      Logger.log(`Memory action: delete ${args.file || '(no file)'}`);
      if (!args.file) {
        return 'Error: Missing file argument';
      }
      try {
        memory.delete(args.file);
        return `Deleted ${args.file}`;
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }

    return 'Error: Invalid action. Use read, write, list, search, or delete';
  }

  message(calls) {
    const action = calls[0]?.args?.action || 'unknown';
    return `Memory: 1 ${action}`;
  }
}

module.exports = MemoryTool;