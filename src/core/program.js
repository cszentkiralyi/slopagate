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
const Skills = require('../lib/skills.js');

const { Logger, formatMs } = require('../util.js');
const Timers = require('../lib/timers.js');
const Permissions = require('../lib/permissions.js');

class Program {
  
  #currentMessageId = null;
  #modelTurnSpinner = null;

  static SPINNER_MESSAGES = [
    'Autofilling',
    'Hallucinating',
    'Reticulating splines',
    //'Checking with The Man',
    'Sidequesting',
    'Leaking API keys',
    'Going rogue',
    'Gobbling tokens',
    'Nuking production',
    'Babbling'
  ];

  static AFK_TIMEOUT = 3 * 60 * 1000;

  #turn_start = 0;

  static EXP_FILE_REGEX = /[a-zA-Z0-9_\-]{4,}\.[a-zA-Z0-9]{3,}$/;
  #exp_fileReadWhitelist = new Set();

  config;
  harness;
  interface;
  
  md;

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
    
    this.permissions = Permissions.deserialize(userConfig.permissions);
    this.timers = new Timers();
    
    this.md = new Slopdown({
      'strong': s => ANSI.fg(ANSI.bold(s), 'white'),
      'emphasis': s => ANSI.italic(s),
      'inline-code': s => ANSI.fg(s, 213),
      'code': s => ANSI.fg(s, 213)
    });
    
    this.input_modes = [
      { name: 'normal', prompt: Interface.CLI_PROMPT, default: true },
      { name: 'shell', prompt: '! ', trigger: '!', fg: 33 }
    ];

    /*
    this.skills.names.forEach(skillName => {
      this.commands.push({
        name: skillName,
        handler: async (args) => this.handleSkill(skillName, args),
        hint: this.skills.get(skillName).description
      });
    });
    */


    this.interface = new Interface({
      banner: { content: ANSI.bold(banner), fg: 'white' },
      commands: []
    });
    let addInterfaceCommands,
        intefaceCommands = new Promise((resolve, reject) => {
          addInterfaceCommands = resolve;
        }).then(cmds => this.interface.commands = cmds);

    
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

    // Append memory guidelines to system prompt
    const memoryGuidelines = `\n---\n# Memory Guidelines\n\nThe memory system is available via the Memory tool (read, write, list, search, delete). Use it proactively:\n- Save key project facts, architecture decisions, important configurations, and user preferences\n- Update existing entries when you learn new related information (call list() first to check)\n- Use descriptive names like 'project-config.md', 'architecture-decision.md', 'user-preferences.md'\n- Keep entries concise but complete enough to be useful without additional context\n- Delete outdated or irrelevant memories when they are no longer useful (call memory.delete('filename.md'))`;
    if (systemPrompt) {
      systemPrompt += memoryGuidelines;
    } else {
      systemPrompt = memoryGuidelines;
    }

    // Load MEMORY.md into system prompt
    let memoryPaths = [
      { path: path.join(this.config.get('slop_dir'), 'memory/MEMORY.md'), label: '.slop/memory' }
    ];
    let memoryLoaded = false;
    for (let { path: memPath, label } of memoryPaths) {
      try {
        let memoryContent = fsSync.readFileSync(memPath, { encoding: 'utf-8' });
        if (systemPrompt) {
          systemPrompt += '\n---\n' + memoryContent;
        } else {
          systemPrompt = memoryContent;
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
        systemPrompt: systemPrompt
      },
      config: this.config,
      skills: this.skills
    });
    Events.on('command:name', ({ name }) => this.interface.addMessage({
      role: 'command',
      content: ` /${name} `
    }));
    Events.on('command:message', ({ content }) => this.interface.addMessage({
      role: 'tool',
      content: content
    }));
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
        this.interface.addMessage({ role: 'tool', content: `You chose "${result}"`});
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
          Logger.log(`Program ^C: stage=${stage}`);
          if (stage == 0) {
            stage++;
            if (inst.value?.length || !this.harness.session.canAbort) {
              inst.clear();
              if (!this.harness.session.canAbort) {
                this.#currentMessageId = this.interface.statusline.showMessage({
                  content: '^C again to exit.',
                  padding: { left: 1 },
                  fg: 'gray'
                }, true);
                setTimeout(() => this.interface.statusline.dismiss(this.#currentMessageId) && this.interface.draw(), 2000);
              }
              Logger.log(`Program ^C: returning because we cleared text`);
              return;
            }
          }
          if (stage == 1) {
            stage++;
            if (this.harness.session.canAbort) {
              Events.emit('user:abort');
              this.#currentMessageId = this.interface.statusline.showMessage({
                content: '^C again to exit.',
                padding: { left: 1 },
                fg: 'gray'
              }, true);
              setTimeout(() => this.interface.statusline.dismiss(this.#currentMessageId) && this.interface.draw(), 2000);
              stage = 2;
              timeout = setTimeout(() => { stage = 0; }, 2000);
              Logger.log(`Program ^C: returning because we aborted`);
              return;
            }
          }
          if (stage == 2) {
            Logger.log(`Program ^C: final stage!`);
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
            await this.harness.command(cmd, argstr);
          } else {
            Events.emit('user:message', { message: input });
            this.interface.addMessage({
              role: 'user',
              content: this.input_modes.find(m => m.name === inst.mode).prompt + input
            });
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
      Events.emit('turn:user');
    });
    Events.on('model:content', (event) => {
      if (event.content) {
        this.interface.addMessage({
          role: 'model',
          content: this.md.toAnsi(event.content.trim())
        });
      }
      this.interface.draw();
    });
    Events.on('turn:model', (event) => {
      this.#stopAfkTimer();
      this.interface.draw();
    });
    Events.on('turn:user', (event) => {
      this.#startAfkTimer();
      if (this.#modelTurnSpinner) {
        const elapsed = Date.now() - this.#turn_start;
        const elapsedStr = formatMs(elapsed);
        this.interface.addMessage({ role: 'tool', content: `Ran for ${elapsedStr}` });
        this.interface.statusline.hide(this.#modelTurnSpinner);
        this.#modelTurnSpinner = null;
      }
      this.interface.draw();
    });
    Events.on('tool:message', (event) => {
      this.interface.addMessage({ role: 'tool', content: event.content });
      if (!event.done && !this.#modelTurnSpinner) {
        this.#modelTurnSpinner = this.interface.statusline.showSpinner(this.spinnerMessage);
      }
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
    let txt = this.interface.statusline.right,
        est = this.harness.session.context.estimates, s, pct, c;
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
      
    if ((tool.name === 'StringSearch' || tool.name === 'Read')
        && args?.file_path) {
      const file_path = args.file_path;
      let last = path.basename(file_path);
      if (Program.EXP_FILE_REGEX.test(last) && !this.#exp_fileReadWhitelist.has(last)) {
        switch (tool.name) {
          case 'Read':
            Logger.log(`[Experiment] maybe steering ${args.start_line ?? 'none'}-${args.end_line ?? 'none'}`);
            if (!args.start_line || !args.end_line) {
              Logger.log(`[Experiment] Steering from ${last} to StringSearch`);
              return { cancelled: true, response: `Error: must use "StringSearch" tool before reading "${last}.` };
            }
            break;
          case 'StringSearch':
            Logger.log(`[Experiment] Steering: registered word "${last}" from StringSearch`);
            this.#exp_fileReadWhitelist.add(last);
            break;
        }
      }
    }
    
    const perms = tool.permissions(toolCall.function.arguments);
    Logger.log(`Program: tool ${tool.name} perms ${JSON.stringify(perms)}`);
    if (!perms || !perms.scope) {
      if (!perms) return null;
      return { cancelled: true, error: perms.message || 'Error: operation not permitted' };
    }
    let scopes = [ perms.scope, ...(perms.parents || []) ],
        permResult;
    do {
      Logger.log(`Program: checking perm scopes ${JSON.stringify(scopes)}`);
      permResult = this.permissions.check(tool.name, scopes.shift());
      Logger.log(`Program: perm result ${JSON.stringify(permResult)}`);
      scopes.push(...(permResult.suggestions));
    } while ((permResult.allowed != true) && scopes.length);
    Logger.log(`Program: done with do/while, final result ${JSON.stringify(permResult)}`);
    
    if (permResult.allowed == true) {
      return;
    } else if (permResult.scope === perms.scope && permResult.allowed == false) {
      return { cancelled: true, error: 'Error: operation not permitted' };
    }
    
    let msg = `Allow tool use? ${tool.name}(${perms.scope})`,
        choices = [
          { label: 'Yes', value: 'yes', default: true },
          { label: 'Yes for this session', value: 'yes+' },
          { label: 'No', value: 'no' },
        ], result = await this.interface.getUserChoice(msg, choices);

    Logger.log(`Program: got user choice result = ${JSON.stringify(result)}`);
    if (result === 'yes' || result === 'yes+') {
      if (result === 'yes+') {
        this.permissions.approve(tool.name, perms.scope);
        await this.#suggestParent(tool.name, perms);
      }
      return;
    }

    Logger.log(`Program: permission denied`);
    return { cancelled: true, error: `Error: operation not permitted` };
  }

  async #suggestParent(toolName, perms) {
    let firstParent = perms.parents && perms.parents[0];
    if (firstParent && firstParent.endsWith('*') && !this.permissions.has(toolName, firstParent)) {
      Logger.log(`Program: suggestParent found ${JSON.stringify(firstParent)}`);
      let msg = `Also allow parent scope? ${toolName}(${firstParent})`;
      let choices = [
        { label: 'Yes', value: 'yes', default: true },
        { label: 'No', value: 'no' },
      ];
      let result = await this.interface.getUserChoice(msg, choices);
      Logger.log(`Program: got user choice result = ${JSON.stringify(result)}`);
      if (result === 'yes') {
        this.permissions.approve(toolName, firstParent);
      } else {
        this.permissions.deny(toolName, firstParent);
      }
    }
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
    await this.harness.recap();
  }
}

module.exports = Program;
