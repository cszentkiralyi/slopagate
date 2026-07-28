const path = require('node:path');
const { Logger } = require('../util.js');

class Tool {
  static TRIM_MSG = '[...trimmed tool output...]';
  static RAW_OUTPUT_MAX_LINES = 300;
  name;
  nounPlural = 'operations';
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
  
  constructor(props) {
    this.harness = props.harness;
  }
  
  #messageCallback = null;

  async run(args, { temppath, message, config } = {}) {
    this.#messageCallback = typeof message === 'function' ? message : null;
    let tool = {
      temppath,
      message: this.#messageCallback,
      config,
    };
    return await this.handler(args, tool);
  }

  // TODO: clean up — this is a temporary hack to pass nounPlural through the event.
  // The aggregator should get nounPlural from a proper toolbox reference, not via the event.
  message({ state, summary, body } = {}) {
    if (this.#messageCallback) {
      this.#messageCallback({ state, summary, body, nounPlural: this.nounPlural });
    }
  }
  
  permissions(args) {
    return null;
  }
  
  normalize(args) {
    // Return canonical string for dedup — override in subclasses
    return JSON.stringify(args);
  }
  
  simplifyPath(p) {
    let simplified = path.relative('.', p);
    return (simplified && simplified.length) ? simplified : '.';
  }
  
  aggregate(n) {
    return `${this.name} ${n} ${this.nounPlural}`;
  }
  log(x) { Logger.log(`Tool:${this.name} ${x}`); }
}

module.exports = Tool;
