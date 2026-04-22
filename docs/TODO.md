# TODO

## Priority

Big refactor of `slopagate.js`, it's time to clean up the glue that holds
all the well-engineered pieces together. I don't know what that looks like
yet.

## Backlog

- [ ] Save session history more-often
  - Every model response with content?
  - Every `done` model response?
  - Every few minutes?
- [ ] New, simplistic Markdown renderer
  - Only double & single asterisk/underscore, inline code
  - Single-line headers
  - Code blocks via triple-grave
  - `Text.fit`: "respect list" option that will detect /^(\w*)\([^ ]*) / and then
    preface every new line with `' '.repeat(measure($1 + $2))`.
- [ ] `SLOP.md`
- [ ] Shell shortcut: `!` which should change the prompt
- [ ] Tools
  - [ ] Go back to global tool 'messages' calls, group them by tool as we iterate
        over them to call them to change the signature to accept n >= 1 calls, and
        e.g. 'read' should make it 'X and n other files'
  - [ ] Dedicated spinner: in addition to the "autofilling" one, between the
        time a tool call starts and the model responds to its response, the tool
        should spin.
        Or maybe just until the tool response goes out?
- [ ] Error handling
  - [ ] Tools
    - [x] Response
    - [ ] UI
  - [ ] Models - UI
  - [ ] Slash commands - UI
- [ ] Up/down history access, it's present but bad
- [ ] Fix whatever the heck is going on with abort draws, we don't reliably
      redraw after hiding the spinner & showing the abort message.
- [ ] Add padding support to containers
- [ ] Wait for `harness:ready`
- [ ] Slash commands
  - [ ] /system to refresh system prompts
  - [ ] /think to toggle thinking
  - [ ] /effort maybe
  - [ ] /plan to disable editing tools (need system prompt change?)
- [ ] Context compaction/engineering
  - [ ] unread to compact reads
  - [ ] promptdoc to alter system prompt
  - [ ] scribe to summarize (done automatically on a delay? at certain token
        breakpoints? every n turns? like claude)
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