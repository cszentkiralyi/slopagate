const ANSI = require('../src/lib/ansi.js');

const code_sample = 'int main(int argv, char** argv) { return 0; }';

const diff = `here ${ANSI.fg('+123',
  70

)} ${ANSI.fg('-456',
160
)}`;

[
 // 255, 242, 8, 159, 197, 213, 141, 225, 229, 154
 213, 141
].forEach(c => {
  console.log('Normal text.');
  console.log(diff)
  //console.log(ANSI.fg(code_sample, c));
});