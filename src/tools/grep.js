const { execSync } = require('node:child_process');

const Tool = require('./tool.js');

class GrepTool extends Tool {
  name = 'grep';
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

    try {
      const output = execSync(`grep -nd recurse ${JSON.stringify(search_string)} ${file_path}`);
      return output.toString().split('\n').slice(0, 20).join('\n');
    } catch (err) {
      if (err.message?.includes('ENOENT')) {
        return `Error: file ${file_path} not found`;
      }
      if (err.message?.includes('No match')) {
        return `Error: string "${search_string}" not found in ${file_path}`;
      }
      return `Error: ${err.message}`;
    }
  }
  
  message(calls) {
    if (calls.length == 1) {
      let { file_path, search_string } = calls[0].args,
          s = JSON.stringify(search_string);
      return `Grep: ${s.length > 17 ? s.substring(0, 14) + '..."' : s} in ${this.simplifyPath(file_path)}`;
    }
    let paths = new Set(), patterns = new Set();
    calls.forEach(c => {
      paths.add(c.file_path);
      patterns.add(c.search_string);
    })
    return `Grep: searching ${paths.size} files for ${patterns.size} patterns`;
  }
}

module.exports = GrepTool;