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
      query: { type: 'string' },
      summary: { type: 'string' },
      type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'] }
    },
    required: ['action']
  };

  constructor(props) {
    super(props);
    this.handler = this.handler;
    Object.assign(this, props);
  }

  normalize() { return null; }

  async handler(args, tool) {
    const memory = new Memory(tool.config);
    await memory.init();

    const action = args.action || 'unknown';
    tool.message({ state: 'spin', summary: action });

    let result;

    if (args.action === 'read') {
      Logger.log(`Memory action: read ${args.file || '(no file)'}`);
      if (!args.file) {
        result = 'Error: Missing file argument';
      } else {
        const content = memory.read(args.file);
        if (!content) {
          result = `Error: File "${args.file}" not found`;
        } else {
          result = content;
        }
      }
    }

    if (args.action === 'write') {
      Logger.log(`Memory action: write ${args.file || '(no file)'}`);
      if (!args.file || !args.content) {
        result = 'Error: Missing file or content argument';
      } else if (args.type && !['user', 'feedback', 'project', 'reference'].includes(args.type)) {
        result = 'Error: Invalid type. Use user, feedback, project, or reference';
      } else {
        const content = args.content.join('\n');
        memory.write(args.file, content, args.type, args.summary);
        result = `Wrote to ${args.file}`;
      }
    }

    if (args.action === 'list') {
      Logger.log(`Memory action: list`);
      const entries = memory.list();
      result = entries.length ? entries.map(e => `- ${e.summary} (${e.file}) [${e.type || 'uncategorized'}]`).join('\n') : 'No memories';
    }

    if (args.action === 'search') {
      Logger.log(`Memory action: search ${args.query || '(no query)'}`);
      if (!args.query) {
        result = 'Error: Missing query argument';
      } else {
        const results = memory.search(args.query);
        result = results.length ? results.map(e => `- ${e.summary} (${e.file}) [${e.type || 'uncategorized'}]`).join('\n') : 'No matches';
      }
    }

    if (args.action === 'delete') {
      Logger.log(`Memory action: delete ${args.file || '(no file)'}`);
      if (!args.file) {
        result = 'Error: Missing file argument';
      } else {
        try {
          memory.delete(args.file);
          result = `Deleted ${args.file}`;
        } catch (err) {
          result = `Error: ${err.message}`;
        }
      }
    }

    if (!result) {
      result = 'Error: Invalid action. Use read, write, list, search, or delete';
    }

    tool.message({ state: 'done', summary: action });
    return result;
  }
}

module.exports = MemoryTool;