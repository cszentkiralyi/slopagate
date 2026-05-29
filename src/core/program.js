const process = require('node:process');
const path = require('node:path');
const fsSync = require('node:fs');
const os = require('node:os');
const { exec } = require('node:child_process');
const sea = require('node:sea');

const Events = require('../events.js');
const { Config } = require('../core/config.js');
const ANSI = require('../lib/ansi.js');
const Harness = require('../lib/harness.js');
const { PromptDoc } = require('../lib/promptdoc.js');
const Interface = require('./interface.js');
const Slopdown = require('../lib/sd.js');
const Skills = require('../lib/skills.js');

const { Logger, formatMs } = require('../util.js');
const Timers = require('../lib/timers.js');
const Permissions = require('../lib/permissions.js');
const { MessageAggregator } = require('../lib/aggregator.js');

class Program {
  
  #currentMessageId = null;
  #modelTurnSpinner = null;
  #commandSpinner = null;
  #aggregator = null;
  #currentSpinnerPhrase = null;

  static SPINNER_MESSAGES = [
    { present: 'Autofilling', past: 'Autofilled' },
    { present: 'Hallucinating', past: 'Hallucinated' },
    { present: 'Reticulating splines', past: 'Reticulated splines' },
    // { present: 'Checking with The Man', past: 'Checked with The Man' },
    { present: 'Sidequesting', past: 'Sidequested' },
    { present: 'Leaking API keys', past: 'Leaked API keys' },
    { present: 'Going rogue', past: 'Went rogue' },
    { present: 'Gobbling tokens', past: 'Gobbled tokens' },
    { present: 'Nuking production', past: 'Nuked production' },
    { present: 'Babbling', past: 'Babbled' }
  ];

  static AFK_TIMEOUT = 3 * 60 * 1000;

  #turn_start = Date.now();
  #pendingMessages = [];
  #structuredMessages = new Map();

  static EXP_FILE_REGEX = /[a-zA-Z0-9_\-]{3,}\.[a-zA-Z0-9]{1,}$/;
  #exp_fileReadWhitelist = new Set();

  config;
  harness;
  interface;
  
  md;

  get spinnerMessage() {
    let msg = Program.SPINNER_MESSAGES[Math.floor(Math.random() * Program.SPINNER_MESSAGES.length)];
    this.#currentSpinnerPhrase = msg;
    return msg.present + '...';
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
      let skillEntries = skillsFiles.map(skillPath => ({
        text: fsSync.readFileSync(skillPath, 'utf-8'),
        dirName: path.basename(path.dirname(skillPath))
      }));
      this.skills.addSkills(skillEntries);
    }
    // Binary fallback: bundled skills as assets
    if (sea.isSea()) {
      try {
        let assetKeys = sea.getAssetKeys();
        let skillKeys = assetKeys.filter(k => k.startsWith('skills/'));
        Logger.log(`Program SEA: loading skills ${JSON.stringify(skillKeys)}`);
        if (skillKeys.length > 0) {
          let skillEntries = skillKeys.map(k => ({
            text: sea.getAsset(k, 'utf-8'),
            dirName: k.split('/')[1]
          }));
          this.skills.addSkills(skillEntries);
        }
      } catch (err) { /* no bundled skills */ }
    }
    
    // Log skill loading metrics
    const metadataText = this.skills.names.map(name => {
      const skill = this.skills.get(name);
      const desc = skill?.description || 'No description';
      return `- ${name}: ${desc}`;
    }).join('\n');
    const metadataTokens = Math.ceil(ANSI.measure(metadataText) / 3.5);
    Logger.log(`skills: metadata ~${metadataTokens} tokens (${this.skills.names.length} skills)`);
    for (const name of this.skills.names) {
      const skill = this.skills.get(name);
      const contentTokens = Math.ceil(ANSI.measure(skill.content) / 3.5);
      Logger.log(`skills: ${name} ${contentTokens} tokens`);
    }
    
    this.permissions = Permissions.deserialize(userConfig.permissions);
    this.timers = new Timers();
    
    this.md = new Slopdown({
      'strong': s => ANSI.fg(ANSI.bold(s), 'white'),
      'emphasis': s => ANSI.italic(s),
      'inline-code': s => ANSI.fg(s, 213),
      'code': s => ANSI.fg(s, 213),
      'heading-1': s => ANSI.fg(ANSI.bold(ANSI.underline(s.toUpperCase())), 'white'),
      'heading-2': s => ANSI.fg(ANSI.bold(ANSI.underline(s)), 'white'),
      'heading': s => ANSI.underline(s)
    });
    
    this.input_modes = [
      { name: 'normal', prompt: Interface.CLI_PROMPT, default: true },
      { name: 'shell', prompt: '! ', trigger: '!', fg: 117 }
    ];

    this.interface = new Interface({
      banner: { content: ANSI.bold(banner), fg: 'white' },
      commands: []
    });
    let addInterfaceCommands,
        intefaceCommands = new Promise((resolve, reject) => {
          addInterfaceCommands = resolve;
        }).then(cmds => this.interface.commands = cmds);

    
    // Load SYSTEM.md as base
    let system_prompt_paths = [
      path.join(process.env.HOME, '.slopagate'),
      this.config.get('slop_dir')
    ];
    let systemPrompt = null;
    let systemSource = null;
    system_prompt_paths.forEach(possiblePath => {
      if (systemPrompt) return;
      try {
        let systemPath = path.join(possiblePath, 'SYSTEM.md')
        systemPrompt = fsSync.readFileSync(systemPath, { encoding: 'utf-8' });
        systemSource = path.relative(this.config.get('root_dir'), systemPath);
      } catch (err) { /* don't care */ }
    });
    // Binary fallback: bundled asset via node:sea
    if (!systemPrompt && sea.isSea()) {
      try {
        systemPrompt = sea.getAsset('SYSTEM.md', 'utf-8');
        systemSource = 'bundled asset';
      } catch (err) { /* no asset found */ }
    }

    // Create PromptDoc and pass it to session
    let promptDoc = null;
    if (systemPrompt) {
      promptDoc = new PromptDoc(systemPrompt);
      this.interface.addMessage({
        role: 'startup',
        content: `System: ${systemSource}`
      });
    }

    // SLOP.md as injectable sub-prompt
    let slopMdPaths = [
      { path: path.join(this.config.get('root_dir'), 'SLOP.md'), label: 'project root' },
      { path: path.join(process.env.HOME, '.slopagate', 'SLOP.md'), label: '~/.slopagate' }
    ];
    let loadedSlopFiles = [];
    for (let { path: slopPath, label } of slopMdPaths) {
      try {
        let slopContent = fsSync.readFileSync(slopPath, { encoding: 'utf-8' });
        if (promptDoc) {
          promptDoc.setSubPrompt('SLOP', new PromptDoc(slopContent));
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

    // MEMORY.md as injectable sub-prompt
    let memoryPaths = [
      { path: path.join(this.config.get('slop_dir'), 'memory/MEMORY.md'), label: '.slop/memory' }
    ];
    let memoryLoaded = false;
    for (let { path: memPath, label } of memoryPaths) {
      try {
        let memoryContent = fsSync.readFileSync(memPath, { encoding: 'utf-8' });
        if (promptDoc) {
          promptDoc.setSubPrompt('MEMORY', new PromptDoc(memoryContent));
        }
        memoryLoaded = true;
      } catch (err) { /* don't care */ }
    }
    if (memoryLoaded) {
      this.interface.addMessage({
        role: 'startup',
        content: `Memory files: loaded .slop/memory/MEMORY.md`
      });
    }

    this.harness = new Harness({
      session: {
        config: this.config,
        promptDoc: promptDoc
      },
      config: this.config,
      skills: this.skills
    });
    this.#aggregator = new MessageAggregator(this.interface);

    Events.on('command:name', ({ name }) => this.interface.addMessage({
      role: 'command',
      content: ` /${name} `
    }));
    Events.on('command:message', ({ content }) => this.interface.addMessage({
      role: 'tool',
      content: ANSI.fg(content, 248)
    }));
    Events.on('session:context', ({ content }) => {
      this.interface.addMessage({
        role: 'tool',
        content: ANSI.fg(`\n── Last messages from session ──\n${content}\n───────────────────────────────`, 240)
      });
    });
    Events.on('program:quit', () => this.dispose());
    
    this.harness.commands.push({
      name: 'picker',
      hint: 'Test the new Picker',
      handler: async () => {
        let msg = 'Pick a value:',
            choices = [
              { label: 'Yes', value: 'yes', default: true },
              { label: 'Yes for this session', value: 'yes+' },
              { label: 'No', value: 'no' },
            ];
        let result = await this.interface.getUserChoice(msg, choices);
        this.interface.addMessage({ role: 'tool', content: ANSI.fg(`You chose "${result}"`, 248)});
      }
    });
    this.interface.commands = this.harness.getCommands();
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
      // IIFE creates a closure so stage/timeout persist across ^C presses.
      // (module-level vars would pollute scope; `this` would mix with other instances.)
      '^C': (() => {
        let stage = 0, timeout = null;
        return async (inst) => {
          if (stage == 0) {
            stage++;
            if (inst.value?.length || !this.harness.canAbort) {
              inst.clear();
              if (!this.harness.canAbort) {
                this.#currentMessageId = this.interface.statusline.showMessage({
                  content: '^C again to exit.',
                  padding: { left: 1 },
                  fg: 'gray'
                }, true);
                setTimeout(() => this.interface.statusline.dismiss(this.#currentMessageId) && this.interface.draw(), 2000);
              }
              return;
            }
          }
          if (stage == 1) {
            stage++;
            if (this.harness.canAbort) {
              Events.emit('user:abort');
              this.#currentMessageId = this.interface.statusline.showMessage({
                content: '^C again to exit.',
                padding: { left: 1 },
                fg: 'gray'
              }, true);
              setTimeout(() => this.interface.statusline.dismiss(this.#currentMessageId) && this.interface.draw(), 2000);
              stage = 2;
              timeout = setTimeout(() => { stage = 0; }, 2000);
              return;
            }
          }
          if (stage == 2) {
            if (timeout) clearTimeout(timeout);
            await this.dispose();
            stage = 0;
          }
        }
      })()
    };
    chatInput.onInput = async (input, inst) => {
      switch (inst.mode) {
        case 'shell':
          let shellMode = this.input_modes.find(m => m.name === inst.mode);
          let shellPrompt = shellMode.prompt + input;
          inst.clear();
          this.interface.draw();
          let result = await new Promise((resolve) => {
            exec(input, (error, stdout, stderr) => {
              resolve((stderr ? stderr.trim() : stdout.trim()) || '');
            });
          });
          this.interface.addMessage({
            role: 'shell',
            subject: shellPrompt,
            body: result
          });
          break;
      case 'normal':
          if (input[0] === '/') {
            let parts = input.substring(1).split(' ');
            let cmd = parts[0];
            let argstr = parts.slice(1).join(' ');
            this.#commandSpinner = this.interface.statusline.showSpinner(`Running /${cmd}...`);
            inst.clear();
            this.interface.draw();
            await this.harness.command(cmd, argstr);
            this.interface.statusline.hide(this.#commandSpinner);
            this.#commandSpinner = null;
          } else {
            Events.emit('user:message', { message: input });
            this.interface.addMessage({
              role: 'user',
              content: this.input_modes.find(m => m.name === inst.mode).prompt + input
            });
            this.#pendingMessages.push({ message: input, mode: inst.mode, id: Date.now() });
            this.#stopAfkTimer();
            this.#turn_start = Date.now();
            Events.emit('turn:model');
            if (!this.#modelTurnSpinner) {
              this.#modelTurnSpinner = this.interface.statusline.showSpinner(this.spinnerMessage);
            }
            this.interface.draw();
            
            for (let word of input.split(' ')) {
              // Old-school MS-DOS nnnn.ext is the minimum
              if (!word || word.length < 7 || word.indexOf('.') == -1) continue;
              if (Program.EXP_FILE_REGEX.test(word)) {
                Logger.log(`[Experiment] Steering: registered word "${word}" from user`);
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
      if (!this.harness.modelResponded) {
        // Model hasn't responded — undo the user message
        this.interface.removeLastUserMessage();
      }
      chatInput.clear();
      // turn:user is emitted by the harness with { interrupted: true }
    });
    Events.on('model:content', (event) => {
      if (!event.content?.trim()) return;

      this.interface.addMessage({
        role: 'model',
        content: this.md.toAnsi(event.content.trim())
      });
      this.#aggregator.reset();
      this.interface.draw();
    });
    Events.on('turn:model', (event) => {
      this.#stopAfkTimer();
      this.interface.draw();
    });
    Events.on('turn:user', (event) => {
      this.#startAfkTimer();
      if (this.#modelTurnSpinner && !event?.interrupted && this.#currentSpinnerPhrase) {
        const elapsed = Date.now() - this.#turn_start;
        const elapsedStr = formatMs(elapsed);
        let msg = this.#currentSpinnerPhrase.past;
        this.interface.addMessage({ role: 'tool', content: ANSI.fg(`${msg} for ${elapsedStr}`, 248) });
        this.interface.statusline.hide(this.#modelTurnSpinner);
        this.#modelTurnSpinner = null;
        this.#currentSpinnerPhrase = null;
      } else if (this.#modelTurnSpinner) {
        this.interface.statusline.hide(this.#modelTurnSpinner);
        this.#modelTurnSpinner = null;
      }
      this.#pendingMessages = [];
      this.#aggregator.reset();
      this.interface.draw();
    });
    Events.on('recap:message', (event) => {
      this.interface.addMessage({
        role: 'recap',
        content: event.content
      });
    });

    Events.on('tool:message', (event) => {
      if (event.callId) {
        this.#aggregator.message(event);
      } else {
        this.interface.addMessage({
          role: 'tool',
          content: event.content
        });
      }
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
    let txt = this.interface.statusline.right,
        est = this.harness.context.estimates, s, pct, c;
    let estUsed = est.system_prompt + est.messages + est.reserved;
    if (Number.isNaN(inputTokens) || inputTokens == null)
      inputTokens = txt.inputTokens ?? estUsed;
    if (Number.isNaN(outputTokens) || outputTokens == null)
      outputTokens = txt.outputTokens ?? 0;
    if (inputTokens) txt.inputTokens = inputTokens;
    if (outputTokens) txt.outputTokens = outputTokens;
    s = `↑ ${this.#roundTokens(inputTokens)} │ ${this.#roundTokens(outputTokens)} ↓`;
    //s = `▲ ${this.#roundTokens(inputTokens)} │ ${this.#roundTokens(outputTokens)} ▼`;
    //s = `△${this.#roundTokens(inputTokens)} │ ${this.#roundTokens(outputTokens)}▽`;
    pct = 100 * estUsed / est.context_window;
    if (pct > 70) c = 214;
    if (pct > 85) c = 1;
    pct = `${pct.toFixed(0)}%`;
    s += ` │ ${c ? ANSI.fg(pct, c) : pct}`;
    txt.padding ||= { right: 1 };
    txt.content = s;
  }
  
 

  async hookToolCall({ toolCall }) {
    if (!toolCall || !toolCall.function) return null;

    const tool = this.harness.toolbox.get(toolCall.function.name);
    const args = toolCall.function.arguments;
    if (typeof args === 'string') {
      return { response: `Error: failed to parse arguments for "${toolCall.function.name}" — model returned malformed JSON` };
    }
    
    /*
    if ((tool.name === 'Search' || tool.name === 'Read')
        && args?.file_path) {
      const path = args.path;
      let last = path.basename(path);
      if (Program.EXP_FILE_REGEX.test(last) && !this.#exp_fileReadWhitelist.has(last)) {
        switch (tool.name) {
          case 'Read':
            Logger.log(`[Experiment] maybe steering ${args.start_line ?? 'none'}-${args.end_line ?? 'none'}`);
            if (!args.start_line || !args.end_line) {
              Logger.log(`[Experiment] Steering from ${last} to Search`);
              return { cancelled: true, response: `Error: must use "Search" tool before reading "${last}".` };
            }
            break;
          case 'Search':
            Logger.log(`[Experiment] Steering: registered word "${last}" from Search`);
            this.#exp_fileReadWhitelist.add(last);
            break;
        }
      }
    }
    //EXPERIMENT DISABLED
    //  */
    
    const perms = tool.permissions(toolCall.function.arguments);
    //Logger.log(`Program: tool ${tool.name} perms ${JSON.stringify(perms)}`);
    if (!perms || !perms.scope) {
      if (!perms) return null;
      return { cancelled: true, error: perms.message || 'Error: operation not permitted' };
    }
    let scopes = [ perms.scope, ...(perms.parents || []) ],
        permResult;
    do {
      //Logger.log(`Program: checking perm scopes ${JSON.stringify(scopes)}`);
      permResult = this.permissions.check(tool.name, scopes.shift());
      //Logger.log(`Program: perm result ${JSON.stringify(permResult)}`);
      scopes.push(...(permResult.suggestions));
    } while ((permResult.allowed != true) && scopes.length);
    //Logger.log(`Program: done with do/while, final result ${JSON.stringify(permResult)}`);
    
    if (permResult.allowed == true) {
      return null;
    } else if (permResult.scope === perms.scope && permResult.allowed == false) {
      return { cancelled: true, error: 'Error: operation not permitted' };
    }
    
    let msg = `Allow tool use? ${tool.name}(${perms.scope})`,
        choices = [
          { label: 'Yes', value: 'yes', default: true },
          { label: 'Yes for this session', value: 'yes+' },
          { label: 'No', value: 'no' },
          // { label: 'No for this session', value: 'no+' },
        ], result = await this.interface.getUserChoice(msg, choices);

    //Logger.log(`Program: got user choice result = ${JSON.stringify(result)}`);
    if (result === 'yes' || result === 'yes+') {
      if (result === 'yes+') {
        this.permissions.approve(tool.name, perms.scope);
        await this.#suggestParent(tool.name, perms);
      }
      return null;
    // } else if (result === 'no+') {
    //   this.permissions.deny(tool.name, perms.scope);
    //   return { cancelled: true, error: `Error: operation not permitted` };
    }

    Events.emit('user:abort');
    throw new Error('operation not permitted');
  }

  async #suggestParent(toolName, perms) {
    let firstParent = perms.parents && perms.parents[0];
    if (!firstParent || !firstParent.endsWith('*')) return;
    if (this.permissions.has(toolName, firstParent)) return;
    
    // Track how many times we've seen this parent glob during the session
    let count = (this.#parentSuggestionCounts.get(firstParent) || 0) + 1;
    this.#parentSuggestionCounts.set(firstParent, count);
    
    if (count < 3) {
      Logger.log(`Program: suggestParent skipped (count ${count}/3 for ${firstParent})`);
      return;
    }
    
    Logger.log(`Program: suggestParent prompting (count ${count} for ${firstParent})`);
    let msg = `Also allow parent scope? ${toolName}(${firstParent})`;
    let choices = [
      { label: 'Yes', value: 'yes', default: true },
      { label: 'No', value: 'no' },
    ];
    let result = await this.interface.getUserChoice(msg, choices);
    Logger.log(`Program: got parent suggestion result = ${JSON.stringify(result)}`);
    if (result === 'yes') {
      this.permissions.approve(toolName, firstParent);
    } else {
      this.permissions.deny(toolName, firstParent);
    }
  }

  #startAfkTimer() {
    this.timers.start('afk', Program.AFK_TIMEOUT, () => this.#onAfkTimeout());
  }
  #parentSuggestionCounts = new Map();
  #stopAfkTimer() {
    this.timers.stop('afk');
  }

  #resetAfkTimer() {
    this.timers.stop('afk');
    this.#startAfkTimer();
  }

  async #onAfkTimeout() {
    await this.harness.recap();
  }
}

module.exports = Program;
