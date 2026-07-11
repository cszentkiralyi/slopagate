const { execSync } = require('node:child_process');
const { Logger, truncate, truncateBody } = require('../util.js');

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

  normalize(args) {
    if (!args || !args.path || !args.pattern) return null;
    const path = this.simplifyPath(args.path);
    const segments = path.split(/[\/\\]/).filter(Boolean);
    const pathFields = segments.length > 1 
      ? [...segments.slice(0, -1), segments[segments.length - 1]]
      : [path];
    return [
      ...pathFields,
      args.pattern,
    ];
  }

  async handler(args, tool) {
    let { path, pattern } = args;

    let s = pattern;
    let summary = `${truncate(s, 50)} in ${this.simplifyPath(path || '.')}`;
    tool.message({ state: 'spin', summary });

    try {
      const result = execSync(`grep -nr ${JSON.stringify(pattern)} ${path}`).toString();
      if (!result.length) {
        tool.message({ state: 'done', summary });
        return '';
      }
      let output = result.split('\n');
      let maxLines = this.config.get('tool_output_limit') || 20;
      let sliced = output.slice(0, maxLines);
      let missing = output.length - sliced.length;
      if (missing) sliced.push(`[+${missing} more]`);
      let fullResult = sliced.join('\n');

      tool.message({ state: 'done', summary, body: fullResult });
      return fullResult;
    } catch (err) {
      if (err.message?.includes('ENOENT')) {
        tool.message({ state: 'done', summary });
        return `Error: ${path} not found`;
      }
      if (err.status === 1) {
        tool.message({ state: 'done', summary });
        return '';
      }
      Logger.log(`Grep: ${JSON.stringify(err)}`);
      tool.message({ state: 'done', summary });
      return `Error: ${err.message}`;
    }
  }
}

module.exports = GrepTool;