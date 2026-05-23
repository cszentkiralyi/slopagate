const TUI = require('../lib/tui.js');
const ANSI = require('../lib/ansi.js');
const { Logger } = require('../util.js');

class Interface {
  static CLI_PROMPT = '❯ ';
  //static CLI_PROMPT = 'Ⓢ ';

  #terminal;
  #chat_history;
  #startup_messages;
  #lower_panel;
  #statusline;
  #chat_input;
  
  #elements_by_id = new Map();
  #draw_timeout;
  #lastUserMessage = null;
  
  get statusline() { return this.#statusline; }

  constructor(props) {
    Object.assign(this, props);

    this.#terminal = new TUI.Terminal({ gap: 1 });
    this.#chat_history = new TUI.Container({ name: 'Container.chat_history', id: 'chat_history', gap: 1 });
    this.#startup_messages = new TUI.Container({ name: 'Container.startup' });
    this.#lower_panel = new TUI.Container({ name: 'Container.lower' });
    this.#statusline = new TUI.Statusline({
      spinner: new TUI.Spinner({
        id: 'global-spinner',
        animation: 'braille-small',
        message: 'Autofilling...',
        loop: false
      })
    });
    this.#chat_input = new TUI.TextInput({
      id: 'chat-input',
      prompt: Interface.CLI_PROMPT,
      state: 'normal',
      getHint: (v) => this.getInputHint(v)
    });
    
    this.#terminal.appendChild(this.#chat_history);
    this.#terminal.appendChild(this.#lower_panel);
    if (this.banner)
      this.#chat_history.appendChild(new TUI.Text(this.banner));
    this.#chat_history.appendChild(this.#startup_messages);
    this.#lower_panel.appendChild(this.#statusline);
    this.#lower_panel.appendChild(this.#chat_input);

    this.#chat_input.focus();
    
    this.registerId(this.#terminal);
    this.registerId(this.#chat_history);
    this.registerId(this.#startup_messages);
    this.registerId(this.#lower_panel);
    this.registerId(this.#statusline);
    this.registerId(this.#chat_input);
  }
  
  draw() {
    this.#terminal.draw();
  }
  // Draw no more than ms later, but may be sooner
  drawLater(ms) {
    let now = Date.now(),
        later = now + ms;
    if (this.#draw_timeout && this.#draw_timeout.then <= later
        || this.#terminal.last_draw + TUI.Terminal.DRAW_GAP_MS <= later)
      return;
    if (this.#draw_timeout) clearTimeout(this.#draw_timeout.id);
    this.#draw_timeout = {
      id: setTimeout(() => this.draw(), ms),
      then: later
    };
  }

  async dispose() { 
    await this.#terminal.dispose();
  }
  
  registerId(component) {
    if (component && component.id) {
      this.#elements_by_id.set(component.id, component);
    }
  }
  getById(id) {
    // TODO: recursively look through children? or is that overkill?
    return this.#elements_by_id.get(id);
  }
  removeById(id) {
    let c = this.getById(id), result;
    if (!c) return false;
    result = this.#terminal.removeChild(c);
    if (result) {
      this.#elements_by_id.delete(id);
    }
    return result;
  }
  

  addStartupMessage({ content }) {
    this.addMessage({ role: 'startup', content });
  }

  getChatHistory() {
    return this.#chat_history.children.filter(c => c instanceof TUI.Text);
  }
  removeMessage(msg) {
    if (!msg) return false;
    const target = msg.role === 'startup' ? this.#startup_messages : this.#chat_history;
    // Find the last matching child (iterate backwards)
    for (let i = target.children.length - 1; i >= 0; i--) {
      const c = target.children[i];
      if ((msg.id && c.id === msg.id) || (c.content === msg.content && c.role === msg.role)) {
        this.#terminal.removeChild(c);
        return true;
      }
    }
    return false;
  }
  removeLastUserMessage() {
    if (!this.#lastUserMessage) return false;
    this.#terminal.removeChild(this.#lastUserMessage);
    this.#lastUserMessage = null;
    this.draw();
    return true;
  }

  addMessage({ role, content, id }) {
    let textProps;
    
    if (role === 'user') {
      textProps = {
        id, role, content,
        forceAlign: Interface.CLI_PROMPT,
        bg: 237
      };
    } else if (role === 'model') {
      textProps = {
        id, role, content,
        align: true,
        padding: { left: 2 }
      };
    } else if (role === 'tool') {
      let inst = new TUI.StructuredMessage({
        id,
        role,
        /*
        subject: content,
        state: 'static',
        */
      });
      this.#chat_history.appendChild(inst);
      inst.subject = ANSI.fg(content, 245);
      inst.state = 'static';
      //this.draw();
      return;
    } else if (role === 'startup') {
      textProps = {
        id, role, content,
        fg: 'gray'
      };
    } else if (role === 'shell') {
      textProps = {
        id, role, content,
        fg: 250,
        padding: { left: 2, right: 2 }
      };
    } else if (role === 'system') {
      textProps = { id, role, content };
    } else if (role === 'command') {
      textProps = {
        id, role, content,
        fill: false,
        fg: 232,
        bg: 214,
        padding: { left: 1, right: 1 }
      };
    }
    
    if (textProps) {
      let inst = new TUI.Text(textProps),
          target = role === 'startup' ? this.#startup_messages : this.#chat_history;
      target.appendChild(inst);
      if (role === 'user') {
        this.#lastUserMessage = inst;
      }
      // TODO: may be wrong for us to trigger this?
      this.draw();
    }
  }
  
  getInputHint(value) {
    let s = value,
        hints = [],
        slen, len;
    if (s[0] === '/' && this.commands && this.commands.length) {
      s = s.substring(1), slen = s.length;
      this.commands.forEach(cmd => {
        len = cmd.name.length;
        if (len > slen && cmd.name.startsWith(s)) {
          // Partial command name: display suffix + hint, tab-completes to full name + space
          let suffix = cmd.name.substring(slen);
          let displaySuffix = suffix;
          if (cmd.arguments && cmd.arguments.length) {
            let arg = cmd.arguments[0];
            if (arg) {
              displaySuffix += ' ' + (arg.possible ? arg.possible.join('|') : arg.name);
            }
          } else if (cmd.hint) {
            displaySuffix += ' ' + cmd.hint;
          }
          hints.push({
            hint: displaySuffix,
            completion: cmd.name.substring(slen) + ' '
          });
        }
        else if (s.startsWith(cmd.name) && slen >= len) {
          // Full command name: show argument or hint (no tab completion)
          let astr = s.substring(len);
          if (astr.trim().length === 0 || cmd.arguments) {
            let wordCount = astr.trim().length === 0
              ? (astr[astr.length - 1] === ' ' || astr === '' ? 0 : astr.split(' ').length - 1)
              : astr.split(' ').length - 1;
            if (cmd.arguments && wordCount < cmd.arguments.length) {
              let arg = cmd.arguments[wordCount];
              if (arg) {
                hints.push({
                  hint: arg.possible ? arg.possible.join('|') : arg.name,
                  completion: null
                });
              }
            } else if (cmd.hint && slen === len) {
              hints.push({
                hint: ' ' + cmd.hint,
                completion: null
              });
            }
          }
        }
      });
    }
    
    if (hints.length) {
      let allSubsets = true;
      hints.sort((a, b) => {
        let la = a.hint.length, lb = b.hint.length;
        allSubsets = allSubsets && (a.hint.startsWith(b.hint) || b.hint.startsWith(a.hint));
        let r, i;
        for (i = 0; i < la && i < lb; i++) {
          r = a.hint.charCodeAt(i) - b.hint.charCodeAt(i);
          if (r != 0) return r;
        }
        if (la > lb) return -1;
        if (lb > la) return 1;
        return r;
      });
      // Pick longest
      if (allSubsets) return hints[hints.length - 1];
      // Pick shortest
      return hints[0];
    }
    return null;
  }
  
  getUserChoice(message, choices) {
    Logger.log(`Interface: received getUserChoice() call`);
    const picker = new TUI.Picker({ message, choices });
    const prevFocus = this.#terminal.focused;
    return new Promise((resolve, reject) => {
      let select = (v) => {
        Logger.log(`Interface: selected choice, removing & drawing`);
        this.#terminal.removeChild(picker);
        this.#terminal.giveFocus(prevFocus);
        this.#terminal.draw();
        resolve(v);
      };
      picker.select = select;
      this.#terminal.appendChild(picker);
      this.#terminal.giveFocus(picker);
      this.#terminal.draw();
    });
  }
}

module.exports = Interface;