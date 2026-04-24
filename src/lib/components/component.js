const { Logger } = require('../../util.js');

class Component {
  root;
  hidden;
  dirtyRender;
  constructor(props) { Object.assign(this, props); }
  render(width) { return { lines: [], dirty: false, skip: 0 }; }
  focus() { if (this.root && this.root.giveFocus) this.root.giveFocus(this); }
  hide() { this.hidden = true; this._lines = null; }
  show() { this.hidden = false; this._lines = null; }
  log(x) { Logger.log(' '.repeat(this.depth || 0) + x); }

  static isDirty(prev, next) {
    if (!prev && !next) return false;
    if (!prev || !next) return true;
    if (prev.length !== next.length) return true;
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== next[i]) return true;
    }
    return false;
  }
}

module.exports = Component;