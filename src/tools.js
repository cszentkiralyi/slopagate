const fs = require('node:fs');

const ReadTool = require('./tools/read.js');
const EditTool = require('./tools/edit.js');

class Tools {
  static _tools = new Map();
  static get tools() { return this._tools; }

  static register(tool) {
    this._tools.set(tool.name, tool);
  }
  
  static all() {
    return Array.from(this._tools.values());
  }
  
  static get(name) {
    return this._tools.get(name);
  }
  static getNames() {
    return this._tools.keys;
  }
  static getDescription(name) {
    return this._tools.get(name).description;
  }
}

Tools.register(ReadTool);
Tools.register(EditTool);

module.exports = Tools;