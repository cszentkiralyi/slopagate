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
  const SessionManager = require('./lib/session-manager.js');

  // Parse --resume <id> from argv
  const resumeIdx = process.argv.indexOf('--resume');
  let resumeId = null;
  if (resumeIdx !== -1 && process.argv[resumeIdx + 1]) {
    resumeId = process.argv[resumeIdx + 1];
  }

  const session = {
    config: new Map(),
    promptDoc: null
  };

  if (resumeId) {
    const sm = new SessionManager();
    const history = sm.readSession(resumeId);
    session.id = resumeId;
    session.messages = history;
  }

  let p = new Program({
    banner: (process.stdout.columns >= 102) ? BANNER_LARGE : BANNER_TINY,
    session: session
  });
}

repl();