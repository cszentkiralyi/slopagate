const process = require('node:process');
const path = require('node:path');
const fsSync = require('node:fs');

const Events = require('../events.js');
const ANSI = require('../lib/ansi.js');
const Harness = require('../lib/harness.js');
const Interface = require('./interface.js');
const Slopdown = require('../lib/sd.js');

class Program {
  static SPINNER_MESSAGES = [
    'Autofilling...'
  ];

  config;
  harness;
  interface;
  
  md;

  commands;
  
  get spinnerMessage() {
    let idx = Math.floor(Math.random() * Program.SPINNER_MESSAGES.length);
    return Program.SPINNER_MESSAGES[idx];
  }

  constructor({ banner }) {
    let config = this.config = {
      rootDirectory: process.env.PWD,
      slopDirectory: process.env.SLOP_PROJECT_DIR || `${process.env.PWD}/.slop`,

      port: process.env.SLOP_PORT || 11434,
      host: process.env.SLOP_HOST || 'http://127.0.0.1',
      endpoint: process.env.SLOP_ENDPOINT || '/api/chat',

      model: process.env.SLOP_MODEL || 'qwen3.5:9b-65k'
    };
    config.connection = `${config.host}:${config.port}${config.endpoint}`;
    
    this.md = new Slopdown({
      'strong': s => ANSI.fg(ANSI.bold(s), 'white'),
      'emphasis': s => ANSI.italic(s),
      'inline-code': s => ANSI.bg(ANSI.fg(` ${s} `, 160), 16),
      'code': s => ANSI.fg(s, 246)
    });
    
    this.commands = [
      { name: 'quit', handler: async () => await this.dispose() }
    ];


    this.interface = new Interface({
      banner: { content: ANSI.bold(banner), fg: 'white' },
      commands: this.commands.map(c => ({ name: c.name, arguments: c.arguments }))
    });

    
    let system_prompt_paths = [
      path.join(process.env.HOME, '.slopagate'),
      this.config.slopDirectory
    ];
    let systemPrompt = null;
    system_prompt_paths.forEach(possiblePath => {
      if (systemPrompt) return;
      try {
        let systemPath = path.join(possiblePath, 'SYSTEM.md') 
        systemPrompt = fsSync.readFileSync(systemPath, { encoding: 'utf-8' });
        this.interface.addMessage({
          role: 'startup',
          content: `System: ${path.relative(this.config.rootDirectory, systemPath)}`
        });
      } catch (err) { /* don't care */ }
    });

    this.harness = new Harness({
      session: {
        model: this.config.model,
        connection: this.config.connection,
        systemPrompt: systemPrompt
      }
    });


    this.interface.addMessage({
      role: 'startup',
      content: `Connection: ${this.config.connection}`
    });
    this.interface.addMessage({
      role: 'startup',
      content: `Model: ${this.config.model}`
    });

    this.interface.getById('chat-input').shortcuts = {
      '^C': ((inst) => {
        let ctrl_c = false, ctrl_timeout = null;
        return async (inst) => {
          if (ctrl_c) {
            if (ctrl_timeout) clearTimeout(ctrl_timeout)
            await this.dispose();
            return;
          }
          inst.clear();
          Events.emit('user:abort');
          ctrl_c = true;
          ctrl_timeout = setTimeout(() => ctrl_c = false, 2000);
        }
      })()
    };
    this.interface.getById('chat-input').onInput = async (input, inst) => {
      if (input[0] === '/') {
        let [cmd, argstr] = input.substring(1).split(' ');
        await this.command(cmd, argstr);
      } else {
        Events.emit('user:message', { message: input });
        this.interface.addMessage({
          role: 'user',
          content: this.interface.getById('chat-input').prompt + input
        });
        this.interface.statusline.showSpinner(this.spinnerMessage);
      }
      inst.clear();
      this.interface.draw();
    };
    this.interface.getById('chat-input').onKey = async (k, later, inst) => {
      if (this.interface.statusline.dismiss())
        later(() => this.interface.draw());
    }


    Events.on('user:abort', (event) => {
      this.interface.statusline.showMessage({
        content: '^C again to exit.',
        padding: { left: 1 },
        fg: 'gray'
      }, true);
      this.interface.draw();
    });
    Events.on('model:content', (event) => {
      if (event.content) {
        this.interface.addMessage({
          role: 'model',
          content: this.md.toAnsi(event.content.trim())
        });
      }
      (event.done)
        ? this.interface.statusline.hide()
        : this.interface.statusline.showSpinner(this.spinnerMessage);
      this.interface.draw();
    });
    Events.on('tool:message', (event) => {
      this.interface.addMessage({ role: 'tool', content: event.content });
      (event.done)
        ? this.interface.statusline.hide()
        : this.interface.statusline.showSpinner(this.spinnerMessage);
      this.interface.draw();
    })
  
    this.interface.addMessage({ role: 'system', content: `Started session ${this.harness.session.id}.` });
    this.interface.draw();
  }
  
  async dispose() {
    let sessionPath = path.join(process.env.HOME, '.slopagate', 'history');
    fsSync.mkdirSync(sessionPath, { recursive: true }, err => console.error(err));
    let json = this.harness.session.serialize();
    fsSync.writeFileSync(path.join(sessionPath, this.harness.session.id + '.json'), json);
    console.log(`\nEnding session ${this.harness.session.id}`);
    await this.harness.dispose();
    await this.interface.dispose();
    process.exit(0);
  }
  
  async command(name, args) {
    let cmd = this.commands
      ? this.commands.filter(c => c.name === name)
      : null;
    if (!cmd || !cmd.length || cmd.length > 1)
      throw new Error(`Ambiguous command "${name}"`);
    cmd = cmd[0];
    
    await cmd.handler(args);
  }
}

module.exports = Program;