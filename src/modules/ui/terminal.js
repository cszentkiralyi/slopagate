const process = require('node:process');
const fs = require('node:fs');

const ANSI = require('./ansi.js');
const Container = require('./container.js');

class Terminal extends Container {
  #first_draw = true;
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
    let nextDrawMs = this.#last_draw + Terminal.DRAW_GAP_MS,
        now = Date.now();
    let impl = () => {
      if (this.#next_draw_id) {
        clearTimeout(this.#next_draw_id);
        this.#next_draw_id = null;
      }
      this.#last_draw = Date.now();
      this.#draw_inner();
    };
    if (!this.#last_draw || now > nextDrawMs) {
      impl();
      return;
    }
    this.#next_draw_id = setTimeout(impl, nextDrawMs - now);
    return;
  }
  
  #draw_inner() {
    this.#last_draw = Date.now();

    let width = process.stdout.columns,
        height = process.stdout.rows;
        
    let prev = this._lines;
    let { lines, dirty, skip } = this.render(width);
    
    if (this.#first_draw) {
      this.#first_draw = false;
      fs.writeSync(process.stdout.fd, lines.join('\n'));
      return;
    }
    
    if (!dirty) return;
    
    let output = '',
        clearHeight = Math.min(
          height,
          prev.length - skip
        );
    
    // FIXME: sometimes we eat one too many lines, seems like only when the user strikes backspace
    output += Terminal.cursorUp(clearHeight);
    output += Terminal.eraseDown();
    output += lines.slice(skip).join('\n');

    fs.writeSync(process.stdout.fd, output);
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
    if (n == 0) return '\r';
    // Move to the beginning of the line, then up n lines
    return `\x1B[${n}F`;
  }
  static eraseDown() {
    // 0 = cursor to end of screen, 1 = cursor to beginning, 2 = entire screen
    return `\x1B[0J`;
  }
  
}

module.exports = Terminal;
