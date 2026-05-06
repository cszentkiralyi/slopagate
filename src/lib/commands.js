const Events = require('../events.js');

// Assume our handlers are bound to a Harness so we can call instance methods on `this`
const Commands = [
  
  {
    name: 'quit',
    silent: true,
    handler: async () => Events.emit('program:quit')
  },
  
  {
    name: 'bug',
    hint: 'Record a brief bug into bugs.jsonl for later',
    handler: async (description) => {
      if (!description || !description.length) {
        this.emitCommandMessage('Usage: /bug <description>');
        return;
      }
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const entry = JSON.stringify({ description, timestamp });
      try {
        fs.appendFileSync('./bugs.jsonl', entry + '\n');
      } catch (err) {
        fs.writeFileSync('./bugs.jsonl', entry + '\n');
      }
      this.emitCommandMessage(`Bug logged: ${description}`);
    }
  }

];

module.exports = Commands;