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
      // Only numbers in range 0-255 are valid
      if (color >= 0 && color <= 255) {
        return color;
      }
    }
    return null;
  }
  static fgEsc(code) { return `\x1B[38:5:${code}m`; }
  static bgEsc(code) { return `\x1B[48:5:${code}m`; }
  static fg(text, color) {
    let code = this.resolveColor(color);
    if (!code) return text;
    return ANSI.esc(text, ANSI.fgEsc(code));
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
    return `\x1B[?25l`;
  }
  static showCursor() {
    return `\x1B[?25h`;
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
  static eraseLine() {
    // 0 = cursor to right edge
    return '\x1B[0K';
  }

  static esc(s, esc) {
    if (!s || !esc) return s;
    let reset = ANSI.RESET_ESCAPE + esc;
    return `${esc}${s.replaceAll(ANSI.RESET_ESCAPE, reset)}${ANSI.RESET_ESCAPE}`;
  }
  
  static measure(s) {
    if (!s) return 0;
    let stripped = s.replaceAll(/\x1B\[[0-9;:]*[A-Za-z]/g, '');
    // Replace multi-byte Unicode characters (emojis, etc.) with _M
    let normalized = stripped.replaceAll(/[\u{2700}-\u{2757}\u{2795}-\u{27BF}\u{1F300}-\u{1F9FF}]/gu, '_M');
    return normalized.length;
  }
}


module.exports = ANSI;