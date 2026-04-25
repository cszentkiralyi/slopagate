const ANSI = require('../ansi.js');
const { Logger } = require('../../util.js');

const Component = require('./component.js');

class Text extends Component {
  content;
  padding;
  fg;
  bg;

  constructor(props) { 
    super(props);

    Object.assign(this, props);
  }
  
  render(width) {
    let lines = [],
        blankLine = this.bg ? ' '.repeat(width) : '',
        paddingLines;
    if (this.padding && this.padding.top) {
      paddingLines = (new Array(this.padding.top).fill(blankLine));
      lines.push(...paddingLines);
    }
    //this.log(`Text: content = ${JSON.stringify(this.content)}`);
    (this.content || '').split('\n').forEach(line => {
      if (!line || !line.length) {
        lines.push(blankLine);
        return;
      }
      
      lines.push(...Text.fit(line, width, {
        padding: this.padding,
        align: !!this.align,
        fill: !!this.bg,
        forceAlign: this.forceAlign,
        justify: this.justify
      }));
    });
    if (this.padding && this.padding.bottom) {
      paddingLines = (new Array(this.padding.bottom).fill(blankLine));
      lines.push(...paddingLines);
    }

    // TODO: maybe make ANSI.#fgEsc & #bgEsc that guarantee their args are Numbers, so then
    // the public fgEsc & bgEsc can resolve the color and shorten stuff like this
    let applyFg = this.fg
          ? s => ANSI.esc(s, ANSI.fgEsc(ANSI.resolveColor(this.fg)))
          : s => s,
        applyBg = this.bg
          ? s => ANSI.esc(s, ANSI.bgEsc(ANSI.resolveColor(this.bg)))
          : s => s;
    //Logger.log(`Text: lines = ${JSON.stringify(lines)}`);
    lines = lines.map(l => applyFg(applyBg(l)));
    let dirty = Component.isDirty(this._lines, lines);
    this._lines = lines;
    return {
      lines,
      dirty,
      skip: dirty ? 0 : lines.length
    };
  }
  
  static LEADING_WHITESPACE_REGEX = /^(\s*)/;
  static LIST_ITEM_REGEX = /^\s*([^\s]+\s*)/;
  static LIST_ITEM_REGEX_STRICT = /^\s*([0-9]*[\.\)]\s|[\-\*]\s)/;
  static fit(s, width, options) {
    let lines = [],
        { padding, align, forceAlign, indent, fill, justify } = (options || {}),
        leftPad = (padding && padding.left) || 0,
        rightPad = (padding && padding.right) || 0,
        leftPadStr = leftPad ? ' '.repeat(leftPad) : '',
        rightPadStr = rightPad ? ' '.repeat(rightPad) : '',
        blank = fill ? ' '.repeat(width) : '',
        currentLine = '', alignStr = '', currentLen = 0,
        rem, m;
    let finishLine = () => {
      //Logger.log(`Text: (${fill}, ${width}, ${width - ANSI.measure(currentLine)}, ${ANSI.measure(currentLine)}) ${JSON.stringify(currentLine)}`);
      currentLine += rightPadStr;
      if (fill && (rem = Math.abs((width - ANSI.measure(currentLine)) % width)) > 0) {
        currentLine += ' '.repeat(rem);
      } else if (justify === 'right' && (rem = Math.abs((width - ANSI.measure(currentLine)) % width))) {
        currentLine = ' '.repeat(rem) + currentLine;
      }
      lines.push(currentLine);
    }
    s.split('\n').forEach(line => {
      currentLine = '';
      if (!line) {
        lines.push(blank);
      } else {
        alignStr = '';
        if (indent && (m = line.match(Text.LEADING_WHITESPACE_REGEX))) {
          alignStr += ' '.repeat(ANSI.measure(m[1]));
          //Logger.log(`Text: indent detected ${JSON.stringify(alignStr)}`);
        }
        if ((forceAlign && (m = line.match(Text.LIST_ITEM_REGEX)))
            || (align && (m = line.match(Text.LIST_ITEM_REGEX_STRICT)))) {
          alignStr += ' '.repeat(ANSI.measure(m[1]));
          //Logger.log(`Text: list item detected ${JSON.stringify(alignStr)}`);
        }
        currentLine += leftPadStr;
        currentLen = currentLine.length
        line.split(' ').forEach((word, idx) => {
          let len = ANSI.measure(word);
          if (currentLen + len + 1 + rightPad <= width) {
            if (idx) {
              currentLine += ' ';
              currentLen++;
            }
            currentLine += word;
            currentLen += len;
          } else {
            finishLine(currentLine);
            currentLine = leftPadStr + alignStr;
            currentLen = currentLine.length + len;
            currentLine += word;
          }
        });
        if (ANSI.measure(currentLine)) finishLine();
      }
    });
    
    return lines;
  }
  
  static measure(s) {
    return (s || '').replaceAll(/(\x1B|\u001b)\[([0-9;:]*)+[A-Za-z]/g, '').length;
  }
}

module.exports = Text;