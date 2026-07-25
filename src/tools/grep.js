const { spawnStream } = require('../lib/shell-stream.js');
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

    let resolve;
    const promise = new Promise(r => { resolve = r; });

    const grepCmd = `grep -nr ${JSON.stringify(pattern)} ${path}`;

    spawnStream(grepCmd, {
      throttleMs: 33,
      onStdout: (chunk) => {
        tool.message({ state: 'spin', summary, body: chunk.toString() });
      },
      onExit: (err, result) => {
        if (err) {
          if (err.message?.includes('ENOENT')) {
            tool.message({ state: 'done', summary });
            resolve(`Error: ${path} not found`);
          } else {
            Logger.log(`Grep: ${JSON.stringify(err)}`);
            tool.message({ state: 'done', summary });
            resolve(`Error: ${err.message}`);
          }
          return;
        }

        if (!result.stdout.length) {
          tool.message({ state: 'done', summary });
          resolve('');
          return;
        }

        let output = result.stdout;
        let maxLines = tool.config.get('tool_output_limit') || 20;
        let lines = output.split('\n');
        let sliced = lines.slice(0, maxLines);
        let missing = lines.length - sliced.length;
        if (missing) sliced.push(`[+${missing} more]`);
        let fullResult = sliced.join('\n').trimEnd();

        tool.message({ state: 'done', summary, body: fullResult });
        resolve(fullResult);
      }
    });

    return promise;
  }
}

module.exports = GrepTool;