/* 2026-04-21
 * Entirely vibe-coded, except I changed the result to be joined by newline
 * to preserve spaces in names maybe. */
const fs = require('node:fs/promises');

const Tool = require('./tool.js');

class LsTool extends Tool {
  name = 'ls';
  description =  'List files and folders in a directory.';
  readonly =  true;
  parameters =  {
    type:  'object',
    properties:  {
      directory:  { type: 'string', default: '.' }
    }
  };
  
  constructor(props) {
    super(props);
    Object.assign(this, props);
  }

  async handler(args, tool) {
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

  message(e) { return null; }
}

module.exports = LsTool;