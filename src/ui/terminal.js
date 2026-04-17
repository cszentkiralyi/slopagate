class Text {
  static ANSI_ESCAPES = {
    // \x1B is equivalent to the terminal \033, don't ask me
    'default': '\x1B[0m',
    'bold': '\x1B[1;37m',
    'system': '\x1B[38:5:242m',
    'muted': '\x1B[38:5:245m',
  }
  
  // TODO: not final, sometimes we don't want a newline for example.
  static color(c, s) {
    let esc = Text.ANSI_ESCAPES[c];
    if (esc) console.log(`${esc}${s}${Text.ANSI_ESCAPES['default']}`);
  }
}


module.exports = { Text };