# TODO

## Priority

- [ ] Modes for `Interface`
  - [ ] Framework: default, triggers & alternate prompts, back-out
  - [ ] Shell
- [ ] Argument hinting
- [ ] Commands for config
  - [x] Config framework
  - [ ] Commands
- [ ] I think during an agent turn, more than one message might have `done`,
      the spinner is not showing up as consistently as I expected.

## Backlog

- [ ] Each `edit` file should be a unique temp file; two simultaneous edit calls
      to different files fucked stuff up
- [ ] Security/permissions (nominal, not comprehensive; they're sanity checks)
  - [ ] User approval mechanism w/ session memory (yes, yes for this session, no,
        no for this session)
  - [ ] Gate paths: all paths must be in or below the current directory, and they
        must be specified as relative paths (maybe)
- [ ] Shell shortcut: `!` which should change the prompt
- [ ] Context compaction/engineering
  - [ ] unread to compact reads
  - [ ] promptdoc to alter system prompt
  - [ ] scribe to summarize (done automatically on a delay? at certain token
        breakpoints? every n turns? like claude)
- [ ] Tools
  - [x] Go back to global tool 'messages' calls, group them by tool as we iterate
        over them to call them to change the signature to accept n >= 1 calls, and
        e.g. 'read' should make it 'X and n other files'
  - [ ] Dedicated spinner: in addition to the "autofilling" one, between the
        time a tool call starts and the model responds to its response, the tool
        should spin.
        Or maybe just until the tool response goes out?
  - [ ] Replace `ls` with `glob` that uses `find` under the hood?
- [ ] Error handling
  - [ ] Tools
    - [x] Response
    - [ ] UI
  - [ ] Models - UI
  - [ ] Slash commands - UI
- [ ] Up/down history access, it's present but bad
- [ ] `SLOP.md`
- [ ] Wait for `harness:ready`
- [ ] Slash commands
  - [ ] /system to refresh system prompts
  - [ ] /think to toggle thinking
  - [ ] /effort maybe
  - [ ] /plan to disable editing tools (need system prompt change?)
  - [ ] others?
- [ ] Autocomplete
  - [ ] Files with @
  - [ ] Slash commands
- [ ] Memory (required "edit" tool to be done)
  - [ ] Auto-memory
  - [ ] /init & SLOP.md
- [ ] Auto-summarize after being idle & at certain points (e.g. Claude uses
      "approaching context window limit" as a trigger)
  [ ] Tool calls have been half-heartedtly coralled by a mutex Set, but that
      does not explain why we are executing tool calls twice by responding to
      the `tool:call` message twice.
- [ ] Command-line commands
  - [ ] `history {id}`
    - `less` the history JSON if interactively-called
    - `cat` if non-interactive
    - `--path` argument just returns the path to that history ID JSON file
  - [ ] `help` prints a description of CLI commands, flags, env vars we give
        a shit about, etc
- [ ] Add padding support to containers (no, why?)