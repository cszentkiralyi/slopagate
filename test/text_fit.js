const Text = require('../src/lib/components/text');

let original = `
This is normal text. It should probably wrap because it's more than 40 characters, but ultimately nothing crazy should happen.

Then there is a list:

1. One list item that gets wrapped because it, too, is quite long. Respect the list and list the respect or something, I dunno.
2. Anotha one
3. This time we don't need to wrap (again)

* A list
- It mixes \`*\` and \`-\` but honestly I don't care
* Does it work? event with a long list that I'm going to be wrapping? Please god don't let me down, not now. We're so close.


Back to normal.
`;
let width = 40;

let fitted = Text.fit(
  original,
  width,
  {
    indent: false,
    align: false,
    forceAlign: true
  }
);
fitted.forEach(l => console.log(l));