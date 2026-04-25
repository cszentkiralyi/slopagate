const fs = require('node:fs/promises');
const path = require('node:path');

const ANSI = require('../lib/ansi.js');
const Tool = require('./tool.js');

class EditTool extends Tool {
  static ADD_COLOR = 70;
  static REM_COLOR = 160;

  name = 'edit';
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

  async handler(args, tool) {
    let { file_path, old_str, new_str } = args;
    let temp_path = path.join(tool.temppath, 'edit');

    try {
      await fs.copyFile(file_path, temp_path);
      let content = await fs.readFile(temp_path);
      if (content.includes(old_str)) {
        content = content.toString().replace(old_str, new_str);
        await fs.writeFile(temp_path, content);
        await fs.rm(file_path);
        await fs.copyFile(temp_path, file_path);
        await fs.rm(temp_path);
        return `Edited "${file_path}" successfully.`;
      }
      return `Error: old_str not found in file!`;
    } catch (editErr) {
      if (editErr.code !== 'ENOENT') return `Error: something went wrong!`;
      
      try {
        /* 2026-04-21
         * Let it be known that today, Qwen3.5 9B pointed out this wasn't
         * writing anything to the temp_path. It also silently fixed another
         * bug I was blinded to, where we wrote to the temp path and then
         * *never did anything else* like move it to the real path. I don't
         * know if I should be impressed with technology or disappointed in
         * myself.
         * Qwen3.5:9b-65k wrote this code: */
        await fs.writeFile(temp_path, new_str);
        await fs.copyFile(temp_path, file_path);
        await fs.rm(temp_path);
        return `Created "${file_path}" successfully.`;
      } catch (createErr) {
        if (editErr.code !== 'ENOENT') return `Error: something went wrong!`;
        return `Error: some or all of the path "${file_path}" doesn't exist!`;
      }
    }
  }
  
  message(calls) {
    let target, linesNeg, linesPos
    if (calls.length == 1) {
      target = this.simplifyPath(calls[0].args.file_path);
      linesNeg = calls[0].args.old_str.split('\n').length;
      linesPos = calls[0].args.new_str.split('\n').length;
      return `Editing ${calls[0].args.file_path} (${ANSI.fg('-' + linesNeg, EditTool.REM_COLOR)} ${ANSI.fg('+' + linesPos, EditTool.ADD_COLOR)})`;
    } else {
      target = `${calls.length} files`;
      linesNeg = calls.reduce((m, c) => m + c.args.old_str.split('\n').length, 0);
      linesPos = calls.reduce((m, c) => m + c.args.new_str.split('\n').length, 0);
    }
    return `Editing ${target} (${ANSI.fg('-' + linesNeg, EditTool.REM_COLOR)} ${ANSI.fg('+' + linesPos, EditTool.ADD_COLOR)})`;
  }
}

module.exports = EditTool;