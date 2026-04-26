/* Runs shell commands with permission checking */
const { exec } = require('node:child_process');

const { Logger } = require('../util.js');
const ANSI = require('../lib/ansi.js');
const Tool = require('./tool.js');

class BashTool extends Tool {
  name = 'bash';
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
    { pattern: 'node --test *', readonly: true },
    { pattern: 'git log *', readonly: true },
    { pattern: 'git status *', readonly: true },
    { pattern: 'git diff*', readonly: true },
    { pattern: 'git add *', readonly: true },
    { pattern: 'git reset *', readonly: false },
    { pattern: 'git commit *', readonly: false },
    { pattern: 'pwd', readonly: true }
  ];
  
  static TOOL_HINTS = [
    { pattern: 'cat <<*', hint: 'edit' },
    { pattern: 'sed *', hint: 'edit' },
    { pattern: 'cat *', hint: 'read' },
    { pattern: 'head *', hint: 'read' },
    { pattern: 'tail *', hint: 'read' },
    { pattern: 'ls*', hint: 'ls' },
    { pattern: 'find *', hint: 'ls' },
    { pattern: 'grep *', hint: 'grep' },
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

    if (!this.permissionGate(command)) {
      // Check for tool hints
      let word = command.split(' ')[0],
          hintMatch = this.toolHint(command);
      if (hintMatch) {
        return `Error: command "${word}" not allowed, use "${hintMatch.hint}" tool instead`;
      }
      
      return `Error: command "${word}" not allowed.`;
    }

    let p = new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (stderr) {
          // Command ran but returned error output in stderr
          Logger.log(`BashTool: Command "${command}" returned error: ${stderr.trim()}`);
          resolve(stderr.trim());
        } else {
          resolve(stdout || '');
        }
      });
    });
    return await p;
  }

  message(calls) {
    // Filter calls to only include permitted commands
    const permittedCalls = calls.filter(c => this.permissionGate(c.args.command));
    
    if (permittedCalls.length === 0) {
      return 'No permitted commands to execute';
    }
    
    if (permittedCalls.length == 1) {
      let { command } = permittedCalls[0].args,
          summary = command;
      if (summary.length > 40) summary = summary.substring(0, 40) + '...';
      return `Executing ${ANSI.fg(summary, 250)}`;
    }
    let summaries = permittedCalls.map(c => c.args.command.split(' ')[0]),
        summary = summaries.join(', ');
    if (summary.length > 40) summary = summary.substring(0, 40) + '...';
    return `Executing ${permittedCalls.length} commands (${summary})`;
  }
}

module.exports = BashTool;