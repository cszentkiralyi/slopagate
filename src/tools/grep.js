const { execSync } = require('node:child_process');
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
    let subject = `StringSearch(${s.length > 17 ? s.substring(0, 14) + '..."' : s} in ${this.simplifyPath(file_path || '.')}`;
    tool.message({ state: 'static', subject });

    try {
      const result = execSync(`grep -nr ${JSON.stringify(search_string)} ${file_path}`).toString();
      if (!result.length) return '';
      let output = result.split('\n');
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
    } catch (err) {
      if (err.message?.includes('ENOENT')) {
        return `Error: file ${file_path} not found`;
      }
      if (err.status === 1) {
        return '';
      }
      Logger.log(`Grep: ${JSON.stringify(err)}`);
      return `Error: ${err.message}`;
    }
  }
}

module.exports = GrepTool;