# Bash Parser

## Goal
Parse raw shell strings into structured command objects: split compound commands, tokenize each, and classify tokens into command/subcommand/flags/paths. No safety analysis — that lives in `BashTool.permissions()`.

## Output shape
```js
{
  raw: 'ls && git reset --hard HEAD',
  commands: [
    {
      raw: 'ls',
      tokens: ['ls'],
      command: 'ls',
      subcommand: null,
      flags: [],
      paths: [],
    },
    {
      raw: 'git reset --hard HEAD',
      tokens: ['git', 'reset', '--hard', 'HEAD'],
      command: 'git',
      subcommand: 'reset',
      flags: ['--hard'],
      paths: ['HEAD'],
    }
  ]
}
```

## Plan

- [ ] **1. Define module structure**
  - `src/lib/bash-parser.js` — main parser
  - `src/lib/bash-parser.test.js` — tests

- [ ] **2. Implement state machine for compound split**
  - States: `normal`, `double-quote`, `single-quote`, `backtick`, `dollar-paren`
  - Track `$()` nesting depth
  - Recognize `&&`, `||`, `;`, `|`, newline as separators
  - Handle `\"`, `\\`, `\'` escapes inside quotes

- [ ] **3. Implement tokenizer per command**
  - Split on whitespace, respecting quotes/escapes
  - Handle `$()` interpolation (capture raw, don't evaluate)
  - Handle backtick interpolation (capture raw, don't evaluate)

- [ ] **4. Classify tokens into command/subcommand/flags/paths**
  - `tokens[0]` → `command`
  - Known compound commands (git, npm, docker, kubectl, etc.) → `tokens[1]` → `subcommand`
  - `--flag`, `-f`, `--flag=value` → `flags`
  - Everything else → `paths`

- [x] **5. Write tests**
  - Compound split: `ls && git reset --hard HEAD ; echo done | grep done`
  - Quotes: `echo "hello world" && ls 'file with spaces'`
  - Escapes: `echo "hello \"world\"" && ls`
  - `$()` nesting: `echo $(ls $(pwd)) && ls`
  - Backticks: `` echo `ls` && ls ``
  - Subcommand detection: `git reset --hard HEAD`, `npm install lodash`
  - Flags: `ls -la`, `git --hard`, `echo --color=always`
  - Paths: `ls /tmp/foo`, `git reset HEAD`
  - Edge cases: empty string, just whitespace, only separators

- [ ] **6. Integrate with BashTool**
  - `BashTool.permissions()` calls the parser
  - Returns permission entries per sub-command
  - Each entry gets a `summary` with the parsed structure

## Notes
- Don't try to be perfect. Handle the easy cases, let the user catch the weird ones.
- The parser is mechanical — no safety analysis, no "is this readonly".
- Known compound commands: git, npm, docker, kubectl, yarn, pnpm, npx, bun, deno, cargo, go, rustc, tsc, jest, mocha, vitest, eslint, prettier, etc.
