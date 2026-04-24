const Component = require('./component.js');

class Container extends Component {
  _lines = []; // cache
  children = [];
  #root = null;
  
  get root() { return this.#root; }
  set root(r) {
    if (r === this.#root) return;
    this.#root = r;
    if (this.children.length) {
      this.children.forEach(c => c.root = r);
    }
  }
  
  constructor(props) { super(props); Object.assign(this, props); }
  
  render(width) {
    let lines = [],
        skip = 0,
        dirty = false,
        lastChild = this.children.length - 1;
    this.children.forEach((child,  i) => {
      if (!child || child.hidden) return;
      //this.log(`Container: rendering child`);
      let result = child.render(width);
      if (!result || !result.lines) {
        console.log(result);
        throw new Error();
      }
      //this.log(`Container: child returned ${result.lines.length} lines, skip ${result.skip}, dirty ${result.dirty}`);
      lines.push(...result.lines);
      if (this.gap && i < lastChild) lines.push('')
      if (!dirty) skip += result.skip;
      dirty ||= result.dirty;
    });
    //this.log(`Container: done rendering, ${lines.length} lines, skip ${skip}, dirty ${dirty}`);
    this._lines = lines;
    return { lines, dirty, skip };
  }
  
  appendChild(c) {
    c.root = this.root || this;
    c.depth = (this.depth || 0) + 1;
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
  removeAllChildren() {
    if (!this.children || !this.children.length) return;
    this.children.forEach(c => c.dispose());
    this.children = [];
  }
  
  static isContainer(inst) {
    return inst && inst.children && inst.removeChild;
  }
}

module.exports = Container;