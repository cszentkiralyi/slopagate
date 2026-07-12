const fs = require('node:fs');
const ANSI = require('./ansi.js');
const Events = require('../events.js');
const { Logger, formatRelativeDate, formatDate, isRecent } = require('../util.js');

function makeConfigSetCommand(key, allowedValues, translateFn) {
  return async function handler(harness, bstr) {
    if (!bstr || !bstr.length) {
      harness.emitCommandMessage(`${key} = ${harness.config.get(key)}`);
      return;
    }
    let value = bstr;
    const lower = bstr.toLowerCase();
    if (allowedValues.map(v => v.toLowerCase()).includes(lower)) {
      value = lower;
    } else {
      harness.emitCommandMessage(`Invalid value. Allowed: ${allowedValues.join(', ')}`);
      return;
    }
    // Value parsing
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (!isNaN(value) && value.length > 0) value = parseInt(value, 10);
    if (translateFn) value = translateFn(value);
    harness.config.set(key, value);
    harness.emitCommandMessage(`${key} = ${harness.config.get(key)}`);
  };
}

function makeToggleCommand(key, hint) {
  return {
    name: key,
    hint: `${hint} (currently: ${harness.config.get(key)})`,
    handler: async (harness) => {
      const current = harness.config.get(key);
      const newValue = !current;
      harness.config.set(key, newValue);
      harness.emitCommandMessage(`${key} = ${newValue}`);
    }
  };
}

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
    hint: 'Compact the context window',
    handler: async (harness) => {
      await harness.compact();
    }
  },
  
  {
    name: 'context',
    hint: 'Display context window usage',
    handler: async (harness) => {
      let est = harness.agent?.context?.estimates ?? harness.context.estimates,
          win = est.context_window,
          sysTok = Math.floor(est.system_prompt),
          upTok = Math.floor(est.messages),
          genReserve = Math.floor(est.reserved),
          used = sysTok + upTok + genReserve,
          free = win - used,
          barLen = 40,
          bar = '',
          i, fillChar;
      
      // Build the bar
      let sysEnd = (sysTok / win) * barLen,
          upEnd = sysEnd + (upTok / win) * barLen,
          genEnd = upEnd + (genReserve / win) * barLen;
      bar += ANSI.fg('▐', 238);
      for (i = 0; i < barLen; i++) {
        if (i < sysEnd) {
          fillChar = ANSI.fg('█', 9);
        } else if (i < upEnd) {
          fillChar = ANSI.fg('█', 11);
        } else if (i < genEnd) {
          fillChar = ANSI.fg('█', 5);
        } else {
          fillChar = ANSI.fg('░', 238);
        }
        bar += fillChar;
      }
      bar += ANSI.fg('▌', 238);
      
      let pct = ((used / win) * 100).toFixed(1);
      let pctColor = used / win > 0.85 ? 1 : used / win > 0.7 ? 214 : null;
      
      let lines = [
        ANSI.bold(`Context Window: ${pctColor ? ANSI.fg(pct + '%', pctColor) : pct + '%'} used`),
        bar,
        '',
        `  ${ANSI.fg('█', 9)} system   ${sysTok} tokens`,
        `  ${ANSI.fg('█', 11)} messages ${upTok} tokens`,
        `  ${ANSI.fg('█', 5)} reserved ${genReserve} tokens`,
        `  ${ANSI.fg('░', 238)} free     ${free} tokens`,
        `  ${ANSI.fg('─', 238)} window   ${win} tokens total`
      ];
      
      harness.emitCommandMessage(lines.join('\n'));
      Events.emit('metrics:tokens', {});
    }
  },
  
  {
    name: 'transcript',
    handler: async (harness, argstr) => {
      const now = new Date();
      const timestamp = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const defaultFilename = `${timestamp}.transcript.json`;
      const useActive = argstr && (argstr.includes('--active') || argstr.includes('-a'));
      const filename = useActive ? argstr.replace(/--active|-a/g, '').trim() || defaultFilename : (argstr || defaultFilename);
      const source = useActive ? harness.session.messages : harness.session.history;
      const lines = [];
      for (const m of source) {
        if (!m.content) continue;
        const copy = { ...m };
        if (copy.role === 'tool') copy.content = copy.content.startsWith('Error') ? '[Error]' : '[Result]';
        lines.push(JSON.stringify(copy));
      }
      const transcript = lines.join('\n');
      try {
        fs.writeFileSync(filename, transcript, { encoding: 'utf-8' });
      } catch (err) {
        harness.emitCommandMessage(`Error writing file: ${err.message}`);
        return;
      }
      harness.emitCommandMessage(`Transcript written to ${filename}`);
    },
    hint: 'Dump session history to a file (default: YYMMDD-hhmm.transcript.json). Use --active or -a to export current context instead of full history.'
  },
  
  {
    name: 'memory',
    handler: async (harness, argstr) => {
      if (!harness.config.get('memory')) {
        harness.emitCommandMessage('Memory disabled.');
        return;
      }
      if (!argstr || !argstr.length) {
        harness.emitCommandMessage('Usage: /memory <action> [args]\nActions: list, read <file>, write <file> <type> <content>, search <query>, delete <file>');
        return;
      }
      
      const parts = argstr.split(' ');
      const action = parts[0];
      
      const memoryTool = harness.toolbox.all().find(t => t.name === 'Memory');
      
      let response;
      if (action === 'list') {
        response = await memoryTool.handler({ action: 'list' }, memoryTool);
      } else if (action === 'read') {
        response = await memoryTool.handler({ action: 'read', file: parts[1] }, memoryTool);
      } else if (action === 'write') {
        const file = parts[1];
        const validTypes = ['user', 'feedback', 'project', 'reference'];
        const maybeType = parts[2];
        const type = maybeType && validTypes.includes(maybeType) ? maybeType : null;
        const content = type ? parts.slice(3).join(' ') : parts.slice(2).join(' ');
        response = await memoryTool.handler({ action: 'write', file, content: [content], type }, memoryTool);
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
    name: 'think',
    hint: 'Toggle thinking mode',
    arguments: [{ name: 'state', possible: ['true', 'false'] }],
    handler: async (harness, bstr) => {
      if (!bstr || !bstr.length) {
        const newValue = !harness.config.get('think');
        harness.config.set('think', newValue);
        harness.emitCommandMessage(`think = ${newValue}`);
        return;
      }
      const lower = bstr.toLowerCase();
      const val = ['true', 'on'].includes(lower) ? true : ['false', 'off'].includes(lower) ? false : null;
      if (val === null) {
        harness.emitCommandMessage('Usage: /think [true|false]');
        return;
      }
      harness.config.set('think', val);
      harness.emitCommandMessage(`think = ${val}`);
    }
  },
  
  {
    name: 'yolo',
    hint: 'Toggle yolo mode (auto-approve all tool calls)',
    arguments: [{ name: 'state', possible: ['true', 'false'] }],
    handler: async (harness, bstr) => {
      if (!bstr || !bstr.length) {
        const newValue = !harness.config.get('yolo_mode');
        harness.config.set('yolo_mode', newValue);
        harness.emitCommandMessage(`yolo_mode = ${newValue}`);
        Events.emit('yolo:toggle', { enabled: newValue });
        return;
      }
      const lower = bstr.toLowerCase();
      const val = ['true', 'on'].includes(lower) ? true : ['false', 'off'].includes(lower) ? false : null;
      if (val === null) {
        harness.emitCommandMessage('Usage: /yolo [true|false]');
        return;
      }
      harness.config.set('yolo_mode', val);
      harness.emitCommandMessage(`yolo_mode = ${val}`);
      Events.emit('yolo:toggle', { enabled: val });
    }
  },
  
  {
    name: 'aggression',
    hint: 'Set aggression level',
    arguments: [{ name: 'level', possible: ['low', 'medium', 'high', 'xhigh'] }],
    handler: makeConfigSetCommand('aggression_level', ['xhigh', 'high', 'medium', 'low'])
  },
  
  {
    name: 'effort',
    hint: 'Set reasoning budget effort level',
    arguments: [{ name: 'level', possible: ['minimal', 'low', 'medium', 'high', 'xhigh'] }],
    handler: makeConfigSetCommand('reasoning_budget', ['minimal', 'low', 'medium', 'high', 'xhigh'], v => ({ minimal: 256, low: 1024, medium: 2048, high: 4096, xhigh: 8196 }[v]))
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
  },

  {
    name: 'sessions',
    hint: 'List all saved sessions',
    handler: async (harness) => {
      const sessions = harness.sessionManager.listSessions();
      if (sessions.length === 0) {
        harness.emitCommandMessage('No saved sessions.');
        return;
      }
      const lines = sessions
        .sort((a, b) => new Date(b.modified) - new Date(a.modified))
        .map(s => {
          const created = isRecent(s.created) ? formatRelativeDate(s.created) : formatDate(s.created);
          const modified = isRecent(s.modified) ? formatRelativeDate(s.modified) : formatDate(s.modified);
          return `  ${s.id}  created: ${created}  modified: ${modified}`;
        })
        .join('\n');
      harness.emitCommandMessage(`${sessions.length} session(s):\n${lines}`);
    }
  },

  {
    name: 'clean-sessions',
    hint: 'Clean up old sessions [maxAge] [maxCount]',
    handler: async (harness, argstr) => {
      const parts = (argstr || '').trim().split(/\s+/).filter(Boolean);
      const maxAge = parts[0] ? parseInt(parts[0], 10) : 7;
      const maxCount = parts[1] ? parseInt(parts[1], 10) : 20;
      if (isNaN(maxAge) || isNaN(maxCount)) {
        harness.emitCommandMessage('Usage: /clean-sessions [maxAge-days] [maxCount]\nDefaults: 7 days, 20 sessions');
        return;
      }
      harness.sessionManager.cleanup({ maxAge, maxCount });
      harness.emitCommandMessage(`Cleaned up sessions (maxAge: ${maxAge}d, maxCount: ${maxCount}).`);
    }
  },

  {
    name: 'reload',
    hint: 'Reload skills from disk',
    handler: async (harness) => {
      await harness.reloadSkills();
    }
  }

];

module.exports = Commands;