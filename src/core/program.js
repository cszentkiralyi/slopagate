const process = require('node:process');
const path = require('node:path');
const fsSync = require('node:fs');
const os = require('node:os');
const { exec } = require('node:child_process');

const Events = require('../events.js');
const { Config } = require('../core/config.js');
const ANSI = require('../lib/ansi.js');
const Harness = require('../lib/harness.js');
const Interface = require('./interface.js');
const Slopdown = require('../lib/sd.js');
const Context = require('../lib/context.js');

const { Logger } = require('../util.js');
const Timers = require('../lib/timers.js');

class Program {
  static SPINNER_MESSAGES = [
    'Autofilling',
    'Hallucinating',
    'Reticulating splines',
    'Checking with The Man',
    'Sidequesting',
    'Leaking API keys',
    'Going rogue',
    'Gobbling tokens',
    'Nuking production',
    'Babbling'
  ];

  static AFK_TIMEOUT = 3 * 60 * 1000;

  #userMessagesSinceRecap = 0;

  config;
  harness;
  interface;
  
  md;

  commands;
  
  get spinnerMessage() {
    let idx = Math.floor(Math.random() * Program.SPINNER_MESSAGES.length);
    return Program.SPINNER_MESSAGES[idx] + '...';
  }

  constructor({ banner }) {
    const configData = {
      rootDirectory: process.env.PWD,
      slopDirectory: process.env.SLOP_PROJECT_DIR || `${process.env.PWD}/.slop`,

      port: process.env.SLOP_PORT || 11434,
      host: process.env.SLOP_HOST || 'http://127.0.0.1',
      endpoint: process.env.SLOP_ENDPOINT || '/api/chat',

      model: process.env.SLOP_MODEL || 'qwen3.5:9b-65k',
      think: false,
      contextWindow: process.env.SLOP_CONTEXT_WINDOW || 65536,
    };
    configData.connection = `${configData.host}:${configData.port}${configData.endpoint}`;

    const configPath = path.join(os.homedir(), '.slopagate', 'config.json');
    let userConfig;
    try {
      userConfig = JSON.parse(fsSync.readFileSync(configPath, 'utf8'));
    } catch {
      userConfig = {};
    }
    Object.entries(userConfig).forEach(([k, v]) => {
      configData[k] = v;
    });

    let config = this.config = new Config(configData);
    
    this.timers = new Timers();
    
    this.md = new Slopdown({
      'strong': s => ANSI.fg(ANSI.bold(s), 'white'),
      'emphasis': s => ANSI.italic(s),
      'inline-code': s => ANSI.fg(s, 213),
      'code': s => ANSI.fg(s, 213)
    });
    
    this.commands = [
      { name: 'quit', handler: async () => await this.dispose() },
      {
        name: 'think',
        arguments: [{ name: 'setting', possible: [ 'true', 'false' ]}],
        handler: async (args) => await this.thinkCommand(args)
      },
      { name: 'compact', handler: async () => await this.compactCommand() },
      { name: 'recap', handler: async () => await this.recap() }
    ];
    this.input_modes = [
      { name: 'normal', prompt: Interface.CLI_PROMPT, default: true },
      { name: 'shell', prompt: '! ', trigger: '!' }
    ];


    this.interface = new Interface({
      banner: { content: ANSI.bold(banner), fg: 'white' },
      commands: this.commands.map(c => ({ name: c.name, arguments: c.arguments }))
    });

    
    let system_prompt_paths = [
      path.join(process.env.HOME, '.slopagate'),
      this.config.get('slopDirectory')
    ];
    let systemPrompt = null;
    system_prompt_paths.forEach(possiblePath => {
      if (systemPrompt) return;
      try {
        let systemPath = path.join(possiblePath, 'SYSTEM.md') 
        systemPrompt = fsSync.readFileSync(systemPath, { encoding: 'utf-8' });
        this.interface.addMessage({
          role: 'startup',
          content: `System: ${path.relative(this.config.get('rootDirectory'), systemPath)}`
        });
      } catch (err) { /* don't care */ }
    });

    this.harness = new Harness({
      session: {
        model: this.config.get('model'),
        connection: this.config.get('connection'),
        systemPrompt: systemPrompt
      }
    });


    this.interface.addMessage({
      role: 'startup',
      content: `Connection: ${this.config.get('connection')}`
    });
    this.interface.addMessage({
      role: 'startup',
      content: `Model: ${this.config.get('model')}`
    });
    this.interface.addMessage({
      role: 'startup',
      content: `Context window: ${this.config.get('contextWindow')}`
    });

    let chatInput = this.interface.getById('chat-input');
    chatInput.modes = this.input_modes;
    chatInput.shortcuts = {
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
    chatInput.onInput = async (input, inst) => {
      switch (inst.mode) {
        case 'shell':
          this.interface.addMessage({
            role: 'user',
            content: this.input_modes.find(m => m.name === inst.mode).prompt + input
          });
          let result = await new Promise((resolve) => {
            exec(input, (error, stdout, stderr) => {
              resolve((stderr ? stderr.trim() : stdout.trim()) || '');
            });
          });
          this.interface.addMessage({
            role: 'shell',
            content: result
          });
          break;
      case 'normal':
          if (input[0] === '/') {
            let [cmd, argstr] = input.substring(1).split(' ');
            await this.command(cmd, argstr);
          } else {
            Events.emit('user:message', { message: input });
            this.interface.addMessage({
              role: 'user',
              content: this.input_modes.find(m => m.name === inst.mode).prompt + input
            });
            this.#userMessagesSinceRecap++;
            this.interface.statusline.showSpinner(this.spinnerMessage);
            let estInputTok = this.harness.session.context.estimated_tokens,
                lastInputTok = this.harness.inputTokens;
            this.updateStatuslineTokens({
              inputTokens: (estInputTok > lastInputTok) ? estInputTok : lastInputTok,
              outputTokens: this.harness.outputTokens
            });
            this.#startAfkTimer();
          }
          break;
      }
      inst.clear();
      this.interface.draw();
    };
    chatInput.onKey = async (k, later, inst) => {
      this.#resetAfkTimer();
      if (this.interface.statusline.dismiss())
        later(() => this.interface.draw());
    };


    Events.on('user:abort', (event) => {
      this.interface.statusline.showMessage({
        content: '^C again to exit.',
        padding: { left: 1 },
        fg: 'gray'
      }, true);
      setTimeout(() => this.interface.statusline.dismiss() && this.interface.draw(), 2000);
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
    });
    Events.on('model:response', (evt) => this.#resetAfkTimer());
    Events.on('tool:response', (evt) => this.#resetAfkTimer());

    Events.on('metrics:tokens', (event) => {
      this.updateStatuslineTokens(event);
      this.interface.draw();
    });
    this.updateStatuslineTokens({ inputTokens: 0, outputTokens: 0 });

    this.interface.addMessage({ role: 'system', content: `Started session ${this.harness.session.id}.` });
    this.interface.draw();
  }
  
  async dispose() {
    this.timers.stop('afk');
    let sessionPath = path.join(process.env.HOME, '.slopagate', 'history');
    fsSync.mkdirSync(sessionPath, { recursive: true }, err => console.error(err));
    let json = this.harness.session.serialize();
    fsSync.writeFileSync(path.join(sessionPath, this.harness.session.id + '.json'), json);
    await this.harness.dispose();
    await this.interface.dispose();
    // HACK: we can't await a draw
    setTimeout(() => {
      console.log(`\nEnding session ${this.harness.session.id}`);
      process.exit(0);
    }, (1000 / 60) * 2);
  }


  #roundTokens(n) {
    if (n < 1000) return n;
    if (n < 1000000) return `${(n / 1000).toFixed(1)}K`;
    return `${(n / 1000000).toFixed(2)}M`;
  }
  updateStatuslineTokens({ inputTokens, outputTokens }) {
    if (Number.isNaN(inputTokens) || inputTokens == null) inputTokens = 0;
    if (Number.isNaN(outputTokens) || outputTokens == null) outputTokens = 0;
    let txt = this.interface.statusline.right, s, pct, c;
    s = `↑ ${this.#roundTokens(inputTokens)} │ ${this.#roundTokens(outputTokens)} ↓`;
    //s = `▲ ${this.#roundTokens(inputTokens)} │ ${this.#roundTokens(outputTokens)} ▼`;
    //s = `△${this.#roundTokens(inputTokens)} │ ${this.#roundTokens(outputTokens)}▽`;
    pct = 100 * (inputTokens + outputTokens) / this.config.get('contextWindow');
    if (pct > 50) c = 214;
    if (pct > 70) c = 1;
    pct = `${pct.toFixed(0)}%`;
    s += ` │ ${c ? ANSI.fg(pct, c) : pct}`;
    txt.padding ||= { right: 1 };
    txt.content = s;
  }
  
  async command(name, args) {
    let cmd = this.commands
      ? this.commands.filter(c => c.name === name)
      : null;
    if (!cmd || !cmd.length) {
      this.interface.addMessage({ role: 'system', content: `Unknown command "${name}".` });
      return;
    }
    if (cmd.length > 1) {
      this.interface.addMessage({ role: 'system', content: `Ambiguous command "${name}"` });
      return;
    }
    cmd = cmd[0];
    
    await cmd.handler(args);
  }
  
  async thinkCommand(bstr) {
    Logger.log(`thinkCommand "${JSON.stringify(bstr)}`);
    if (!bstr || !bstr.length) {
      this.config.set('think', !this.config.get('think'));
    } else {
      this.config.set('think', bstr === 'true' || bstr === 'on');
    }
    this.harness.session.setConfig('think', this.config.get('think'));
    let msg = {
      content: `Thinking ${this.config.get('think') ? 'enabled' : 'disabled'}.`,
      fg: 'gray'
    };
    this.interface.statusline.showMessage(msg, true);
  }

  async compactCommand() {
    Logger.log(`compactCommand`);
    let old_up = this.harness.session.context.tokens_up,
        old_down = this.harness.session.context.tokens_down,
        ctx = await this.harness.session.compact(),
        delta_up = ((ctx.tokens_up - old_up || 0)).toFixed(0),
        delta_down = ((ctx.tokens_down - old_down) || 0).toFixed(0),
        pct = (100 * ctx.estimated_tokens / ctx.limits.contextWindow).toFixed(0),
        msg = {
          content: `Context compacted: ↑${ctx.tokens_up} (${delta_up}) ↓${ctx.tokens_down} (${delta_down}) (${pct}%).`,
          fg: 'gray'
        };
    this.interface.statusline.showMessage(msg, true);
    this.interface.draw();
  }

  async recap() {
    // Not enough user activity to summarize
    if (this.#userMessagesSinceRecap < 2) return;

    // Filter to only 'user' and 'assistant' role messages first
    const filteredMessages = this.harness.session.context.messages.filter(
      m => m.role === 'user' || m.role === 'assistant'
    );

    // Get the most-recent filtered messages
    const recentMessages = filteredMessages.slice(-(this.#userMessagesSinceRecap * 2));
    
    // Not enough messages to be worth summarizing
    if (recentMessages.length < 4) return;

    Logger.log(`Program: recapping ${recentMessages.length} messages.`);

    // Convert to transcript string using toTranscript helper
    let transcript = recentMessages
      .map(m => Context.toTranscript(m))
      .join('\n');

    // Use send_private to avoid adding to history
    let summaryMessage = { role: 'user', content: `You are an assistant that's been interacting with a user. From your perspective, using terms like "we" and "I," summarize this transcript into a 1-sentence recap:\n\n${transcript}` };
    let summaryContext = new Context({
      tools: {},
      limits: {},
      budgets: {},
      messages: []
    });

    let summaryResponse = await this.harness.session.send_private(summaryContext, summaryMessage);

    if (!summaryResponse || !summaryResponse.message
        || !summaryResponse.message.content
        || !summaryResponse.message.content.length) {
      Logger.log(`Program: no recap summary.`);
      return;
    }
    let summaryContent = summaryResponse.message.content,
        content = `🕮  ${summaryContent}`;
    this.#userMessagesSinceRecap = 0;
    
    Logger.log(`Program: recap = ${content}`);

    // Add response as tool role message with 'Recap: ' prefix
    this.interface.addMessage({
      role: 'tool',
      content: content,
      padding: { left: 1, right: 1 }
    });
  }

  #startAfkTimer() {
    this.timers.start('afk', Program.AFK_TIMEOUT, () => this.#onAfkTimeout());
  }

  #resetAfkTimer() {
    this.timers.stop('afk');
    this.#startAfkTimer();
  }

  async #onAfkTimeout() {
    await this.recap();
  }
}

module.exports = Program;
