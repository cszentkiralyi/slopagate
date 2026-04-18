class Text {
  static ANSI_ESCAPES = {
    // \x1B is equivalent to the terminal \033, don't ask me
    'default': '\x1B[0m',
    'bold': '\x1B[1;37m',
    'system': '\x1B[38:5:242m',
    'muted': '\x1B[38:5:245m',
  }
  
  static RESET = '\x1B[0m';
  
  static COLORS = {
    'black': 0,
    'red': 1,
    'green': 2,
    'yellow': 3,
    'blue': 4,
    'purple': 5,
    'teal': 6,
    'grey': 7,
    'white': 15
  }
  static escapeBackground(c) { return `\x1B[48:5:${c}m`; }
  static escapeForeground(c) { return `\x1B[38:5:${c}m`; }
  
  static colorize(s, c) {
    if (!c || !(c in Text.ANSI_ESCAPES)) return s;
    let esc = Text.escapeForeground(Text.COLORS[c]);
    return `${esc}${s}${Text.RESET}`;
  }
  background(s, c) {
    if (!c || !(c in Text.ANSI_ESCAPES)) return s;
    let esc = Text.escapeBackground(Text.COLORS[c]);
    return `${esc}${s}${Text.RESET}`;
  }
  
  // TODO: not final, sometimes we don't want a newline for example.
  static color(c, s) {
    let esc = Text.ANSI_ESCAPES[c];
    if (esc) console.log(`${esc}${s}${Text.ANSI_ESCAPES['default']}`);
  }
}


module.exports = { Text };