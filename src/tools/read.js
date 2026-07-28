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
  nounPlural = 'files';
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

  normalize(args) {
    if (!args || !args.file_path) return null;
    const path = this.simplifyPath(args.file_path);
    const segments = path.split(/[\/\\]/).filter(Boolean);
    // Split path into segments for better similarity detection
    const pathFields = segments.length > 1 
      ? [...segments.slice(0, -1), segments[segments.length - 1]]
      : [path];
    return [
      ...pathFields,
      args.start_line ?? null,
      args.end_line ?? null,
    ];
  }

  async handler(args, tool) {
    let { file_path, start_line, end_line } = args;
    try { start_line = parseInt(start_line, 10) } catch (e) { start_line = null; }
    try { end_line = parseInt(end_line, 10) } catch (e) { end_line = null; }
    
    let message = '';
    if (start_line || end_line)
      message = ':' + (start_line || 1) + (end_line ? ('-' + end_line) : '+');
    
    let summary = `${this.simplifyPath(file_path)}${message}`;
    let result;
    let body = null;
    try {
      let content = await fs.readFile(file_path, { encoding: 'utf-8' });
      tool.message({ state: 'spin', summary });
      content = content.split('\n');
      if (start_line) {
        content.splice(0, start_line - 1);
      }
      if (end_line) {
        content.splice(end_line - (start_line || 1));
      }
      let readLimit = Math.floor(Tool.RAW_OUTPUT_MAX_LINES * 1.5);
      if (content.length > readLimit) {
        const sliced = content.slice(0, readLimit);
        const missing = content.length - sliced.length;
        sliced.push(`[+${missing} more]`);
        content = sliced;
      }
      let firstLine = start_line || 1;
      result = addLineNumbers(content, firstLine);
      body = result;
    } catch (err) {
      result = `Error: file ${file_path} not found!`;
    }
    
    tool.message({
      state: result.startsWith('Error:') ? 'error' : 'done',
      summary,
      body
    });
    return result;
  }
}

module.exports = ReadTool;