class ANSI {
  //static RESET_ESCAPE = '\x1B[0m';
  static RESET_ESCAPE = '\u001b[0m';
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

  static resolveColor(color) {
    if (!color && color !== 0) return null; // 0 is valid
    let t_color = typeof color;
    if (t_color === 'string') {
      return this.COLORS.get(color);
    } else if (t_color === 'number') {
      return color;
    }
    return null;
  }
  static fgEsc(code) { return `\x1B[38:5:${code}m`; }
  static bgEsc(code) { return `\x1B[48:5:${code}m`; }
  static fg(text, color) {
    let code = this.resolveColor(color);
    if (!code) return text;
    return ANSI.esc(text, ANSI.fgEsc(code));
    return `${ANSI.fgEsc(code)}${text}${this.RESET_ESCAPE}`;
  }
  static bg(text, color) {
    let code = this.resolveColor(color);
    if (!code) return text;
    return ANSI.esc(text, ANSI.bgEsc(code));
  }
  static bold(text) {
    return ANSI.esc(text, `\x1B[1m`);
  }
  static dim(text) {
    return ANSI.esc(text, `\x1B[2m`);
  }
  static italic(text) {
    return ANSI.esc(text, `\x1B[3m`);
  }
  static underline(text) {
    return ANSI.esc(text, `\x1B[4m`);
  }
  static invert(text) {
    return ANSI.esc(text, `\x1B[7m`);
  }
  static strike(text) {
    return ANSI.esc(text, `\x1B[9m`);
  }
  
  static hideCursor() {
    console.log(`\x1B[?25l`);
  }
  static showCursor() {
    console.log(`\x1B[?25h`);
  }

  static esc(s, esc) {
    if (!s || !esc) return s;
    let reset = ANSI.RESET_ESCAPE + esc;
    return `${esc}${s.replaceAll(ANSI.RESET_ESCAPE, reset)}${ANSI.RESET_ESCAPE}`;
  }
}


module.exports = ANSI;