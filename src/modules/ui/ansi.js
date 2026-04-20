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


module.exports = ANSI;