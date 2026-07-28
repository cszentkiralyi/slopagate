'use strict';

const KNOWN_COMPOUNDS = new Set([
  'git', 'npm', 'docker', 'kubectl', 'yarn', 'pnpm', 'npx', 'bun', 'deno',
  'cargo', 'go', 'rustc', 'tsc', 'jest', 'mocha', 'vitest', 'eslint',
  'prettier', 'pip', 'pip3', 'poetry', 'uv', 'bundle', 'mix', 'gradle',
  'mvn', 'dotnet', 'flutter', 'dart', 'swift', 'xcodebuild', 'pod',
  'brew', 'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'apk', 'zypper',
  'rsync', 'scp', 'ssh', 'make', 'cmake', 'meson', 'scons', 'ant',
  'vite', 'webpack', 'rollup', 'esbuild', 'tailwind', 'postcss',
  'prisma', 'drizzle', 'typeorm', 'sequelize', 'knex',
]);

const SEPARATOR_PATTERN = /(&&|\|\||;|\|)/;

function splitCompound(raw) {
  const commands = [];
  let current = '';
  let i = 0;

  while (i < raw.length) {
    const match = raw.slice(i).match(SEPARATOR_PATTERN);

    if (match && match.index === 0) {
      // Found a separator at current position
      const sep = match[0];
      if (current.trim()) commands.push(current.trim());
      i += sep.length;
      // skip whitespace after separator
      while (i < raw.length && /\s/.test(raw[i])) i++;
      current = '';
      continue;
    }

    current += raw[i];
    i++;
  }

  if (current.trim()) commands.push(current.trim());
  return commands;
}

function tokenize(command) {
  const tokens = [];
  let current = '';
  let i = 0;
  let inDollarParen = 0;
  let inBacktick = false;

  while (i < command.length) {
    const ch = command[i];

    // Handle $() nesting
    if (ch === '$' && command[i + 1] === '(' && inDollarParen === 0 && !inBacktick) {
      // Save current token if any
      if (current) {
        tokens.push(current);
        current = '';
      }
      // Capture the whole $() expression
      let depth = 0;
      let expr = '$(';
      i += 2;
      depth = 1;
      while (i < command.length && depth > 0) {
        if (command[i] === '$' && command[i + 1] === '(') {
          expr += '$(';
          depth++;
          i += 2;
        } else if (command[i] === ')') {
          depth--;
          if (depth === 0) {
            expr += ')';
            i++;
          } else {
            expr += ')';
            i++;
          }
        } else {
          expr += command[i];
          i++;
        }
      }
      tokens.push(expr);
      continue;
    }

    // Handle backtick interpolation
    if (ch === '`' && !inDollarParen) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      let expr = '`';
      i++;
      while (i < command.length && command[i] !== '`') {
        expr += command[i];
        i++;
      }
      if (i < command.length) {
        expr += '`';
        i++;
      }
      tokens.push(expr);
      continue;
    }

    // Handle double quotes
    if (ch === '"' && inDollarParen === 0 && !inBacktick) {
      i++;
      while (i < command.length && command[i] !== '"') {
        if (command[i] === '\\' && i + 1 < command.length && (command[i + 1] === '"' || command[i + 1] === '\\')) {
          // Unescape: \" becomes ", \\ becomes \
          current += command[i + 1];
          i += 2;
        } else {
          current += command[i];
          i++;
        }
      }
      if (i < command.length) i++; // skip closing "
      continue;
    }

    // Handle single quotes
    if (ch === "'" && inDollarParen === 0 && !inBacktick) {
      i++;
      while (i < command.length && command[i] !== "'") {
        current += command[i];
        i++;
      }
      if (i < command.length) i++; // skip closing '
      continue;
    }

    // Handle backslash escapes
    if (ch === '\\' && i + 1 < command.length) {
      current += command[i];
      current += command[i + 1];
      i += 2;
      continue;
    }

    // Handle whitespace (separator between tokens)
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current) tokens.push(current);
  return tokens;
}

function classify(command, subcommand, flags, paths) {
  return { command, subcommand, flags, paths };
}

function parseCommand(raw) {
  const tokens = tokenize(raw);
  if (tokens.length === 0) {
    return { raw, tokens: [], command: null, subcommand: null, flags: [], paths: [], redirects: [] };
  }

  let command = tokens[0];
  let subcommand = null;
  const flags = [];
  const paths = [];
  const redirects = [];

  if (KNOWN_COMPOUNDS.has(command) && tokens.length > 1) {
    subcommand = tokens[1];
    for (let i = 2; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.startsWith('--') || tok.startsWith('-')) {
        flags.push(tok);
      } else if (isRedirect(tok)) {
        redirects.push(tok);
      } else {
        paths.push(tok);
      }
    }
  } else {
    for (let i = 1; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.startsWith('--') || tok.startsWith('-')) {
        flags.push(tok);
      } else if (isRedirect(tok)) {
        redirects.push(tok);
      } else {
        paths.push(tok);
      }
    }
  }

  return { raw, tokens, command, subcommand, flags, paths, redirects };
}

function isRedirect(tok) {
  return tok === '>' || tok === '>>' || tok === '<' || tok === '<<'
    || tok === '>&' || tok === '>>&' || tok === '<&' || tok === '<&-'
    || tok.startsWith('>&') || tok.startsWith('>>&')
    || tok.startsWith('<&') || tok.startsWith('<&-')
    || tok.startsWith('>') || tok.startsWith('>>')
    || tok.startsWith('<') || tok.startsWith('<<');
}

const WRITE_REDIRECT_RE = /^>>?>$/;

function hasWriteRedirects(parsed) {
  return parsed.redirects.some(r => WRITE_REDIRECT_RE.test(r));
}

function splitByNewlines(raw) {
  // Split on \n or literal \n only when outside quotes, preserving quoted
  // content as a single unit.
  const parts = [];
  let current = '';
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    // Handle double quotes
    if (ch === '"') {
      current += ch;
      i++;
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === '\\' && i + 1 < raw.length) {
          current += raw[i] + raw[i + 1];
          i += 2;
        } else {
          current += raw[i];
          i++;
        }
      }
      if (i < raw.length) { current += raw[i]; i++; } // closing "
      continue;
    }

    // Handle single quotes
    if (ch === "'") {
      current += ch;
      i++;
      while (i < raw.length && raw[i] !== "'") {
        current += raw[i];
        i++;
      }
      if (i < raw.length) { current += raw[i]; i++; } // closing '
      continue;
    }

    // Handle literal \n (escaped)
    if (ch === '\\' && raw[i + 1] === 'n') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      i += 2;
      continue;
    }

    // Handle actual newline
    if (ch === '\n') {
      if (current.trim()) parts.push(current.trim());
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parse(input) {
  const raw = input.trim();
  if (!raw) {
    return { raw: '', commands: [] };
  }

  const segments = splitByNewlines(raw);
  const compoundParts = [];
  for (const seg of segments) {
    compoundParts.push(...splitCompound(seg));
  }
  const commands = compoundParts.map(part => parseCommand(part));

  return { raw, commands };
}

module.exports = Object.assign(parse, { hasWriteRedirects });
