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
const Skills = require('../lib/skills.js');

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
  #turn_start = 0;

  static EXP_FILE_REGEX = /[a-zA-Z0-9_\-]{4,}\.[a-zA-Z0-1]{3,}$/;
  #exp_fileReadWhitelist = new Set();

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
    // Defaults
    const configData = {
      root_dir: process.env.PWD,
      slop_dir: `${process.env.PWD}/.slop`,

      port: 11434,
      host: 'http://127.0.0.1',
      endpoint:'/api/chat',

      model: 'qwen3.5:9b-65k',
      context_window: 65536,
      num_predict: 16384,

      think: false,
      stream: false
    };
    // User
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
    // Env
    if (process.env.SLOP_PROJECT_DIR) configData.slop_dir = process.env.SLOP_PROJECT_DIR;
    if (process.env.SLOP_PORT) configData.port = parseInt(process.env.SLOP_PORT, 10);
    if (process.env.SLOP_HOST) configData.host = process.env.SLOP_HOST;
    if (process.env.SLOP_ENDPOINT) configData.endpoint = process.env.SLOP_ENDPOINT;
    if (process.env.SLOP_MODEL) configData.model = process.env.SLOP_MODEL;
    if (process.env.SLOP_CONTEXT_WINDOW) configData.context_window = parseInt(process.env.SLOP_CONTEXT_WINDOW, 10);

    configData.connection = `${configData.host}:${configData.port}${configData.endpoint}`;
    let config = this.config = new Config(configData);
    
    
    this.skills = new Skills();
    let skillsFiles = fsSync.globSync(path.join(this.config.get('slop_dir'), 'skills', '*', 'SKILL.md'));
    if (skillsFiles.length > 0) {
      let skillFiles = skillsFiles.map(skillPath => fsSync.readFileSync(skillPath, 'utf-8'));
      this.skills.addSkills(skillFiles);
    }
    
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
        handler: async (args) => this.thinkCommand(args)
      },
      { name: 'compact', handler: async () => this.compactCommand() },
      { name: 'recap', handler: async () => this.recap() },
      { name: 'bug', handler: async (args) => this.bugCommand(args) },
      { name: 'context', handler: async () => this.contextCommand() },
    ];
    this.input_modes = [
      { name: 'normal', prompt: Interface.CLI_PROMPT, default: true },
      { name: 'shell', prompt: '! ', trigger: '!' }
    ];

    this.skills.names.forEach(skillName => {
      this.commands.push({
        name: skillName,
        // TODO: implement this.handleSkill
        handler: async (args) => this.handleSkill(skillName, args),
        hint: this.skills.get(skillName).description
      });
    });


    this.interface = new Interface({
      banner: { content: ANSI.bold(banner), fg: 'white' },
      commands: this.commands.map(c => ({ name: c.name, arguments: c.arguments, hint: c.hint }))
    });

    
    let system_prompt_paths = [
      path.join(process.env.HOME, '.slopagate'),
      this.config.get('slop_dir')
    ];
    let systemPrompt = null;
    system_prompt_paths.forEach(possiblePath => {
      if (systemPrompt) return;
      try {
        let systemPath = path.join(possiblePath, 'SYSTEM.md') 
        systemPrompt = fsSync.readFileSync(systemPath, { encoding: 'utf-8' });
        this.interface.addMessage({
          role: 'startup',
          content: `System: ${path.relative(this.config.get('root_dir'), systemPath)}`
        });
      } catch (err) { /* don't care */ }
    });

    // Append SLOP.md files to the system prompt
    let slopMdPaths = [
      { path: path.join(this.config.get('root_dir'), 'SLOP.md'), label: 'project root' },
      { path: path.join(process.env.HOME, '.slopagate', 'SLOP.md'), label: '~/.slopagate' }
    ];
    let loadedSlopFiles = [];
    for (let { path: slopPath, label } of slopMdPaths) {
      try {
        let slopContent = fsSync.readFileSync(slopPath, { encoding: 'utf-8' });
        if (systemPrompt) {
          systemPrompt += '\n---\n' + slopContent;
        } else {
          systemPrompt = slopContent;
        }
        let displayPath = label === 'project root'
          ? path.relative(this.config.get('root_dir'), slopPath)
          : label + '/SLOP.md';
        loadedSlopFiles.push(displayPath);
      } catch (err) { /* don't care */ }
    }
    if (loadedSlopFiles.length > 0) {
      this.interface.addMessage({
        role: 'startup',
        content: `Project files: ${loadedSlopFiles.join(', ')}`
      });
    }

    this.harness = new Harness({
      session: {
        config: this.config,
        systemPrompt: systemPrompt
      },
      config: this.config
    });

    this.harness.hooks.on('tool-call', this.hookToolCall.bind(this));


    this.interface.addMessage({
      role: 'startup',
      content: `Provider: ${this.config.get('provider')}`
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
      content: `Context window: ${this.config.get('context_window')}`
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
            let parts = input.substring(1).split(' ');
            let cmd = parts[0];
            let argstr = parts.slice(1).join(' ');
            this.command(cmd, argstr);
          } else {
            Events.emit('user:message', { message: input });
            this.interface.addMessage({
              role: 'user',
              content: this.input_modes.find(m => m.name === inst.mode).prompt + input
            });
            this.#userMessagesSinceRecap++;
            this.#stopAfkTimer();
            this.#turn_start = Date.now();
            Events.emit('turn:model');
            this.interface.statusline.showSpinner(this.spinnerMessage);
            this.interface.draw();
            
            for (let word in input.split(' ')) {
              // Old-school MS-DOS nnnn.ext is the minimum
              if (!word || word.length < 7 || word.indexOf('.') == -1) continue;
              if (EXP_FILE_REGEX.test(word)) {
                this.#exp_fileReadWhitelist.add(word);
              }
            }
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
      Events.emit('turn:user');
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
    Events.on('turn:user', (event) => {
      this.#startAfkTimer();
      this.interface.statusline.spinner.hide();
      this.interface.draw();
    });
    Events.on('tool:message', (event) => {
      this.interface.addMessage({ role: 'tool', content: event.content });
      if (!event.done) this.interface.statusline.showSpinner(this.spinnerMessage);
      this.interface.draw();
    });

    Events.on('metrics:tokens', (event) => {
      this.updateStatuslineTokens(event);
      this.interface.draw();
    });
    this.updateStatuslineTokens({ inputTokens: 0, outputTokens: 0 });

    if (this.skills.names.length) {
      this.interface.addMessage({
        role: 'startup',
        content: `Skills: loaded ${this.skills.names.length} skills`
      });
    }

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
    let txt = this.interface.statusline.right,
        est = this.harness.session.context.estimates, s, pct, c;
    s = `↑ ${this.#roundTokens(inputTokens)} │ ${this.#roundTokens(outputTokens)} ↓`;
    //s = `▲ ${this.#roundTokens(inputTokens)} │ ${this.#roundTokens(outputTokens)} ▼`;
    //s = `△${this.#roundTokens(inputTokens)} │ ${this.#roundTokens(outputTokens)}▽`;
    pct = 100 * (est.system_prompt + est.messages + est.reserved) / est.context_window;
    if (pct > 50) c = 214;
    if (pct > 70) c = 1;
    pct = `${pct.toFixed(0)}%`;
    s += ` │ ${c ? ANSI.fg(pct, c) : pct}`;
    txt.padding ||= { right: 1 };
    txt.content = s;
  }
  
  async command(name, args) {
    let cmd = this.commands
      ? this.commands.find(c => c.name === name)
      : null;
    if (!cmd) {
      this.interface.addMessage({ role: 'system', content: `Unknown command "${name}".` });
      return;
    }
    
    await cmd.handler(args);
  }
  
  async thinkCommand(bstr) {
    Logger.log(`thinkCommand "${JSON.stringify(bstr)}`);
    if (!bstr || !bstr.length) {
      this.config.set('think', !this.config.get('think'));
    } else {
      this.config.set('think', bstr === 'true' || bstr === 'on');
    }
    this.config.set('think', this.config.get('think'));
    let msg = {
      content: `Thinking ${this.config.get('think') ? 'enabled' : 'disabled'}.`,
      fg: 'gray'
    };
    this.interface.statusline.showMessage(msg, true);
  }

  async compactCommand() {
    Logger.log(`compactCommand`);
    this.interface.statusline.showSpinner('Compacting...');
    let old_est = this.harness.session.context.estimates,
        old_tok = old_est.system_prompt + old_est.messages + old_est.reserved,
        ctx = await this.harness.session.compact([]),
        new_est = ctx.estimates,
        new_tok = new_est.system_prompt + new_est.messages + new_est.reserved,
        delta_tok = ((new_tok - old_tok || 0)).toFixed(0),
        pct = (100 * new_tok / new_est.context_window).toFixed(0),
        msg = {
          content: `Context compacted: ${delta_tok} → ${new_tok} (now ${pct}%).`,
          fg: 'gray'
        };
    this.interface.statusline.spinner.stop();
    this.interface.statusline.showMessage(msg, true);
    this.interface.draw();
  }

  contextCommand() {
    let est = this.harness.session.context.estimates,
        win = est.context_window,
        sysTok = est.system_prompt,
        upTok = est.messages,
        genReserve = est.reserved,
        used = est.total,
        totalUsed = used,
        free = win - used,
        barLen = 40,
        bar = '',
        i, fillChar;

    // Build the bar
    let sysEnd = (sysTok / win) * barLen,
        upEnd = sysEnd + (upTok / win) * barLen,
        //downEnd = upEnd + (downTok / win) * barLen,
        genEnd = /*downEnd*/ upEnd + (genReserve / win) * barLen;
    for (i = 0; i < barLen; i++) {
      if (i < sysEnd) {
        fillChar = ANSI.fg('#', 9);   // red - system prompt
      } else if (i < upEnd) {
        fillChar = ANSI.fg('#', 11);  // yellow - input
      //} else if (i < downEnd) {
      //  fillChar = ANSI.fg('#', 12);  // blue - output
      } else if (i < genEnd) {
        fillChar = ANSI.fg('#', 5);   // purple - reserved for generation
      } else {
        fillChar = ANSI.fg('.', 238); // dim gray - free
      }
      bar += fillChar;
    }
    bar += ANSI.fg(']', 238);

    let pct = ((totalUsed / win) * 100).toFixed(1);
    let pctColor = totalUsed / win > 0.8 ? 1 : totalUsed / win > 0.6 ? 214 : null;

    let lines = [
      ANSI.bold(`Context Window: ${pctColor ? ANSI.fg(pct + '%', pctColor) : pct + '%'} used`),
      ANSI.fg('[', 238) + bar,
      `  ${ANSI.fg('#', 9)} system   ${sysTok.toFixed(0)} tokens`,
      `  ${ANSI.fg('#', 11)} messages ${upTok.toFixed(0)} tokens`,
      //`  ${ANSI.fg('#', 12)} output   ${downTok} tokens`,
      `  ${ANSI.fg('#', 5)} reserved ${genReserve.toFixed(0)} tokens`,
      `  ${ANSI.fg('.', 238)} free     ${free.toFixed(0)} tokens`,
      `  ${ANSI.fg('─', 238)} window   ${win.toFixed(0)} tokens total`
    ];

    this.interface.addMessage({
      role: 'tool',
      content: lines.join('\n'),
      padding: { left: 2, right: 2 }
    });
  }

  async hookToolCall({ toolCall }) {
    if (!toolCall || !toolCall.function
        || (toolCall.function.name !== 'StringSearch'
            && toolCall.function.name !== 'Read')
        || !toolCall.arguments || !toolCall.arguments.file_path
        || !toolCall.arguments.file_path.length)
      return null;

    
    const file_path = call.function.arguments.file_path;
    let last = path.basename(file_path);
    if (EXP_FILE_REGEX.test(last) && ! this.#exp_fileReadWhitelist.has(last)) {
      switch (toolCall.function.name) {
        case 'Read':
          Logger.log(`[Experiment] maybe steering ${start_line}-${end_line}`);
          if (toolCall.function.arguments.start_line
              || toolCall.function.arguments.end_line)
            return;
          Logger.log(`[Experiment] Steering from ${word} to StringSearch`);
          return { response: `Error: must use "StringSearch" tool before reading "${word}.`};
        case 'StringSearch':
          this.#exp_fileReadWhitelist.add(word);
          return;
      }
    }

    return null;
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
      .map(m => Context.transcript(m))
      .join('\n');

    // Use send_private to avoid adding to history
    let summaryMessage = { role: 'user', content: `You are an assistant that's been interacting with a user. From your perspective, using terms like "we" and "I," summarize this transcript into a 1-sentence recap:\n\n${transcript}` };
    let summaryContext = new Context({ });

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

  async bugCommand(description) {
    if (!description || !description.length) {
      this.interface.statusline.showMessage({
        content: 'Usage: /bug <description>',
        fg: 'gray'
      }, true);
      return;
    }
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const entry = JSON.stringify({ description, timestamp });
    try {
      fsSync.appendFileSync('./bugs.jsonl', entry + '\n');
    } catch (err) {
      fsSync.writeFileSync('./bugs.jsonl', entry + '\n');
    }
    this.interface.statusline.showMessage({
      content: `Bug logged: ${description}`,
      fg: 'gray'
    }, true);
  }

  #startAfkTimer() {
    this.timers.start('afk', Program.AFK_TIMEOUT, () => this.#onAfkTimeout());
  }
  #stopAfkTimer() {
    this.timers.stop('afk');
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
