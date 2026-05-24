const { exec } = require('node:child_process');
const { Logger } = require('../util.js');

const Tool = require('./tool.js');

class GrepTool extends Tool {
  name = 'StringSearch';
  description = 'Search for a pattern in a file and return matching lines.';
  ttl = 3;
  readonly = true;
  parameters = {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      search_string: { type: 'string' }
    },
    required: [ 'file_path', 'search_string' ]
  };
  
  constructor(props) {
    super(props);
    this.handler = this.handler;
    Object.assign(this, props);
  }

  async handler(args, tool) {
    let { file_path, search_string } = args;

    let s = JSON.stringify(search_string);
    let subject = `${this.name}(${s.length > 17 ? s.substring(0, 14) + '..."' : s} in ${this.simplifyPath(file_path || '.')}`;
    tool.message({ state: 'static', subject });

    try {
      const result = await new Promise((resolve, reject) => {
        exec(`grep -nr ${JSON.stringify(search_string)} ${file_path}`, (error, stdout, stderr) => {
          if (error) {
            resolve({ error, stdout, stderr });
          } else {
            resolve({ error: null, stdout, stderr });
          }
        });
      });

      if (result.error && result.error.status === 1) {
        return '';
      }

      if (result.error) {
        if (result.error.code === 'ENOENT' || result.error.message?.includes('ENOENT')) {
          return `Error: file ${file_path} not found`;
        }
        Logger.log(`Grep: ${JSON.stringify(result.error)}`);
        return `Error: ${result.error.message}`;
      }

      if (!result.stdout.length) return '';
      let output = result.stdout.split('\n');
      // Truncate each line to tool_line_limit chars
      let maxLineLen = this.config.get('tool_line_limit') || 256;
      output = output.map(line =>
        line.length > maxLineLen
          ? line.substring(0, maxLineLen) + '...'
          : line
      );
      let maxLines = this.config.get('tool_output_limit') || 20;
      let sliced = output.slice(0, maxLines);
      let missing = output.length - sliced.length;
      if (missing) sliced.push(`...and ${missing} more.`);
      return sliced.join('\n');
    } finally {
      tool.message({ state: 'done', subject });
    }
  }
}

module.exports = GrepTool;