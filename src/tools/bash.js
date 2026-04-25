/* Runs shell commands with permission checking */
const { exec } = require('node:child_process');
const Tool = require('./tool.js');

class BashTool extends Tool {
  name = 'bash';
  description = 'Execute shell commands.';
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
    { pattern: 'git log *', readonly: true },
    { pattern: 'node --test *', readonly: false }
  ];

  constructor(props) {
    super(props);
    Object.assign(this, props);
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

    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          resolve(`Error: ${error.message}`);
        } else {
          resolve(stdout.trim() + (stderr ? '\n' + stderr : ''));
        }
      });
    });
  }

  message(e) { return null; }
}

module.exports = BashTool;