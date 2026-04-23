const process = require('node:process');
const path = require('node:path');
const fsSync = require('node:fs');

const Events = require('../events.js');
const ANSI = require('../lib/ansi.js');
const Harness = require('../lib/harness.js');
const Interface = require('./interface.js');
const SD = require('../lib/sd.js');

class Program {
  config;
  harness;
  interface;

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

    this.interface = new Interface({
      banner: { content: ANSI.bold(banner), fg: 'white' }
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
    this.interface.getById('chat-input').onInput = (input, inst) => {
      Events.emit('user:message', { message: input });
      this.interface.addMessage({
        role: 'user',
        content: this.interface.getById('chat-input').prompt + input
      });
      this.interface.spinner.start();
      this.interface.spinner.show();
      inst.clear();
      this.interface.draw();
    };
    this.interface.getById('chat-input').onKey = async (k, later, inst) => {
      //inst.log('onKey called');
      let statusline = this.interface.statusLine;
      if (!statusline.hidden) statusline.hide();
      later(() => this.interface.draw());
    }


    Events.on('user:abort', (event) => {
      this.interface.spinner.hide();
      this.interface.statusLine.show();
      this.interface.spinner.log('Hidden');
      this.interface.draw();
    });
    Events.on('model:content', (event) => {
      if (event.content) {
        this.interface.addMessage({
          role: 'model',
          content: SD.toAnsi(event.content.trim())
        });
      }
      if (!event.done) { 
       this.interface.spinner.start();
       this.interface.spinner.show();
      } else {
        this.interface.spinner.hide();
      }
      this.interface.draw();
    });
    Events.on('tool:message', (event) => {
      this.interface.addMessage({ role: 'tool', content: event.content });
      if (!event.done) { 
       this.interface.spinner.start();
       this.interface.spinner.show();
      } else {
        this.interface.spinner.hide();
      }
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
}

module.exports = Program;