/* 2026-04-21
 * Entirely vibe-coded, except I changed the result to be joined by newline
 * to preserve spaces in names maybe. */
const fs = require('node:fs/promises');

const Tool = require('./tool.js');

class LsTool extends Tool {
  name = 'ls';
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

  message(calls) {
    if (calls.length == 1) {
      let { directory } = calls[0].args;
      return `Listing ${this.simplifyPath(directory)}/`;
    }
    let dirnames = calls
          .map(c => c.args.directory) 
          .map(d => this.simplifyPath(d))
          .map(s => s.substring(0, s.length - 1)),
        dstr = dirnames.join(', ');
    if (dstr.length > 40) dstr = dstr.substring(0, 40) + '...';
    return `Listing ${calls.length} directories (${dstr})`;
  }
}

module.exports = LsTool;found!`;
    }
  }
  
  message(calls) {
    if (calls.length == 1) {
      let { file_path, start_line, end_line } = calls[0].args, message = '';
      if (start_line || end_line)
        message = ':' + (start_line || 1) + (end_line ? ('-' + end_line) : '+');
      return `Reading ${this.simplifyPath(file_path)}${message}`;
    }
    let filenames = calls.map(c => c.args.file_path.split('/').slice(-1)),
        fstr = filenames.join(', ');
    if (fstr.length > 20) fstr = fstr.substring(0, 40) + '...';
    return `Reading ${calls.length} files (${fstr})`;
  }
}

module.exports = ReadTool;