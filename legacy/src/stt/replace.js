const process = require('node:process');
const fs = require('node:fs');

const replaceTextInFile = () => {
  const [filename, oldStr, newStr] = process.argv.slice(2, process.argv.length);

  let file = fs.readFileSync(filename);
  if (file.includes(oldStr)) {
    let content = file.toString().replace(oldStr, newStr);
    fs.writeFileSync(filename, content);
    return 0;
  }

  return 1;
};

module.exports = { replaceTextInFile };
