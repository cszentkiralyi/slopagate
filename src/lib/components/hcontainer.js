const ANSI = require('../ansi.js');
const Component = require('./component.js');
const Container = require('./container.js');
const { Logger } = require('../../util.js');

class HContainer extends Container {
  name = 'HContainer';

  render(width) {
    let lines = [], dirty = false, rem;
    if (this.children && this.children.length) {
      let parts = [],
          visibleChildren = this.children.filter(c => !c.hidden),
          gap = (visibleChildren.length - 1) * (this.gap || 0),
          leftPad = (this.padding && this.padding.left) || 0,
          rightPad = (this.padding && this.padding.right) || 0,
          rem = width - gap - leftPad - rightPad,
          result;
      this.children.forEach((child, i, children) => {
        if (child.hidden) {
          Logger.log(`HContainer: skipping hidden child ${child.name}`);
          return;
        }
        if (rem <= 0) return;
        result = child.render(rem);
        dirty = dirty ||= result.dirty;
        parts.push(...(result.lines));
        rem -= result.lines.reduce((m, l) => m + (l && ANSI.measure(l) || 0), 0);
      });
      let line = leftPad ? ANSI.cursorHoriz(leftPad) : '';
      line += parts.join(' '.repeat(gap));
      // Right-align the entire group if justify is 'right'
      if (this.justify === 'right') {
        const totalLen = ANSI.measure(line);
        const avail = width - leftPad - rightPad;
        if (totalLen < avail) {
          line = ANSI.cursorHoriz(avail - totalLen) + line;
        }
      }
      lines.push(line);
    }
    
    dirty ||= Component.isDirty(this._lines, lines);
    if (dirty) this._lines = lines;
    return { lines, dirty, skip: dirty ? 0 : 1 };
  }
};

module.exports = HContainer;