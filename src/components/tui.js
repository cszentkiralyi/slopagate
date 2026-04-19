const process = require('node:process');
const fs = require('node:fs');

class ANSI {
  static RESET_ESCAPE = '\x1B[0m';
  static COLORS = new Map([
    [ 'black', 0 ],
    [ 'red', 1 ],
    [ 'green', 2 ],
    [ 'yellow', 3 ],
    [ 'blue', 4 ],
    [ 'purple', 5 ],
    [ 'teal', 6 ],
    [ 'brightgrey', 7 ],
    [ 'gray', 8 ],
    [ 'brightred', 9 ],
    [ 'brightgreen', 110 ],
    [ 'brightyellow', 11 ],
    [ 'brightblue', 12 ],
    [ 'brightpurple', 13 ],
    [ 'brightteal', 14 ],
    [ 'white', 15 ],
  ]);

  static #resolveColor(color) {
    if (!color) return null;
    let t_color = typeof color;
    if (t_color === 'string') {
      return this.COLORS.get(color);
    } else if (t_color === 'number') {
      return color;
    }
    return null;
  }
  static fg(text, color) {
    let code = this.#resolveColor(color);
    if (!code) return text;
    return `\x1B[38:5:${code}m${text}${this.RESET_ESCAPE}`;
  }
  static bg(text, color) {
    let code = this.#resolveColor(color);
    if (!code) return text;
    return `\x1B[48:5:${code}m${text}${this.RESET_ESCAPE}`;
  }
  static bold(text) {
    return `\x1B[1m${text}${this.RESET_ESCAPE}`;
  }
  static dim(text) {
    return `\x1B[2m${text}${this.RESET_ESCAPE}`;
  }
  static italic(text) {
    return `\x1B[3m${text}${this.RESET_ESCAPE}`;
  }
  static underline(text) {
    return `\x1B[4m${text}${this.RESET_ESCAPE}`;
  }
  static strike(text) {
    return `\x1B[9m${text}${this.RESET_ESCAPE}`;
  }
  
  static hideCursor() {
    console.log(`\x1B[?25l`);
  }
  static showCursor() {
    console.log(`\x1B[?25h`);
  }
}

class Component {
  root;
  constructor(props) { Object.assign(this, props); }
  render(width) { return { lines: [], dirty: false }; }
  focus() { if (this.root && this.root.giveFocus) this.root.giveFocus(this); }
  static isDirty(prev, next) {
    if (!prev && !next) return false;
    if (!prev || !next) return true;
    if (prev.length != next.length) return true;
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== next[i]) return true;
    }
    return false;
  }
}

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
    c.root ||= this.root
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
      lines.push(new Array(this.padding.top).map(_ => blankLine));
    }
    this.content.split('\n').forEach(line => {
      if (!line) {
        lines.push(blankLine);
        return;
      }
      
      lines.push(...Text.fit(line, width, { padding: this.padding }));
      
      if (this.padding && this.padding.bottom) {
        lines.push(new Array(this.padding.top).map(''));
      }
      if (this.fg || this.bg) {
        let applyFg = this.fg ? s => ANSI.fg(s, this.fg) : s => s,
            applyBg = this.bg ? s => ANSI.bg(s, this.bg) : s => s;
        lines = lines.map(l => applyFg(applyBg(l)));
      }
    });
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
      for (rem = width - line.length - totalPadding; rem > 0; rem--) line += ' ';
      lines.push(line);
    }
    let firstLine = true,
        alignStr = align > 0 ? (new Array(align)).fill(' ').join('') : '';
    s.split('\n').forEach(line => {
      if (!line) {
        lines.push(blank);
      } else {
        currentLine = leftPadStr;
        line.split(' ').forEach(word => {
          let len = Text.measure(word);
          if (currentLine.length + len + 1 + totalPadding <= width) {
            currentLine += ' ' + word;
          } else {
            for (let i = (width - currentLine.length); i > 0; i--) {
              currentLine += ' ' 
            }
            finishLine(currentLine);
            currentLine = leftPadStr;
            if (!firstLine && align)
              currentLine += alignStr;
            currentLine += word;
          }
        })
      }
    });
    if (firstLine) firstLine = false;
    if (currentLine.length > 0) {
      finishLine(currentLine);
    }
    
    return lines;
  }

  static measure(s) {
    return (s || '').replace(/\x1B\[[0-9;]*m/, '').length;
  }
}

class TextInput extends Component {
  static SYMBOLS = {
    horizontal: '─',
    vertical: '│',
    nw: '┌',
    ne: '┐',
    se: '┘',
    sw: '└'
  };

  #value = '';
  #history = [];
  #historyIdx = -1;
  get value() { return this.#value; }

  render(width) {
    let prompt = this.prompt || '',
        value = prompt + this.value + '█',
        valueLines = Text.fit(value, width - 2, { align: prompt.length }),
        horiz = (new Array(width - 2)).fill(TextInput.SYMBOLS.horizontal).join(''),
        lines = [
          TextInput.SYMBOLS.nw + horiz + TextInput.SYMBOLS.ne,
          ...(valueLines.map(l => TextInput.SYMBOLS.vertical + l + TextInput.SYMBOLS.vertical)),
          TextInput.SYMBOLS.sw + horiz + TextInput.SYMBOLS.se
        ];
    lines = lines.map(l => ANSI.bg(l, 238));
    
    let dirty = Component.isDirty(this._lines, lines);
    this._lines = lines;
    return { lines, dirty, skip: (dirty ? 0 : lines.length) };
  }
  
  key(k) {
    // TODO: cursor position
    let char = k.charCodeAt(0);
    if (char === 13 && k.length === 1) { // newline / cr
      this.#historyIdx = -1;
      this.#history.push(this.#value);
      this.onInput(this.#value);
      return;
    } else if (char === 127 || char === 8) { // backspace
      if (this.#value.length == 0) return;
      this.#value = this.#value.substring(0, this.#value.length - 1);
      return;
    } else if (char === 38 || k === '\x1b[A') {  // up
      if (-this.#historyIdx < this.#history.length - 1) {
        this.#historyIdx--;
        this.#value = this.getHistory(this.#historyIdx);
      }
      return;
    } else if (char === 40 || k === '\x1b[B') { // down
      if (this.#historyIdx < 0) {
        this.#historyIdx++;
        this.#value = this.getHistory(this.#historyIdx);
      } else if (this.#historyIdx == 0) {
        this.#value = '';
      }
      return;
    } else if (char >= 128 || (char >= 32 && char <= 126)) {
      this.#value += k;
      return;
    }
  }
  
  clear() {
    this.#value = '';
  }
  
  getHistory(n) {
    if (n >= 0) {
      return this.#history[n] || '';
    } else {
      let l = this.#history.length,
          neg = Math.min(0, l - n - 1);
      return this.#history[neg] || '';
    }
  }
}

class Spinner extends Component {
  static FRAMES = {
    //small: [ '⠟', '⠯', '⠷', '⠾', '⠽', '⠻' ],
    small: [ "⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈" ],
    large: [ '⡿', '⣟', '⣯', '⣷', '⣾', '⣽', '⣻', '⢿' ]
  };
  static DELAY_MS = 400;
  
  #currentFrame = -1;
  #lastRender = null;
  #loop = true;
  message = null;
  size = null;
  
  constructor(props) {
    super(props);
    Object.assign(this, props);
    
    setTimeout(() => this.root.draw(), Spinner.DELAY_MS);
  }
  
  dispose() {
    this.#loop = false;
  }
  
  render(width) {
    let now = Date.now(),
        diff = (now - this.#lastRender);
    if (!this.#lastRender || diff >= Spinner.DELAY_MS) {
      if (++this.#currentFrame >= Spinner.FRAMES[this.size].length) {
        this.#currentFrame = 0;
      }
    }
    if (this.#loop) {
      setTimeout(() => this.root.draw(), Math.min(diff, Spinner.DELAY_MS));
    }
    let blank = (new Array(width)).fill(' ').join(''),
        leftPad = new Array(this.padding && this.padding.left || 0).fill(' ').join(''),
        rightPad = new Array(this.padding && this.padding.right || 0).fill(' ').join(''),
        spin = `${Spinner.FRAMES[this.size][this.#currentFrame]} ${this.message || ''}`;
    let lines = [
          ...(new Array(this.padding && this.padding.top || 0).fill(blank).join('\n')),
          `${leftPad}${spin}${rightPad}`,
          ...(new Array(this.padding && this.padding.bottom || 0).fill(blank).join('\n'))
        ].map(line => Text.fit(line, width)).flat(),
        dirty = Component.isDirty(this._lines, lines);
    if (dirty) this._lines = lines;
    return {
      lines, dirty, skip: (this.dirty ? 0 : lines.length)
    };
  }
}

class Terminal extends Container {
  #first_render = true;
  #focused = null;
  #was_raw = false;
  
  #last_draw = null;
  #next_draw_id = null;
  
  static DRAW_FPS = 60;
  static DRAW_GAP_MS = 1000 / this.DRAW_FPS;
  
  constructor(props) {
    super(props);
    Object.assign(this, props);
    
    this.#was_raw = process.stdin.isRaw || false;
    process.stdin.setEncoding('utf-8');
    process.stdin.setRawMode(true);

    ANSI.hideCursor();

    process.stdin.on('data', (k) => this.key(k));
    process.stdin.on('resize', () => this.draw());
  }
  dispose() {
    ANSI.showCursor();
    process.stdin.setRawMode(this.#was_raw);
  }
  
  draw() {
    if (this.#next_draw_id) return;
    let impl = () => {
      this.#next_draw_id = null;
      this.#last_draw = Date.now();
      this.#draw_inner();
    };
    if (!this.#last_draw || Date.now() - this.#last_draw > Terminal.DRAW_GAP_MS) {
      impl();
      return;
    }
    this.#next_draw_id = setTimeout(impl);
    return;
  }
  
  #draw_inner() {
    this.#last_draw = Date.now();

    let width = process.stdout.columns,
        height = process.stdout.rows;
        
    let prevLines = this._lines;
    let { lines, dirty, skip } = this.render(width);
    
    if (this.#first_render) {
      this.#first_render = false;
      fs.writeSync(process.stdout.fd, lines.join('\n'));
      return;
    }
    
    if (!dirty) return;
    
    let output = '';
    //output += Terminal.cursorUp(Math.min(prevLines.length, height - skip, height));
    output += Terminal.cursorUp(Math.min(lines.length - skip, prevLines.length, height - skip));
    output += Terminal.eraseFromCursor();
    output += lines.slice(skip).join('\n');

    fs.writeSync(process.stdout.fd, output);
  }
  
  appendChild(c) {
    c.root = this;
    super.appendChild(c);
  }
  
  giveFocus(c) {
    this.#focused = c;
  }
  takeFocus() {
    this.#focused = null;
  }
  key(k) {
    if (this.#focused && this.#focused.key) {
      this.#focused.key(k);
    }
    this.draw();
  }
  
  static cursorUp(n) {
    // Move to the beginning of the line, then up n lines
    return `\x1B[${n}F`;
  }
  static eraseFromCursor() {
    // 0 = cursor to end of screen, 1 = cursor to beginning, 2 = entire screen
    return `\x1B[0J`;
  }
  
}

module.exports = {
  ANSI,
  Component,
  Terminal,
  Container,
  Text,
  TextInput,
  Spinner
};