const Component = require('./component.js');
const ANSI = require('../ansi.js');

class Container extends Component {
  _lines = []; // cache
  children = [];
  name = 'Container';
  #root = null;
  
  get root() { return this.#root; }
  set root(r) {
    //this.log(`${this.name}: setting root (null? ${this.#root == null}) (new root? ${(r === this.#root)})`);
    if (r === this.#root) return;
    this.#root = r;
    if (this.children.length) {
      //this.log(`${this.name}: recursively setting root on ${this.children.length} children`);
      this.children.forEach(c => c.root = r);
    }
  }
  
  constructor(props) { super(props); Object.assign(this, props); }
  
  render(width) {
    let lines = [],
        skip = 0,
        dirty = false,
        lastChild = this.children.length - 1,
        haveGap;
    let leftPad = this.padding?.left || 0,
        rightPad = this.padding?.right || 0,
        childWidth = width - leftPad - rightPad;
    //this.log(`${this.name}: starting render, width=${width}, childWidth=${childWidth}, pl=${leftPad}, pr=${rightPad}`);
    this.children.forEach((child,  i) => {
      if (!child || child.hidden) return;
      let result = child.render(childWidth);
      if (!result || !result.lines) {
        console.log(result);
        throw new Error();
      }
      lines.push(...result.lines.map(l => ANSI.cursorHoriz(leftPad) + l + ANSI.cursorHoriz(rightPad)));
      haveGap = this.gap && i < lastChild;
      if (haveGap) lines.push('');
      if (!dirty && result.skip) skip += result.skip + (haveGap && !result.dirty ? 1 : 0);
      dirty ||= result.dirty;
    });
    //this.log(`${this.name}: done rendering, ${lines.length} lines, skip ${skip}, dirty ${dirty}`);
    this._lines = lines;
    return { lines, dirty, skip };
  }
  
  dispose() {
    if (!this.children || !this.children.length) return;
    this.children.forEach(c => c.dispose());
  }
  
  appendChild(c) {
    //if (!this.root) this.log(`Missing root in ${this.name}!`);
    //if (this.root === this) this.log(`${this.name}.root is this.`);
    c.root = this.root || this;
    //this.log(`${this.name}: root is ours ${this.root === c.root}? us ${this === c.root}? Something else ${c.root != null}?`)
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