const Component = require('./component.js');
const Container = require('./container.js');

class HContainer extends Container {
  render(width) {
    let lines = [], dirty = false;;
    if (this.children && this.children.length) {
      let dirty = false, parts = [],
          gap = (this.children.length - 1) * (this.gap || 0),
          result;
      this.children.forEach(child => {
        result = child.render(width - gap);
        dirty = dirty ||= result.dirty;
        parts.push(...(result.lines));
      });
      lines.push(parts.join(' '.repeat(gap)));
    }
    
    dirty ||= Component.isDirty(this._lines, lines);
    if (dirty) this._lines = lines;
    return { lines, dirty, skip: dirty ? 0 : 1 };
  }
};

module.exports = HContainer;