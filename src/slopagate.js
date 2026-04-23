const process = require('node:process');

/*
const { marked } = require('marked');
const { markedTerminal } = require('marked-terminal');

marked.use(markedTerminal({
  // <https://github.com/mikaelbr/marked-terminal/tree/7eb3cd342807a87688b9a8788eab54816ed38279?tab=readme-ov-file#options>
  reflowText: true,
  showSectionPrefix: false,
  tab: 2
}));
*/

const BANNER_LARGE = `
  ██████  ██▓     ▒█████   ██▓███   ▄▄▄        ▄████  ▄▄▄     ▄▄▄█████▓▓█████       ▄▄▄██▀▀▀██████ 
▒██    ▒ ▓██▒    ▒██▒  ██▒▓██░  ██▒▒████▄     ██▒ ▀█▒▒████▄   ▓  ██▒ ▓▒▓█   ▀         ▒██ ▒██    ▒ 
░ ▓██▄   ▒██░    ▒██░  ██▒▓██░ ██▓▒▒██  ▀█▄  ▒██░▄▄▄░▒██  ▀█▄ ▒ ▓██░ ▒░▒███           ░██ ░ ▓██▄   
  ▒   ██▒▒██░    ▒██   ██░▒██▄█▓▒ ▒░██▄▄▄▄██ ░▓█  ██▓░██▄▄▄▄██░ ▓██▓ ░ ▒▓█  ▄      ▓██▄██▓  ▒   ██▒
▒██████▒▒░██████▒░ ████▓▒░▒██▒ ░  ░ ▓█   ▓██▒░▒▓███▀▒ ▓█   ▓██▒ ▒██▒ ░ ░▒████▒ ██▓  ▓███▒ ▒██████▒▒
▒ ▒▓▒ ▒ ░░ ▒░▓  ░░ ▒░▒░▒░ ▒▓▒░ ░  ░ ▒▒   ▓▒█░ ░▒   ▒  ▒▒   ▓▒█░ ▒ ░░   ░░ ▒░ ░ ▒▓▒  ▒▓▒▒░ ▒ ▒▓▒ ▒ ░
░ ░▒  ░ ░░ ░ ▒  ░  ░ ▒ ▒░ ░▒ ░       ▒   ▒▒ ░  ░   ░   ▒   ▒▒ ░   ░     ░ ░  ░ ░▒   ▒ ░▒░ ░ ░▒  ░ ░
░  ░  ░    ░ ░   ░ ░ ░ ▒  ░░         ░   ▒   ░ ░   ░   ░   ▒    ░         ░    ░    ░ ░ ░ ░  ░  ░  
      ░      ░  ░    ░ ░                 ░  ░      ░       ░  ░           ░  ░  ░   ░   ░       ░  
                                                                                ░                  
                                Propagate the slop - slopagate.js

`;
const BANNER_TINY = `
  ██████  ██▓     ▒█████   ██▓███  
▒██    ▒ ▓██▒    ▒██▒  ██▒▓██░  ██▒
░ ▓██▄   ▒██░    ▒██░  ██▒▓██░ ██▓▒
  ▒   ██▒▒██░    ▒██   ██░▒██▄█▓▒ ▒
▒██████▒▒░██████▒░ ████▓▒░▒██▒ ░  ░
▒ ▒▓▒ ▒ ░░ ▒░▓  ░░ ▒░▒░▒░ ▒▓▒░ ░  ░
░ ░▒  ░ ░░ ░ ▒  ░  ░ ▒ ▒░ ░▒ ░     
░  ░  ░    ░ ░   ░ ░ ░ ▒  ░░       
      ░      ░  ░    ░ ░           

  Propagate the slop - slopagate.js                                   

`;

const repl = async () => {
  const Program = require('./core/program.js');
  let p = new Program({
    banner: (process.stdout.columns >= 102) ? BANNER_LARGE : BANNER_TINY
  });
}

repl();