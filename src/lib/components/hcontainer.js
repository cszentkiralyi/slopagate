const ANSI = require('../ansi.js');
const Component = require('./component.js');
const Container = require('./container.js');

class HContainer extends Container {
  name = 'HContainer';

  render(width) {
    let lines = [], dirty = false, rem;
    if (this.children && this.children.length) {
      let dirty = false, parts = [],
          gap = (this.children.length - 1) * (this.gap || 0),
          rem = width - gap,
          result;
      this.children.forEach((child, i, children) => {
        if (rem <= 0) return;
        result = child.render(rem);
        dirty = dirty ||= result.dirty;
        parts.push(...(result.lines));
        rem -= result.lines.reduce((m, l) => m + (l && ANSI.measure(l) || 0), 0);
      });
      lines.push(parts.join(' '.repeat(gap)));
    }
    
    dirty ||= Component.isDirty(this._lines, lines);
    if (dirty) this._lines = lines;
    return { lines, dirty, skip: dirty ? 0 : 1 };
  }
};

module.exports = HContainer;