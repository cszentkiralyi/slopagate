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
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string '},
      start_line: { type: 'integer '},
      end_line: { type: 'integer '}
    },
    required: [ 'file_path' ]
  },
  handler: async (args) => {
    let { file_path, start_line, end_line } = args;
    
    let content;
    
    if (!start_line && !end_line) {
      content = await fs.readFile(file_path, { encoding: 'utf-8' });
      content = addLineNumbers(content);
    } else {
    let file = await fs.open(file_path);
      let start = start_line || 1;
      let lines = file.readLines();
      let lineNo = 1;
      content = '';
      for (const line of lines) {
        if (lineNo < start) continue;
        if (end && lineNo > end) break;
        content += addLineNumber(line) + '\n';
      }
      file.close();
    }
    
    return content;
  },
  
  message: (args) => {
    return  `Reading ${args.file_path}`;
  }
});

module.exports = ReadTool;