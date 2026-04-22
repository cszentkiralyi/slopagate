const Events = require('../modules/events.js');

class Tool {
  name;
  description;
  parameters;
  handler;
  message;
  
  get spec() {
    let func = {
      'name': this.name,
      'description': this.description || this.name,
      'parameters': this.parameters,
    };
    if (this.parameters
        && this.parameters.required
        && this.parameters.required.length)
      func.required = this.parameters.required;
    return { 'type': 'function', 'function': func };
  }
  get json() { return JSON.stringify(this.spec); }
  
  constructor(props) { Object.assign(this, props); }
  
  async run(args, temppath) {
    let tool = {
      temppath: temppath,
      message: (content) => Events.emit('tool:message', { id: args.id, content })
    };
    return await this.handler(args, tool);
  }
}

module.exports = Tool;