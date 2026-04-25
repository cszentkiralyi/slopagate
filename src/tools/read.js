const fs = require('node:fs/promises');

const Tool = require('./tool.js');

const addLineNumber = (line, no) => `${no} ${line}`;
const addLineNumbers = (lines, start) => {
  let start_line = start || 1;
  let output = '';
  for (let i = 0; i < lines.length; i++) {
    output += addLineNumber(lines[i], i + start_line) + '\n';
  }
  return output;
}

const ReadTool = new Tool({
  name: 'read',
  description: 'Read a text file, either all at once or limited to a line range.',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string '},
      start_line: { type: 'integer '},
      end_line: { type: 'integer '}
    },
    required: [ 'file_path' ]
  },
  handler: async (args, tool) => {
    let { file_path, start_line, end_line } = args;
    
    let content;
    try {
      content = await fs.readFile(file_path, { encoding: 'utf-8' });
      content = content.split('\n');
      if (start_line) {
        content.splice(0, start_line);
      }
      if (end_line) {
        content.splice(end_line);
      }
      content = addLineNumbers(content, start_line || 1);
      return content;
    } catch (err) {
      content = `Error: file ${file_path} not found!`;
    }
  },
  
  message: (calls) => {
    if (calls.length == 1) {
      let { file_path, start_line, end_line } = calls[0].args, message = '';
      if (start_line || end_line)
        message = ':' + [start_line, end_line].filter(l => l || '').join('-');
      return `Reading ${file_path}${message}`;
    }
    let filenames = calls.map(c => c.args.file_path.split('/').slice(-1)),
        fstr = filenames.join(', ');
    if (fstr.length > 20) fstr = fstr.substring(0, 20) + '...';
    return `Reading ${calls.length} files (${fstr})`;
  }
});

module.exports = ReadTool;