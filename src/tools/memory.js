const fs = require('node:fs');
const path = require('node:path');
const Tool = require('./tool.js');
const { Logger } = require('../util.js');

const Memory = require('../lib/memory.js');

class MemoryTool extends Tool {
  name = 'Memory';
  description = 'Persistent, LLM-driven memory system for storing and retrieving short contextual knowledge artifacts';
  parameters = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'write', 'list', 'search'] },
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

    return 'Error: Invalid action. Use read, write, list, or search';
  }

  message(calls) {
    const action = calls[0]?.args?.action || 'unknown';
    return `Memory: 1 ${action}`;
  }
}

module.exports = MemoryTool;