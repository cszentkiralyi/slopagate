const { execSync } = require('node:child_process');

const Tool = require('./tool.js');

const GrepTool = new Tool({
  name: 'grep',
  description: 'Search for a pattern in a file and return matching lines.',
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      search_string: { type: 'string' }
    },
    required: [ 'file_path', 'search_string' ]
  },
  handler: async (args, tool) => {
    let { file_path, search_string } = args;

    try {
      const output = execSync(`grep -Fnd recurse ${JSON.stringify(search_string)} ${file_path}`);
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
  },
  
  message: (calls) => {
    if (calls.length == 1) {
      let { file_path, search_string } = calls[0].args,
          s = JSON.stringify(search_string);
      return `Grep: ${s.length > 17 ? s.substring(0, 14) + '..."' : s} in ${file_path}`;
    }
    return `Grep: searching ${(new Set(calls.map(c => c.args.file_path))).length} files`;
  }
});

module.exports = GrepTool;