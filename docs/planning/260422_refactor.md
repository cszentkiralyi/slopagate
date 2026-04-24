# slopagate.js refactor

## What do we have now?

It's basically an ad-hoc script that glues everything together.

1. Loads Node libraries, configures markdown parser, and then processes environmental
   variables to configure the program
2. Defines a REPL function
3. Runs the REPL

The REPL is the real program:

1. Sets up UI elements: terminal, chat history, abort message, spinner, and input field
2. Displays system messages: banner, current connection/model, system prompt path
3. Creates the Harness
4. Defines a "clean up" function for when the program needs to terminate
5. Displays a system message indicating the program is ready
6. Defines handlers to add user, model, and tool messages to the chat history
7. Adds event handlers to update the UI for user aborts, tool messages, and model messages
8. Draws terminal for the first time
9. Adds input field key handler for mode transitions (normal/prompt vs bash)
10. Adds input field input handler to detect commands, or emit user message events & update
    the UI with new user messages

Then we just run the repl.

## How can that be refactored?

- Interface owns UI elements and is responsible for adding/removing/updating
- Program owns the Harness & Interface, connecting events to the two

## Refactor

### `Interface`

- Given command list & prompt modes
- Commands:
  - Shape: `{ name, arguments[]? }`
    - `name` : string, `"model"` is the `/model` command
    - `arguments` : array of `{ name, required?, placeholder?, possible? }` positional args;
      note that `placeholder` (fixed string when no argument value) is mutually-exclusive
      with `possible` (enum of possible values we'll use for hinting/autocompleting)
  - Validates _shape_ of commands; unknown commands, missing arguments, or illegal values (if
    we have `possible`) make "enter" into a noop while an error message displays
  - Emits `user:command` event with arguments array; we don't expect more than 1-2 arguments,
    each one word, so for now we'll do the parsing and return a single object mapping arg
    names to their values
- Modes:
  - Shape: `{ name, prompt, trigger|default }`
      - `{ name: "normal", prompt: "> ", default: true }`
      - `{ name: "bash",  prompt: "! ", trigger: '!' }`
  - Emits `user:input` with `{ mode, value }` or something when the user finishes entering
    their text; we don't expect to have many input modes, our only concern is how they effect
    the UI (e.g. no slash-command hinting in bash mode), so we own the current mode state
  - From default mode, if the user begins a line with a trigger, it enters that mode; once
    the user backspaces to an empty line, one more backspace returns to default mode with
    all but the last trigger character populated (as though the user backspaced into the
    trigger string when they left the mode). **Default mode doesn't support a trigger**,
    it's the base mode and it's "triggered" by not being in another mode.
  - Later we can add "before mode change," "after mode change," "mode transition from A to
    B," etc hooks but that's incredibly-overkill right now when all we care about is the
    fact that the user entered text in a certain mode and we need to emit that.
- Owns all TUI Component instances
- Exposes UI mutation methods to add chat history, update status line, toggle standard
  spinners (general "processing", for a specific tool's message), etc
- Exposes metadata mutation methods to allow updating what commands & modes are available,
  which also allows "changing" a command (e.g. if a list of possible values needs to be
  updated to match new data)

### `Program`

- Owns the Harness (like `repl()` does today) plus `Interface`
- Responsible for disposing of harness & interface
- Owns command definitions: `{ name, arguments, handler }` (these will be extracted later
  but for now they can be inline), metadata of name/arg is passed to `Interface`
- Owns input mode definitions: `{ name, trigger, prompt, default, handler }` (also extracted
  in the future), and passes name/prompt/default/trigger to Interface
- Listens to message events like today, but calls `Interface` methods to update UI with
  messages/errors or whatever we display to the user
- Listens to new `user:command` & `user:input` events to call appropriate handlers instead
  of having a monolithic `onInput()`; `Interface` takes care of "what kind of message did
  the user provide?" (a certain command, input in a certain mode, etc), and all we do is
  invoke the appropriate handler