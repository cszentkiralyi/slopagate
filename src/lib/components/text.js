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

    if (props && typeof props.content !== 'string')
      throw new Error();

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
    this.content.split('\n').forEach(line => {
      if (!line || !line.length) {
        lines.push(blankLine);
        return;
      }
      
      lines.push(...Text.fit(line, width, {
        padding: this.padding,
        align: !!this.align,
        fill: !!this.bg,
      }));
    });
    if (this.padding && this.padding.bottom) {
      paddingLines = (new Array(this.padding.bottom).fill(blankLine));
      lines.push(...paddingLines);
    }

    // TODO: maybe make ANSI.#fgEsc & #bgEsc that guarantee their args are Numbers, so then
    // the public fgEsc & bgEsc can resolve the color and shorten stuff like this
    let applyFg = this.fg
          ? s => Text.applyEscape(s, ANSI.fgEsc(ANSI.resolveColor(this.fg)))
          : s => s,
        applyBg = this.bg
          ? s => Text.applyEscape(s, ANSI.bgEsc(ANSI.resolveColor(this.bg)))
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
  
  static LEADING_WHITESPACE_REGEX = /^(\w*)/;
  static LIST_ITEM_REGEX = /^\w*([a-zA-Z0-9]+[.\)]\w)/;
  static fit(s, width, options) {
    let lines = [],
        { padding, align, indent, fill } = (options || {}),
        leftPad = (padding && padding.left) || 0,
        rightPad = (padding && padding.right) || 0,
        leftPadStr = leftPad ? ' '.repeat(leftPad) : '',
        blank = fill ? ' '.repeat(width) : '',
        currentLine = '', alignStr = '', currentLen = 0,
        firstLine = true,
        rem;
    let finishLine = () => {
      //Logger.log(`Text: (${fill}, ${width}, ${width - Text.measure(currentLine)}, ${Text.measure(currentLine)}) ${JSON.stringify(currentLine)}`);
      if (fill && (rem = Math.abs((width - Text.measure(currentLine)) % width)) > 0) {
         currentLine += ' '.repeat(rem);
      }
      lines.push(currentLine);
    }
    s.split('\n').forEach(line => {
      if (!line) {
        lines.push(blank);
      } else {
        currentLine = leftPadStr;
        if (firstLine && (align || indent)) {
          let m;
          if (m = Text.LEADING_WHITESPACE_REGEX.exec(line))
            alignStr += ' '.repeat(Text.measure(m[1]));
          if (m = Text.LIST_ITEM_REGEX.exec(line)) {
            alignStr += ' '.repeat(Text.measure(m[1]));
          }
          Logger.log(`Text: set alignStr = ${JSON.stringify(alignStr)}`);
        }
        currentLen = currentLine.length
        line.split(' ').forEach(word => {
          if (!word || !word.length) {
            if (currentLen + 1 + rightPad <= width) {
              currentLine += ' ';
              currentLen++;
              return;
            }
          }
          let len = Text.measure(word);
          if (currentLen + len + 1 + rightPad <= width) {
            currentLine += ' ' + word;
            currentLen += len + 1;
          } else {
            finishLine(currentLine);
            if (firstLine) firstLine = false;
            currentLine = leftPadStr + alignStr;
            currentLen = currentLine.length + len;
            currentLine += word;
          }
        })
      }
    });
    if (Text.measure(currentLine) > 0) {
      finishLine();
    }
    
    return lines;
  }
  
  static applyEscape(s, esc) {
    if (!s || !esc) return s;
    let reset = ANSI.RESET_ESCAPE + esc;
    return `${esc}${s.replaceAll(ANSI.RESET_ESCAPE, reset)}${ANSI.RESET_ESCAPE}`;
  }

  static measure(s) {
    return (s || '').replaceAll(/(\x1B|\u001b)\[([0-9;:]*)+[A-Tmfin]/g, '').length;
  }
}

module.exports = Text;