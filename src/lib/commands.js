const fs = require('node:fs');
const ANSI = require('./ansi.js');
const Events = require('../events.js');

const Commands = [
  
  {
    name: 'quit',
    silent: true,
    handler: async () => Events.emit('program:quit')
  },
  
  {
    name: 'commands',
    hint: 'List available commands',
    handler: async (harness) => {
      const lines = harness.commands
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
        .map(c => c.hint ? `/${c.name} - ${c.hint}` : `/${c.name}`)
        .join('\n');
      if (lines) {
        harness.emitCommandMessage(lines);
      }
    }
  },
  
  {
    name: 'compact',
    handler: async (harness) => {
      Events.emit('status:spinner', { message: 'Compacting...' });
      let old_est = harness.session.context.estimates,
          old_tok = old_est.system_prompt + old_est.messages + old_est.reserved,
          ctx = await harness.session.compact(),
          new_est = ctx.estimates,
          new_tok = new_est.system_prompt + new_est.messages + new_est.reserved,
          delta_tok = ((new_tok - old_tok || 0)).toFixed(0),
          pct = (100 * new_tok / new_est.context_window).toFixed(0);
      Events.emit('status:spinner', { hide: true });
      harness.emitCommandMessage(`Context compacted: ${delta_tok} → ${new_tok} (now ${pct}%).`);
      Events.emit('metrics:tokens', {});
    }
  },
  
  {
    name: 'context',
    hint: 'Display a context window usage visualizer',
    handler: async (harness) => {
      let est = harness.session.context.estimates,
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
          genEnd = upEnd + (genReserve / win) * barLen;
      for (i = 0; i < barLen; i++) {
        if (i < sysEnd) {
          fillChar = ANSI.fg('#', 9);
        } else if (i < upEnd) {
          fillChar = ANSI.fg('#', 11);
        } else if (i < genEnd) {
          fillChar = ANSI.fg('#', 5);
        } else {
          fillChar = ANSI.fg('.', 238);
        }
        bar += fillChar;
      }
      bar += ANSI.fg(']', 238);
      
      let pct = ((totalUsed / win) * 100).toFixed(1);
      let pctColor = totalUsed / win > 0.85 ? 1 : totalUsed / win > 0.7 ? 214 : null;
      
      let lines = [
        ANSI.bold(`Context Window: ${pctColor ? ANSI.fg(pct + '%', pctColor) : pct + '%'} used`),
        ANSI.fg('[', 238) + bar,
        `  ${ANSI.fg('#', 9)} system   ${sysTok.toFixed(0)} tokens`,
        `  ${ANSI.fg('#', 11)} messages ${upTok.toFixed(0)} tokens`,
        `  ${ANSI.fg('#', 5)} reserved ${genReserve.toFixed(0)} tokens`,
        `  ${ANSI.fg('.', 238)} free     ${free.toFixed(0)} tokens`,
        `  ${ANSI.fg('─', 238)} window   ${win.toFixed(0)} tokens total`
      ];
      
      harness.emitCommandMessage(lines.join('\n'));
      Events.emit('metrics:tokens', {});
    }
  },
  
  {
    name: 'transcript',
    handler: async (harness, argstr) => {
      if (!argstr || !argstr.length) {
        harness.emitCommandMessage('Usage: /transcript <filename>');
        return;
      }
      const history = [];
      let m, r, c;
      for (m of harness.session.history) {
        if (!m.content) continue;
        r = m.role;
        c = m.content;
        if (m.role === 'tool') m.content = m.content.startsWith('Error') ? '[Error]' : '[Result]';
        history.push(JSON.stringify(m));
      }
      const transcript = history.join('\n');
      try {
        fs.writeFileSync(argstr, transcript, { encoding: 'utf-8' });
      } catch (err) {
        harness.emitCommandMessage(`Error writing file: ${err.message}`);
        return;
      }
      harness.emitCommandMessage(`Transcript written to ${argstr}`);
    },
    hint: 'Dump session context to a file'
  },
  
  {
    name: 'memory',
    handler: async (harness, argstr) => {
      if (!argstr || !argstr.length) {
        harness.emitCommandMessage('Usage: /memory <action> [args]\nActions: list, read <file>, write <file> <content>, search <query>, delete <file>');
        return;
      }
      
      const parts = argstr.split(' ');
      const action = parts[0];
      
      const memoryTool = harness.toolbox.all().find(t => t.name === 'Memory');
      if (!memoryTool) {
        harness.emitCommandMessage('Memory tool not found.');
        return;
      }
      
      let response;
      if (action === 'list') {
        response = await memoryTool.handler({ action: 'list' }, memoryTool);
      } else if (action === 'read') {
        response = await memoryTool.handler({ action: 'read', file: parts[1] }, memoryTool);
      } else if (action === 'write') {
        response = await memoryTool.handler({ action: 'write', file: parts[1], content: parts.slice(2) }, memoryTool);
      } else if (action === 'search') {
        response = await memoryTool.handler({ action: 'search', query: parts.slice(1).join(' ') }, memoryTool);
      } else if (action === 'delete') {
        response = await memoryTool.handler({ action: 'delete', file: parts[1] }, memoryTool);
      } else {
        harness.emitCommandMessage('Unknown action. Use list, read, write, search, or delete');
        return;
      }
      harness.emitCommandMessage(response);
    },
    hint: 'Interact with the memory system'
  },
  
  {
    name: 'bug',
    hint: 'Record a brief bug into bugs.jsonl for later',
    handler: async (harness, description) => {
      if (!description || !description.length) {
        harness.emitCommandMessage('Usage: /bug <description>');
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
      harness.emitCommandMessage(`Bug logged: ${description}`);
    }
  }

];

module.exports = Commands;