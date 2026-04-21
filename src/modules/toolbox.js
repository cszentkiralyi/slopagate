const Events = require('./events.js');

class Toolbox {
  _tools = new Map();
  get tools() { return this._tools; }
  
  constructor(tools) {
    if (tools) tools.forEach(t => this.register(t));
  }

  register(tool) {
    this._tools.set(tool.name, tool);
    
    Events.on('tool:call', async ({ id, name, args, dir }) => {
      let tool = this.get(name), content;
      if (tool) {
        if (tool.message) {
            Events.emit('tool:message', { content: tool.message(args) });
        }
        content = await tool.run(args);
      } else {
        content = `Error: tool "${name}" not found!`;
      }
      Events.emit('tool:response', { id, name, content });
    });
  }
  
  all() {
    return Array.from(this._tools.values());
  }
  
  get(name) {
    return this._tools.get(name);
  }
  getNames() {
    return this._tools.keys;
  }
  getDescription(name) {
    return this._tools.get(name).description;
  }
}

module.exports = Toolbox;