const fs = require('node:fs');
const path = require('node:path');
const Tool = require('./tool.js');
const { Logger } = require('../util.js');

const Memory = require('../lib/memory.js');

class MemoryTool extends Tool {
  name = 'Memory';
  description = `# Memory System — Use Proactively

You are an assistant with a persistent memory system. Use it actively to remember important information across conversations.

## When to save (proactively, without being asked):
- Key project facts: tech stack, architecture decisions, database choices, framework versions
- Important configurations: API endpoints, environment variables, deployment targets, credentials (redacted)
- User preferences: coding style, naming conventions, workflow habits, tools they prefer
- Recurring patterns: common bugs they hit, solutions that worked, gotchas to avoid
- Decisions and their rationale: why something was done a certain way
- Project structure: directory layout, key files, module boundaries

## When NOT to save:
- Transient conversation details that won't be needed later
- Raw code dumps (summarize the intent/pattern instead)
- Information already captured in SLOP.md or SYSTEM.md

## Best practices:
- Call memory.list() first to check for existing entries — update them instead of creating duplicates
- Use memory.read('<file>') to load an existing entry before updating it
- Use descriptive, specific names: 'project-config.md', 'architecture-decision.md', 'user-preferences.md', 'known-issues.md'
- Group related information into a single entry rather than spreading it across many small files
- Each file should have a heading (# Title) followed by organized content
- Keep entries concise but complete enough to be useful without context
- When you learn new information that overlaps with an existing entry, read it first and update it`;
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