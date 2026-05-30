const process = require('node:process');

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

  // Parse --resume <id> from argv
  const resumeIdx = process.argv.indexOf('--resume');
  let resumeId = null;
  if (resumeIdx !== -1 && process.argv[resumeIdx + 1]) {
    resumeId = process.argv[resumeIdx + 1];
  }

  let p = new Program({
    banner: (process.stdout.columns >= 102) ? BANNER_LARGE : BANNER_TINY,
    resumeId
  });
}

repl();