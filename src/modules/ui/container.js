const Component = require('./component.js');

class Container extends Component {
  _lines = []; // cache
  children = [];
  root = null;
  
  constructor(props) { super(props); Object.assign(this, props); }
  
  render(width) {
    let lines = [],
        skip = 0,
        dirty = false;
    this.children.forEach(child => {
      let result = child.render(width);
      if (!result || !result.lines) {
        console.log(result);
        throw new Error();
      }
      lines.push(...result.lines);
      if (!dirty && !result.dirty) {
        skip += result.lines.length;
      } else {
        dirty = true;
      }
    });
    this._lines = lines;
    return { lines, dirty, skip: (dirty ? 0 : skip) };
  }
  
  appendChild(c) {
    c.root = c.root || this.root || this;
    this.children.push(c);
    return true;
  }
  removeChild(c) {
    if (this.children.includes(c)) {
      this.children = this.children.filter(cc => cc !== c);
      c.dispose();
      return true;
    }
    let foundInner = false;
    this.children.forEach(child => {
      if (Container.isContainer(child) && child.children.length) {
        foundInner ||= child.removeChild(c);
      }
    });
    return foundInner;
  }
  
  static isContainer(inst) {
    return inst && inst.children && inst.removeChild;
  }
}

module.exports = Container;