const TUI = require('../lib/tui.js');

class Interface {
  static CLI_PROMPT = '❯ ';

  #terminal;
  #chat_history;
  #startup_messages;
  #lower_panel;
  #global_spinner;
  #status_line;
  #chat_input;
  
  #elements_by_id = new Map();
  #draw_timeout;
  
  get spinner() { return this.#global_spinner; }
  get statusLine() { return this.#status_line; }

  constructor({ banner }) {
    this.#terminal = new TUI.Terminal({ gap: 1 });
    this.#chat_history = new TUI.Container({ id: 'chat_history', gap: 1 });
    this.#startup_messages = new TUI.Container();
    this.#lower_panel = new TUI.Container();
    this.#global_spinner = new TUI.Spinner({
      id: 'global-spinner',
      animation: 'braille-small',
      message: 'Autofilling...',
      padding: { left: 1 },
      hidden: true,
      loop: false
    });
    this.#status_line = new TUI.Text({
      id: 'status-line',
      content: '^C again to exit.',
      padding: { left: 1 },
      hidden: true
    });
    this.#chat_input = new TUI.TextInput({
      id: 'chat-input',
      prompt: Interface.CLI_PROMPT,
      state: 'normal'
    });
    
    if (banner) this.#chat_history.appendChild(new TUI.Text(banner));
    this.#terminal.appendChild(this.#chat_history);
    this.#terminal.appendChild(this.#lower_panel);
    this.#chat_history.appendChild(this.#startup_messages);
    this.#lower_panel.appendChild(this.#global_spinner);
    this.#lower_panel.appendChild(this.#status_line);
    this.#lower_panel.appendChild(this.#chat_input);

    this.#chat_input.focus();
    
    this.registerId(this.#terminal);
    this.registerId(this.#chat_history);
    this.registerId(this.#startup_messages);
    this.registerId(this.#lower_panel);
    this.registerId(this.#global_spinner);
    this.registerId(this.#status_line);
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
  
  addStartupMessage({ content }) {
    this.#startup_messages.appendChild(new TUI.Text({
      content, fg: 'gray'
    }));
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
  
  addMessage({ role, content, id }) {
    let textProps;
    
    if (role === 'user') {
      textProps = {
        id, content,
        align: true,
        padding: { left: 1, right: 1 }
      };
    } else if (role === 'model') {
      textProps = {
        id, content,
        align: true,
        padding: { top: 1, left: 1, right: 1, bottom: 1 },
        bg: 237
      };
    } else if (role === 'tool') {
      textProps = {
        id, content,
        padding: { left: 2, right: 2 },
        fg: 245 /* muted */
      }
    } else if (role === 'startup') {
      textProps = {
        id, content,
        fg: 'gray'
      };
    } else if (role === 'system') {
      textProps = { id, content };
    }
    
    if (textProps) {
      let inst = new TUI.Text(textProps),
          target = role === 'startup' ? this.#startup_messages : this.#chat_history;
      target.appendChild(inst);
      // TODO: may be wrong for us to trigger this?
      this.draw();
    }
  }
}

module.exports = Interface;