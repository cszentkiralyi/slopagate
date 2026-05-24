const fs = require('node:fs/promises');

const Tool = require('./tool.js');

const addLineNumber = (line, no) => `${no}: ${line}`;
const addLineNumbers = (lines, start) => {
  let start_line = start || 1;
  let output = '';
  for (let i = 0; i < lines.length; i++) {
    output += addLineNumber(lines[i], i + start_line) + '\n';
  }
  return output;
}

class ReadTool extends Tool {
  name = 'Read';
  description = 'Read a text file, either all at once or limited to a line range.';
  readonly = true;
  parameters = {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      start_line: { type: 'integer' },
      end_line: { type: 'integer' }
    },
    required: [ 'file_path' ]
  };
  
  constructor(props) {
    super(props);
    this.handler = this.handler;
    Object.assign(this, props);
  }

  async handler(args, tool) {
    let { file_path, start_line, end_line } = args;
    try { start_line = parseInt(start_line, 10) } catch (e) { start_line = null; }
    try { end_line = parseInt(end_line, 10) } catch (e) { end_line = null; }
    
    let message = '';
    if (start_line || end_line)
      message = ':' + (start_line || 1) + (end_line ? ('-' + end_line) : '+');
    tool.message({ state: 'spin', subject: `${this.name}(${this.simplifyPath(file_path)}${message})` });
    
    let result;
    try {
      let content = await fs.readFile(file_path, { encoding: 'utf-8' });
      content = content.split('\n');
      if (start_line) {
        content.splice(0, start_line);
      }
      if (end_line) {
        content.splice(end_line);
      }
      result = addLineNumbers(content, start_line || 1);
    } catch (err) {
      result = `Error: file ${file_path} not found!`;
    }
    
    tool.message({ state: 'done', subject: `${this.name}(${this.simplifyPath(file_path)}${message})` });
    return result;
  }
}

module.exports = ReadTool;