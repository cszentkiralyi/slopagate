/* 2026-04-21
 * Entirely vibe-coded, except I changed the result to be joined by newline
 * to preserve spaces in names maybe. */
const fs = require('node:fs/promises');

const Tool = require('./tool.js');

const LsTool = new Tool({
  name: 'ls',
  description: 'List files and folders in a directory.',
  parameters: {
    type: 'object',
    properties: {
      directory: { type: 'string', default: '.' }
    }
  },
  handler: async (args, tool) => {
    let { directory } = args;
    
    directory = directory || '.';
    
    try {
      const files = await fs.readdir(directory, { withFileTypes: true });
      
      const result = files.map(file => {
        return file.isDirectory() ? `${file.name}/` : file.name;
      }).join('\n');
      
      return result;
    } catch (err) {
      return `Error: Cannot list ${directory}: ${err.message}`;
    }
  }
});

module.exports = LsTool;