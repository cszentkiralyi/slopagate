/* 2026-04-21
 * Entirely vibe-coded, except I changed the result to be joined by newline
 * to preserve spaces in names maybe. */
const fs = require('node:fs/promises');

const Tool = require('./tool.js');

class LsTool extends Tool {
  name = 'Glob';
  nounPlural = 'patterns';
  description = 'List files and folders in a glob.';
  ttl = 2;
  readonly =  true;
  parameters =  {
    type:  'object',
    properties:  {
      glob:  { type: 'string', default: '.' }
    }
  };
  
  constructor(props) {
    super(props);
    Object.assign(this, props);
  }

  async handler(args, tool) {
    let { glob: pattern } = args;
    
    pattern = pattern || '.';
    
    tool.message({ state: 'spin', summary: `${this.simplifyPath(pattern)}/` });
    
    let result;
    try {
      const { glob } = require('node:fs/promises');
      const matches = await glob(pattern, { withFileTypes: true });
      
      result = matches.map(entry => {
        return entry.isDirectory() ? `${entry.name}/` : entry.name;
      }).join('\n');
    } catch (err) {
      result = `Error: Cannot list ${pattern}: ${err.message}`;
    }
    
    tool.message({ state: 'done', summary: `${this.simplifyPath(pattern)}/` });
    return result;
  }
}

module.exports = LsTool;