const ANSI = require('./ansi.js');

class Slopdown {
  static toAnsi(markdown) {
    // TODO
    // 1. Can we just use one regex to detect any pairs using \1, and
    //    then use one string replaceAllment fn?
    // 2. Can we avoid rendering other text inside a `?
    // 3. Detect code fences, requires swapping to markdown:line[]

    // Inline code (backticks) - highest priority to avoid partial matches
    markdown = markdown.replaceAll(/`([^`]+)`/g, (match, text) => {
      return ANSI.fg(text, 90);
    });

    // Bold + Italic - three asterisks or underscores
    markdown = markdown.replaceAll(/\*\*\*(.+?)\*\*\*/g, (match, text) => {
      return ANSI.fg(ANSI.italic(text), 90);
    });
    markdown = markdown.replaceAll(/___([^_]+)___/g, (match, text) => {
      return ANSI.fg(ANSI.italic(text), 90);
    });

    // Bold - two asterisks or underscores
    markdown = markdown.replaceAll(/\*\*(.+?)\*\*/g, (match, text) => {
      return ANSI.bold(text);
    });
    markdown = markdown.replaceAll(/__([^_]+)__/g, (match, text) => {
      return ANSI.bold(text);
    });

    // Italic - single asterisk or underscore (non-greedy, same delimiter both sides)
    markdown = markdown.replaceAll(/(\*|_)(.+?)\1/g, (match, delim, text) => {
      return ANSI.italic(text);
    });

    return markdown;
  }
}

module.exports = Slopdown;