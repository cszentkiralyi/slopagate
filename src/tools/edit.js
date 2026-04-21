const fs = require('node:fs/promises');
const path = require('node:path');

const Tool = require('./tool.js');

const EditTool = new Tool({
  name: 'edit',
  description: 'Make edits to a text file by replacing old_str with new_str in a file. The strings must differ. If a file doesn\'t exist it will be created.',
  paramters: {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      old_str: { type: 'string' },
      new_str: { type: 'string' }
    },
    required: [ 'file_path', 'old_str', 'new_str' ]
  },
  
  handler: async (args, tool) => {
    let { file_path, old_str, new_str } = args;
    let temp_path = path.join(tool.temppath, 'edit');
    let rel_path = path.relative('.', file_path);
    // TODO: handle file creation case
    try {
      await fs.copyFile(rel_path, temp_path);
      let content = await fs.readFile(temp_path);
      if (content.includes(old_str)) {
        content = content.toString().replace(old_str, new_str);
        await fs.writeFile(temp_path, content);
        await fs.rm(rel_path);
        await fs.copyFile(temp_path, rel_path);
        await fs.rm(temp_path);
        return `Edited "${file_path}" successfully.`;
      }
      return `Error: old_str not found in file!`;
    } catch (e) {
      return `Error: file "${file_path}" not found!`;
    }
  },
  
  message: (args) => {
    let linesNeg = args.old_str.split('\n').length;
    let linesPos = args.new_str.split('\n').length;
    return `Editing ${args.file_path} (-${linesNeg} +${linesPos})`;
  }
});

module.exports = EditTool;