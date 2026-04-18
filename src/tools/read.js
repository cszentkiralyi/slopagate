const fs = require('node:fs/promises');

const Tool = require('./tool.js');

const addLineNumbers = (lines, start) => {
  let start_line = start || 1;
  let output = '';
  for (let i = 0; i < lines.length; i++) {
    output += `${i + start_line} ${lines[i]}\n`;
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
    //if (!fs.existsSync(file_path)) return `Error: no file at path "${file_path}"`;
    
    let content;
    
    if (!start_line && !end_line) {
      content = fs.readFile(file_path, { encoding: 'utf-8' });
    } else {
    let file = await fs.open(file_path);
      let start = start_line || 1;
      let lines = file.readLines();
      let lineNo = 1;
      content = '';
      for (const line of lines) {
        if (lineNo < start) continue;
        if (end && lineNo > end) break;
        content += line + '\n';
      }
      content = addLineNumbers(content, start);
      file.close();
    }
    

    return content;
  }
});

module.exports = ReadTool;