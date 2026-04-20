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


const CLI_PROMPT = '❯ ';

const Events = require('./components/events.js');
const Harness = require('./components/harness.js');
const TUI = require('./components/tui.js');

const CONFIG = {
  rootDirectory: process.env.PWD,
  slopDirectory: process.env.SLOP_PROJECT_DIR || `${process.env.PWD}/.slop`,

  port: process.env.SLOP_PORT || 11434,
  host: process.env.SLOP_HOST || 'http://127.0.0.1',
  endpoint: process.env.SLOP_ENDPOINT || '/api/chat',
  
  model: process.env.SLOP_MODEL || 'qwen3.5:9b-32k'
};
CONFIG.connection = `${CONFIG.host}:${CONFIG.port}${CONFIG.endpoint}`;


const SYSTEM_PROMPT_PATHS = [
  path.join(process.env.HOME, '.slopagate'),
  CONFIG.slopDirectory
]

async function repl() {
  let terminal = new TUI.Terminal();
  let ui_history = new TUI.Container();
  let ui_input = new TUI.TextInput({
    prompt: CLI_PROMPT
  });
  terminal.appendChild(ui_history);
  terminal.appendChild(ui_input);
  ui_input.focus();

  /* Banner */
  const BANNER = `
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
  ui_history.appendChild(new TUI.Text({ content: TUI.ANSI.bold(TUI.ANSI.fg(BANNER, 'white')) }));
  ui_history.appendChild(new TUI.Text({ content: TUI.ANSI.fg(`Connection: ${CONFIG.connection}`, 'gray') }));
  ui_history.appendChild(new TUI.Text({ content: TUI.ANSI.fg(`Model: ${CONFIG.model}`, 'gray') }));
  ui_history.appendChild(new TUI.Text({ content: '' }));

  /* TODO
  * 1. ~~Load system prompt from one of ~/.slopagate/SYSTEM.md or .slop/SYSTEM.md,
  *    in that order~~
  * 2. Load project prompts from these places, concatenating results:
  *    - ~/.slopagate/SLOP.md
  *    - .slop/SLOP.md
  *    - SLOP.md
  * 3. ~~Generate chat ID, 16-char random alphanum~~
  * 4. ~~Send system prompt~~
  */

  let systemPrompt = null;
  SYSTEM_PROMPT_PATHS.forEach(possiblePath => {
    if (systemPrompt) return;
    try {
      systemPrompt = fsSync.readFileSync(path.join(possiblePath, 'SYSTEM.md'), { encoding: 'utf-8' });
    } catch (err) { /* don't care */ }
  });
  
  let harness = new Harness({
    session: {
      model: CONFIG.model,
      connection: CONFIG.connection,
      
      systemPrompt: systemPrompt
    }
  });

  let _CTRL_C_FLAG = false;
  rl.on('SIGINT', () => {
    if (_CTRL_C_FLAG) {
      let sessionPath = path.join(process.env.HOME, '.slopagate', 'history');
      fsSync.mkdirSync(sessionPath, { recursive: true }, err => console.error(err));
      let json = harness.session.serialize();
      fsSync.writeFileSync(path.join(sessionPath, harness.session.id + '.json'), json);
      console.log(`\nEnding session ${harness.session.id}`);
      harness.session.dispose();
      terminal.dispose();
      process.exit(0);
    }
    _CTRL_C_FLAG = true;
    setTimeout(() => _CTRL_C_FLAG = false, 2000);
  });
  
  let spinner = null;

  ui_history.appendChild(new TUI.Text({ content: `Started session ${harness.session.id}.\n` }))
  
  Events.on('model:content', (event) => {
    if (event.content) {
      let content = marked.parse(event.content);
      ui_history.appendChild(new TUI.Text({
        content: TUI.ANSI.bg(content, 2),
        padding: { top: 1, left: 1, right: 1, bottom: 1 }
      }));
    }
    if (spinner) {
      ui_history.removeChild(spinner);
      if (!event.done) { 
        spinner.start();
        ui_history.appendChild(spinner);
      }
    }
    terminal.draw();
  });
  Events.on('tool:message', (event) => {
    ui_history.appendChild(new TUI.Text({ content: TUI.ANSI.fg(event.content, 245 /* muted */)}));
    if (spinner) {
      ui_history.removeChild(spinner);
      if (!event.done) { 
        spinner.start();
        ui_history.appendChild(spinner);
      }
    }
    terminal.draw();
  })
  
  terminal.draw();
  ui_input.onInput = (input) => {
    if (input[0] === '!' || input[0] === '/') {
      if (input === '/debug model') {
        Events.emit('model:content', {
          content: 'Hello there! **This** is _some_ `Markdown` I think.',
        });
      } else if (input === '/debug done') {
        Events.emit('model:content', { done: true });
      } else {
        // shell command or slash command
        ui_history.appendChild(new TUI.Text({ content: 'Shell & slash commands not yet implemented.'}))
      }
    } else {
      Events.emit('user:message', { message: input });
    }

    ui_history.appendChild(new TUI.Text({
      content: CLI_PROMPT + input + '\n',
      align: CLI_PROMPT.length
    }));

    spinner = new TUI.Spinner({
      size: 'star',
      message: 'Autofilling...',
      padding: { top: 1 }
    });
    ui_history.appendChild(spinner);

    ui_input.clear();
    terminal.draw();
  }
}

repl();