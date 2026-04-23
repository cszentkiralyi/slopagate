const Events = require('../events.js');
const { Logger } = require('../util.js');

class Toolbox {
  _handledCalls = new Set();
  _tools = new Map();
  get tools() { return this._tools; }
  
  constructor(tools) {
    if (tools) tools.forEach(t => this.register(t));
  }

  register(tool) {
    if (this._tools.has(tool.name) && this._tools.get(tool.name)) return;

    this._tools.set(tool.name, tool);
    
    Events.on('tool:call', async ({ id, name, args, temppath }) => {
      //Logger.log(`tool: ${{ id, name, args, temppath }}`);
      let tool = this.get(name), content;
      if (tool) {
        if (this._handledCalls.has(id)) return;
        this._handledCalls.add(id);
        content = await tool.run(args, temppath);
      } else {
        content = `Error: tool "${name}" not found!`;
      }
      Events.emit('tool:response', { id, name, content });
      this._handledCalls.delete(id);
    });
  }
  
  all() {
    return Array.from(this._tools.values());
  }
  names() {
    return Array.from(this._tools.keys());
  }
  
  get(name) {
    return this._tools.get(name);
  }
  getDescription(name) {
    return this._tools.get(name).description;
  }
}

module.exports = Toolbox;