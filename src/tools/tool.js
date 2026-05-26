const path = require('node:path');
const { Logger } = require('../util.js');

class Tool {
  static TRIM_MSG = '[...trimmed tool output...]';
  name;
  description;
  readonly = false;
  ttl = 5
  parameters;
  // Uncommenting this blocks any subclasses from defining a message()
  // method, which is absolute bullshit.
  // handler;
  // message; 
  
  get spec() {
    return {
      'type': 'function',
      'function': {
        'name': this.name,
        'description': this.description || this.name,
        'parameters': this.parameters,
      }
    };
  }
  get json() { return JSON.stringify(this.spec); }
  
  constructor(props) { Object.assign(this, props); }
  
  #messageCallback = null;

  async run(args, { temppath, message } = {}) {
    this.#messageCallback = typeof message === 'function' ? message : null;
    let tool = {
      temppath,
      message: this.#messageCallback,
    };
    return await this.handler(args, tool);
  }

  message({ state, summary, body } = {}) {
    if (this.#messageCallback) {
      this.#messageCallback({ state, summary, body });
    }
  }
  
  permissions(args) {
    return null;
  }
  
  simplifyPath(p) {
    let simplified = path.relative('.', p);
    return (simplified && simplified.length) ? simplified : '.';
  }
  
  log(x) { Logger.log(`Tool:${this.name} ${x}`); }
}

module.exports = Tool;