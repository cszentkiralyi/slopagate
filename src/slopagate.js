const process = require('node:process');
const path = require('node:path');
const fsSync = require('node:fs');

const { marked } = require('marked');
const { markedTerminal } = require('marked-terminal');

marked.use(markedTerminal({
  // <https://github.com/mikaelbr/marked-terminal/tree/7eb3cd342807a87688b9a8788eab54816ed38279?tab=readme-ov-file#options>
  reflowText: true,
  showSectionPrefix: false,
  tab: 2
}));


const CLI_PROMPT = '❯ ';

const Events = require('./modules/events.js');
const Harness = require('./modules/harness.js');
const TUI = require('./modules/tui.js');

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
  let terminal = new TUI.Terminal(),
      ui_history = new TUI.Container(),
      ui_lower = new TUI.Container(),
      spinner = new TUI.Spinner({
        animation: 'braille-small',
        message: 'Autofilling...',
        padding: { left: 1 },
        hidden: true,
        loop: false
      }),
      ui_input = new TUI.TextInput({
        prompt: CLI_PROMPT
      });
  terminal.appendChild(ui_history);
  terminal.appendChild(ui_lower);
  ui_lower.appendChild(spinner);
  ui_lower.appendChild(ui_input);
  ui_input.focus();

  /* Banner */
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
  ui_history.appendChild(new TUI.Text({
    content: TUI.ANSI.bold(
      (process.stdout.columns >= 102) ? BANNER_LARGE : BANNER_TINY,
    ),
    fg: 'white'
  }));
  ui_history.appendChild(new TUI.Text({ content: TUI.ANSI.fg(`Connection: ${CONFIG.connection}`, 'gray') }));
  ui_history.appendChild(new TUI.Text({ content: TUI.ANSI.fg(`Model: ${CONFIG.model}`, 'gray') }));

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
      let systemPath = path.join(possiblePath, 'SYSTEM.md') 
      systemPrompt = fsSync.readFileSync(systemPath, { encoding: 'utf-8' });
      ui_history.appendChild(new TUI.Text({ content: `System: ${path.relative(CONFIG.rootDirectory, systemPath)}`, fg: 'gray' }))
    } catch (err) { /* don't care */ }
  });
  
  let harness = new Harness({
    session: {
      model: CONFIG.model,
      connection: CONFIG.connection,
      
      systemPrompt: systemPrompt
    }
  });

  const sigint = () => {
    let sessionPath = path.join(process.env.HOME, '.slopagate', 'history');
    fsSync.mkdirSync(sessionPath, { recursive: true }, err => console.error(err));
    let json = harness.session.serialize();
    fsSync.writeFileSync(path.join(sessionPath, harness.session.id + '.json'), json);
    console.log(`\nEnding session ${harness.session.id}`);
    harness.session.dispose();
    terminal.dispose();
    process.exit(0);
  };
  ui_input.shortcuts = { '^C': sigint };
  
  ui_history.appendChild(new TUI.Text({ content: '' }));
  ui_history.appendChild(new TUI.Text({ content: `Started session ${harness.session.id}.\n` }))
  
  const addUserHistory = (s) => {
    ui_history.appendChild(new TUI.Text({
      content: s,
      align: CLI_PROMPT.length,
      padding: { top: 1, left: 1, right: 1, bottom: 1 }
    }));
  };
  const addModelHistory = (s) => {
    ui_history.appendChild(new TUI.Text({
      content: s,
      padding: { top: 1, left: 1, right: 1, bottom: 1 },
      bg: 94
    }));
  };
  const addToolHistory = (s) => {
    ui_history.appendChild(new TUI.Text({
      content: s,
      padding: { top: 1, left: 1, right: 1, bottom: 1 },
      fg: 245 /* muted */
    }));
  };
  
  Events.on('model:content', (event) => {
    if (event.content) {
      let content = marked.parse(event.content).trim();
      addModelHistory(content);
    }
    if (!event.done) { 
      spinner.start();
      spinner.show();
    } else {
      spinner.hide();
    }
    terminal.draw();
  });
  Events.on('tool:message', (event) => {
    addToolHistory(event.content);
    if (!event.done) {
      spinner.start();
      spinner.show();
    } else {
      spinner.hide();
    }
    terminal.draw();
  })
  
  terminal.draw();
  ui_input.onInput = (input) => {
    if (input[0] === '!' || input[0] === '/') {
      if (input === '/debug model') {
        setTimeout(() => Events.emit('model:content', {
          content: 'Hello there! **This** is _some_ `Markdown` I think.',
        }), 300);
      } else if (input === '/debug done') {
        setTimeout(() => Events.emit('model:content', { done: true }), 300);
      } else if (input.split(' ')[0] === '/ignore') {
      } else {
        // shell command or slash command
        ui_history.appendChild(new TUI.Text({ content: 'Shell & slash commands not yet implemented.'}))
      }
    } else {
      Events.emit('user:message', { message: input });
      addUserHistory(CLI_PROMPT + input);
      
      spinner.start();
      spinner.show();
    }

    ui_input.clear();
    terminal.draw();
  }
}

repl();