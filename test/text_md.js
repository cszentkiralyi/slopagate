const ANSI = require('../src/lib/ansi.js');
const SD = require('../src/lib/sd.js');
const Text = require('../src/lib/components/text.js');

let md = new SD({
  'strong': s => ANSI.fg(ANSI.bold(s), 'white'),
  'emphasis': s => ANSI.italic(s),
  'inline-code': s => ANSI.bg(ANSI.fg(` ${s} `, 160), 16),
  'code': s => ANSI.fg(s, 246)
});

/*
let content = `
This is *some* Markdown. Not a lot, **just a little**, and it _uses_ a __variety__ of symbols.

1. Here is a list.
2. Here is a second item.
3. I just remembered I don't have list alignment for \`-\` and \`*\`

\`\`\`lang-to-ignore
A code fence!
er
Compilation error.
\`\`\`

And triples? ***TEST**, dear god was that ___LOUD___? Anyway.
`;

console.log(content);
console.log('\n---\n');
console.log(md.toAnsi(content));
//console.log(content.split('\n').map(l => md.toAnsi(l)).join('\n'));
*/
let content = "I found `Text.measure()` in `src/lib/components/text.js`. I need to move it to `src/lib/ansi.js` as `ANSI.measure()`.\n\nLet me propose the changes:\n\n1. Remove the `measure()` static method from `Text` class in `text.js`\n2. Add `measure()` static method to `ANSI` class in `ansi.js`";
Text.fit(content, 60, { align: true }).forEach(l => console.log(l));
console.log('\n---\n');
console.log(md.toAnsi(content));
console.log(Text.fit(md.toAnsi(content), 60, { align: true }));
Text.fit(md.toAnsi(content), 60, { align: true }).forEach(l => console.log(l));
