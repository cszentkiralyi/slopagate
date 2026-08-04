## Project Type
Terminal-based AI coding assistant that uses a local LLM model to perform actions.

## Architecture
- **Main entry**: `src/slopagate.js`, but logic is in `src/core/program.js`
- **Bundling**: Uses esbuild (via `scripts/sea.sh`) to produce a `slop` binary
- **Model connection**: configurable API endpoint with Ollama and OpenAI API support

## Source Directory (`src/`)
- `slopagate.js` - Main application, uses TUI (terminal UI) with banners and spinner
- `core/` - Core modules of the application: interface, config, and program gluing logic to UI
- `lib/` - Sub-modules like helper libraries; abstractions like `Context`, `Session`, and `Harness`
  - `components/` - TUI components
  - `layers/` - Compaction layers for context management
- `tools/` - CLI tools: bash, edit, grep, ls, read, tool.js base class

## Dev tools
- Tests: `node --test` on files in `test/`, no external deps
- Syntax checks: `node -e "require('./src/path/to/file.js')"`

## Rules
You must preface all your commit messages with "VIBE:", and end with the line "Co-authored-by: Qwen <qwen@slopagate.fake>".
