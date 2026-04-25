/* Runs shell commands with permission checking */
const { exec } = require('node:child_process');

const { Logger } = require('../util.js');
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
    { pattern: 'npm run test', readonly: false },
    { pattern: 'node --test *', readonly: false },
    { pattern: 'git log *', readonly: true },
    { pattern: 'git status *', readonly: true },
    { pattern: 'head *', readonly: true },
    { pattern: 'tail *', readonly: true},
    { pattern: 'pwd', readonly: true }
  ];

  constructor(props) {
    super(props);
    Object.assign(this, props);
    
    this.description += BashTool.SAFE_BASH_CMDS.map(c => c.pattern).join(', ');
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

  async handler(args, tool) {
    const { command } = args;

    if (!this.permissionGate(command)) {
      return 'Error: Command not permitted';
    }

    let p = new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        Logger.log(`BashTool: ${JSON.stringify({ error, stdout, stderr})}`);
        if (error) {
          Logger.log(`BashTool: Error executing command "${command}": ${error.message} (exit code: ${error.code || 'unknown'})`);
          if (error.killed) {
            Logger.log(`BashTool: Command was killed, possibly due to OOM`);
          }
          resolve(`Error: exit code ${error.code || 'unknown'}: ${error.message}`);
        } else if (stderr) {
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
      let { command } = permittedCalls[0].args;
      return `Executing ${command}`;
    }
    let summaries = permittedCalls.map(c => c.args.command.split(' ')[0]),
        summary = summaries.join(' ');
    if (summary.length > 20) summary = summary.substring(0, 20) + '...';
    return `Executing ${permittedCalls.length} commands (${summary})`;
  }
}

module.exports = BashTool;