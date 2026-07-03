/* Runs shell commands with permission checking */
const { exec } = require('node:child_process');

const parseBash = require('../lib/bash-parser.js');
const { Logger, truncate } = require('../util.js');

const Tool = require('./tool.js');

class BashTool extends Tool {
  name = 'Bash';
  nounPlural = 'commands';
  description = 'Execute a limited set of shell commands: ';
  readonly = false;
  parameters = {
    type: 'object',
    properties: {
      command: { type: 'string' }
    },
    required: ['command']
  };

  static SAFE_BASH_CMDS = [
    //{ pattern: 'npm run test', readonly: false },
    { pattern: 'node --test *', readonly: false },
    { pattern: 'git log *', readonly: true },
    { pattern: 'git show*', readonly: true },
    { pattern: 'git status*', readonly: true },
    { pattern: 'git diff*', readonly: true },
    { pattern: 'git add *', readonly: false },
    { pattern: 'git reset *', readonly: false },
    { pattern: 'git commit *', readonly: false },
    { pattern: 'pwd', readonly: true },
    //{ pattern: 'echo*', readonly: false },
    //{ pattern: 'awk*', readonly: false }
  ];
  
  static TOOL_HINTS = [
    { pattern: 'cat <<*', hint: 'Edit' },
    { pattern: 'sed *', hint: 'Edit' },
    { pattern: 'cat *', hint: 'Read' },
    { pattern: 'head *', hint: 'Read' },
    { pattern: 'tail *', hint: 'Read' },
    { pattern: 'ls*', hint: 'Glob' },
    { pattern: 'find *', hint: 'Glob' },
    { pattern: 'grep *', hint: 'Search' },
  ];

  constructor(props) {
    super(props);
    Object.assign(this, props);
    
    let base_cmds = new Set();
    BashTool.SAFE_BASH_CMDS.map(c => c.pattern.split(' ')[0]).forEach(c => base_cmds.add(c));
    this.description += Array.from(base_cmds.values()).sort().join(', ');
  }

  permissionGate(command) {
    return BashTool.SAFE_BASH_CMDS.some(({ pattern, readonly }) => {
      if (this.readonly && !readonly) return false;
      if (pattern.endsWith('*')) {
        return command.startsWith(pattern.substring(0, pattern.length - 1));
      }
      return command === pattern;
    });
  }
  
  toolHint(command) {
    return BashTool.TOOL_HINTS.find(({ pattern }) => {
      if (pattern.endsWith('*'))
        return command.startsWith(pattern.substring(0, pattern.length - 1));
      return command === pattern;
    });
  }

  async handler(args, tool) {
    const { command } = args;
    const parsed = parseBash(command);
    if (parsed.commands.length === 0) return '';

    // Gate: reject if any sub-command fails
    for (const cmd of parsed.commands) {
      if (!this.permissionGate(cmd.raw)) {
        return `Error: command "${cmd.raw.split(' ')[0]}" not allowed.`;
      }
    }

    let summary = truncate(command.replaceAll('\n', '\\n'), 50);
    tool.message({ state: 'spin', summary });

    let maxLines = this.config.get('tool_output_limit') || 50;
    let maxLineLen = this.config.get('tool_line_limit') || 256;

    let p = new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (stderr) {
          // Command ran but returned error output in stderr
          Logger.log(`BashTool: Command "${command}" returned error: ${stderr.trim()}`);
          resolve(stderr.trim());
        } else {
          let output = (stdout || '')
              .trim()
              .split('\n');
          // Truncate each line to maxLineLen chars
          output = output.map(line => truncate(line, maxLineLen));
          let sliced = output.slice(0, maxLines);
          let missing = output.length - sliced.length;
          if (missing) sliced.push(`...and ${missing} more.`);
          resolve(sliced.join('\n'));
        }
      });
    });
    let result = await p;
    tool.message({ state: 'done', summary });
    return result;
  }

  normalize(args) {
    if (!args || !args.command) return null;
    return [args.command];
  }

  permissions(args) {
    const { command } = args;
    const parsed = parseBash(command);
    if (parsed.commands.length === 0) return null;

    const results = [];
    for (const cmd of parsed.commands) {
      const raw = cmd.raw;

      if (!this.permissionGate(raw)) {
        let hintMatch = this.toolHint(raw);
        if (hintMatch) {
          results.push({
            message: `Error: command "${raw.split(' ')[0]}" not allowed, use "${hintMatch.hint}" tool instead`
          });
        } else {
          results.push({
            message: `Error: command "${raw.split(' ')[0]}" not allowed.`
          });
        }
        continue;
      }

      // Readonly commands skip permission prompts entirely
      const isReadonly = BashTool.SAFE_BASH_CMDS.some(({ pattern, readonly }) => {
        if (pattern.endsWith('*')) {
          return raw.startsWith(pattern.substring(0, pattern.length - 1)) && readonly;
        }
        return raw === pattern && readonly;
      });
      if (isReadonly) continue;

      const tokens = cmd.tokens;
      let [ cmdName, second, ...rem ] = tokens;
      let scope = second?.startsWith('-') ? cmdName : (cmdName + ' ' + second);
      let parents = second
        ? [ cmdName + '*', cmdName + ' ' + second + '*' ].reverse()
        : [ cmdName + '*' ];

      results.push({
        scope: raw,
        parents: parents
      });
    }

    if (results.length === 0) return null;
    return results;
  }
}

module.exports = BashTool;