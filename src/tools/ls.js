/* 2026-04-21
 * Entirely vibe-coded, except I changed the result to be joined by newline
 * to preserve spaces in names maybe. */
const fs = require('node:fs/promises');

const Tool = require('./tool.js');

class LsTool extends Tool {
  name = 'Ls';
  description = 'List files and folders in a directory.';
  ttl = 2;
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
    
    tool.message({ state: 'spin', summary: `${this.simplifyPath(directory)}/` });
    
    let result;
    try {
      const files = await fs.readdir(directory, { withFileTypes: true });
      
      result = files.map(file => {
        return file.isDirectory() ? `${file.name}/` : file.name;
      }).join('\n');
    } catch (err) {
      result = `Error: Cannot list ${directory}: ${err.message}`;
    }
    
    tool.message({ state: 'done', summary: `${this.simplifyPath(directory)}/` });
    return result;
  }
}

module.exports = LsTool;