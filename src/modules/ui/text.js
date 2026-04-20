const ANSI = require('./ansi.js');
const Component = require('./component.js');

class Text extends Component {
  content;
  padding;
  fg;
  bg;

  constructor(props) { 
    super(props);

    if (props && typeof props.content !== 'string')
      throw new Error();

    Object.assign(this, props);
  }
  
  render(width) {
    let lines = [],
        blankLine = (new Array(width)).fill(' ').join('');
    if (this.padding && this.padding.top) {
      lines.push(...new Array(this.padding.top).map(_ => blankLine));
    }
    this.content.split('\n').forEach(line => {
      if (!line) {
        lines.push(blankLine);
        return;
      }
      
      lines.push(...Text.fit(line, width, { padding: this.padding }));
    });
    if (this.padding && this.padding.bottom) {
      lines.push(...(new Array(this.padding.bottom)).map(_ => blankLine));
    }

    let applyFg = this.fg ? s => ANSI.fg(s, this.fg) : s => s,
        applyBg = this.bg ? s => ANSI.bg(s, this.bg) : s => s;
    lines = lines.map(l => applyFg(applyBg(l)));
    let dirty = Component.isDirty(this._lines, lines);
    this._lines = lines;
    return {
      lines,
      dirty,
      skip: dirty ? 0 : lines.length
    };
  }
  
  static fit(s, width, options) {
    let lines = [],
        blank = (new Array(width)).fill(' ').join(''),
        { padding, align } = (options || {}),
        leftPad = (padding && padding.left) || 0,
        rightPad = (padding && padding.right) || 0,
        totalPadding = leftPad + rightPad,
        leftPadStr = leftPad ? (new Array(leftPad)).fill(' ').join('') : '',
        currentLine = '',
        rem;
    let finishLine = (line) => {
      for (rem = width - line.length; rem > 0; rem--) line += ' ';
      lines.push(line);
    }
    let firstLine = true,
        alignStr = align > 0 ? (new Array(align)).fill(' ').join('') : '';
    s.split('\n').forEach(line => {
      if (!line) {
        lines.push(blank);
      } else {
        currentLine = leftPadStr;
        if (!firstLine) currentLine += alignStr;
        line.split(' ').forEach(word => {
          let len = Text.measure(word);
          let lineLen = Text.measure(currentLine);
          if (lineLen + len + 1 + totalPadding <= width) {
            currentLine += ' ' + word;
          } else {
            for (let i = (width - lineLen); i > 0; i--) {
              currentLine += ' ' 
            }
            finishLine(currentLine);
            if (firstLine) firstLine = false;
            currentLine = leftPadStr;
            if (!firstLine && align)
              currentLine += alignStr;
            currentLine += word;
          }
        })
      }
    });
    if (currentLine.length > 0) {
      finishLine(currentLine);
    }
    
    return lines;
  }

  static measure(s) {
    return (s || '').replace(/\x1B\[[0-9;]*m/, '').length;
  }
}

module.exports = Text;