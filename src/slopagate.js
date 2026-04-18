const process = require('node:process');
const readline = require('node:readline/promises');
const path = require('node:path');
const fsSync = require('node:fs');

const { marked } = require('marked');
const { markedTerminal } = require('marked-terminal');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

marked.use(markedTerminal({
  // <https://github.com/mikaelbr/marked-terminal/tree/7eb3cd342807a87688b9a8788eab54816ed38279?tab=readme-ov-file#options>
  reflowText: true,
  showSectionPrefix: false,
  tab: 2
}));

const Terminal = require('./ui/terminal.js');
const Session = require('./session.js');

const Tools = require('./tools.js');

const CONFIG = {
  projectDirectory: process.env.SLOP_PROJECT_DIR || `${process.env.PWD}/.slop`,

  port: process.env.SLOP_PORT || 11434,
  host: process.env.SLOP_HOST || 'http://127.0.0.1',
  endpoint: process.env.SLOP_ENDPOINT || '/api/chat',
  
  model: process.env.SLOP_MODEL || 'qwen3.5:9b-32k'
};
CONFIG.connection = `${CONFIG.host}:${CONFIG.port}${CONFIG.endpoint}`;

/* Banner */
Terminal.Text.color('bold', `
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

`);
Terminal.Text.color('system', `Connection: ${CONFIG.connection}`);
Terminal.Text.color('system', `Model: ${CONFIG.model}`);
console.log();

/* TODO
 * 1. Load system prompt from one of ~/.slopagate/SYSTEM.md or .slop/SYSTEM.md,
 *    in that order
 * 2. Load project prompts from these places, concatenating results:
 *    - ~/.slopagate/SLOP.md
 *    - .slop/SLOP.md
 *    - SLOP.md
 * 3. ~~Generate chat ID, 16-char random alphanum~~
 * 4. Send system prompt
 */


async function repl() {
  let session = new Session({
    model: CONFIG.model,
    connection: CONFIG.connection,
    tools: Tools.all()
  });

  let _CTRL_C_FLAG = false;
  rl.on('SIGINT', () => {
    if (_CTRL_C_FLAG) {
      let sessionPath = path.join(process.env.HOME, '.slopagate', 'history');
      fsSync.mkdirSync(sessionPath, { recursive: true }, err => console.error(err));
      let json = session.serialize();
      fsSync.writeFileSync(path.join(sessionPath, session.id + '.json'), json);
      Terminal.Text.color('default', `\nEnding session ${session.id}`);
      session.dispose();
      process.exit(0);
    }
    _CTRL_C_FLAG = true;
    setTimeout(() => _CTRL_C_FLAG = false, 2000);
  });

  Terminal.Text.color('bold', `Started session ${session.id}.\n`);
  while (true) {
    let userInput = await rl.question('❯ ');
    console.log(); // newline
    
    if (userInput[0] === '!' || userInput[0] === '/') {
      // shell command or slash command
      console.log('Shell & slash commands not yet implemented.');
    } else {
      let userMessage = { role: 'user', content: userInput };
      let modelMessage = await session.send(userMessage);

      if (modelMessage.content) {
        console.log(marked.parse(modelMessage.content));
      } else {
        console.log('No message content, dumping JSON:\n', JSON.stringify(modelMessage));
      }
    }

    console.log();
  }
}

repl();