/* 2026-04-21
 * Entirely vibe-coded, except I changed the result to be joined by newline
 * to preserve spaces in names maybe. */
const fs = require('node:fs/promises');

const { truncateBody } = require('../util.js');

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

  normalize(args) {
    let pattern = args.glob || '.';
    // Collapse // to /, trim trailing /, resolve ./
    pattern = pattern.replace(/\/\/+/g, '/').replace(/\/$/, '').replace(/^\.\//, '');
    if (!pattern) pattern = '.';
    return [pattern];
  }

  async handler(args, tool) {
    let { glob: pattern } = args;
    
    pattern = pattern || '.';
    
    let summary = `${this.simplifyPath(pattern)}`;
    tool.message({ state: 'spin', summary });
    
    let result;
    let body = null;
    try {
      const matches = [];
      for await (const match of fs.glob(pattern)) {
        matches.push(match);
      }
      result = matches.join('\n');
      
      // Format for display: first 5 results max
      let displayLines = matches.slice(0, 5);
      let displayMissing = matches.length - displayLines.length;
      if (displayMissing > 0) {
        displayLines.push(`[+${displayMissing} more]`);
      }
      body = truncateBody(displayLines.join('\n'));
    } catch (err) {
      result = `Error: Cannot list ${pattern}: ${err.message}`;
    }
    
    tool.message({ state: 'done', summary, body });
    return result;
  }
}

module.exports = LsTool;
