const fs = require('node:fs/promises');
const path = require('node:path');

const ANSI = require('../lib/ansi.js');
const { ID } = require('../util.js');
const Tool = require('./tool.js');

class EditTool extends Tool {
  static ADD_COLOR = 70;
  static REM_COLOR = 160;

  name = 'Edit';
  nounPlural = 'files';
  description = 'Make edits to a text file by replacing old_str with new_str in a file. The strings must differ. If a file doesn\'t exist it will be created.';
  parameters = {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      old_str: { type: 'string' },
      new_str: { type: 'string' }
    },
    required: [ 'file_path', 'old_str', 'new_str' ]
  };
  
  constructor(props) {
    super(props);
    this.handler = this.handler;
    Object.assign(this, props);
  }

  normalize(args) {
    if (!args || !args.file_path || !args.old_str || !args.new_str) return null;
    return [
      this.simplifyPath(args.file_path),
      args.old_str,
      args.new_str,
    ];
  }

  async handler(args, tool) {
    let { file_path, old_str, new_str } = args;
    let temp_path = path.join(tool.temppath, 'edit-' + ID());

    let linesNeg = old_str.split('\n').length;
    let linesPos = new_str.split('\n').length;
    let summary = `${this.simplifyPath(file_path)} ${ANSI.fg('-' + linesNeg, EditTool.REM_COLOR)} ${ANSI.fg('+' + linesPos, EditTool.ADD_COLOR)}`;
    tool.message({ state: 'spin', summary });

    let result;
    try {
      await fs.copyFile(file_path, temp_path);
      let content = await fs.readFile(temp_path);
      if (content.includes(old_str)) {
        content = content.toString().replace(old_str, new_str);
        await fs.writeFile(temp_path, content);
        await fs.rm(file_path);
        await fs.copyFile(temp_path, file_path);
        await fs.rm(temp_path);
        result = `Edited "${file_path}" successfully.`;
      } else {
        result = `Error: old_str not found in file, must match exactly`;
      }
    } catch (editErr) {
      if (editErr.code !== 'ENOENT') {
        result = `Error: something went wrong!`;
      } else {
        try {
          await fs.writeFile(temp_path, new_str);
          await fs.copyFile(temp_path, file_path);
          await fs.rm(temp_path);
          result = `Created "${file_path}" successfully.`;
        } catch (createErr) {
          if (createErr.code !== 'ENOENT') {
            result = `Error: something went wrong!`;
          } else {
            result = `Error: some or all of the path "${file_path}" doesn't exist!`;
          }
        }
      }
    }

    tool.message({
      state: result.startsWith('Error:') ? 'error' : 'done',
      summary });
    return result;
  }
  
  permissions(args) {
    const { file_path } = args;
    let path = this.simplifyPath(file_path);
    // TODO: Should use node:path to split
    let parents = path.split('/')
      .map((_, i, parts) => parts.slice(0, i+1).join('/'))
      .filter(p => p !== path)
      .map(p => p + '/*')
      .reverse(); // Check most-specific first, not last
    return { scope: path, parents };
  }
}

module.exports = EditTool;