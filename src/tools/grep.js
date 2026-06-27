const { execSync } = require('node:child_process');
const { Logger, truncate } = require('../util.js');

const Tool = require('./tool.js');

class GrepTool extends Tool {
  name = 'Search';
  nounPlural = 'patterns';
  description = 'Search for a pattern in a file or directory and return matching lines.';
  ttl = 3;
  readonly = true;
  parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File or directory to search. If a directory, searches recursively.' },
      pattern: { type: 'string', description: 'The pattern to search for.' }
    },
    required: [ 'path', 'pattern' ]
  };
  
  constructor(props) {
    super(props);
    this.handler = this.handler;
    Object.assign(this, props);
  }

  async handler(args, tool) {
    let { path, pattern } = args;

    let s = pattern;
    let summary = `${truncate(s, 50)} in ${this.simplifyPath(path || '.')}`;
    tool.message({ state: 'spin', summary });

    try {
      const result = execSync(`grep -nr ${JSON.stringify(pattern)} ${path}`).toString();
      if (!result.length) return '';
      let output = result.split('\n');
      // Truncate each line to tool_line_limit chars
      let maxLineLen = this.config.get('tool_line_limit') || 256;
      output = output.map(line => truncate(line, maxLineLen));
      let maxLines = this.config.get('tool_output_limit') || 20;
      let sliced = output.slice(0, maxLines);
      let missing = output.length - sliced.length;
      if (missing) sliced.push(`...and ${missing} more.`);
      return sliced.join('\n');
    } catch (err) {
      if (err.message?.includes('ENOENT')) {
        return `Error: ${path} not found`;
      }
      if (err.status === 1) {
        return '';
      }
      Logger.log(`Grep: ${JSON.stringify(err)}`);
      return `Error: ${err.message}`;
    } finally {
      tool.message({ state: 'done', summary });
    }
  }
}

module.exports = GrepTool;