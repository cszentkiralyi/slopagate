# Slopagate Project Summary

## Project Type
Terminal-based AI coding assistant that uses a local LLM model to perform actions.

## Architecture
- **Main entry**: `src/slopagate.js`, but logic is in `src/core/program.js`
- **Bundling**: Uses esbuild (via `scripts/sea.sh`) to produce a `slop` binary
- **Model connection**: configurable API endpoint with Ollama and OpenAI API support

## Source Directory (`src/`)
- `slopagate.js` - Main application, uses TUI (terminal UI) with banners and spinner
- `core/` - Core modules of the application: interface, config, and logic
- `lib/` - Various sub-modules like ANSI escape libraries, abstractions like `Context`, `Session`, and `Harness`
  - `components/` - TUI components
  - `layers/` - Compaction layers for context management
- `tools/` - CLI tools: bash, edit, grep, ls, read, tool.js base

## Config Files
- `package.json` - Node.js project, main: `src/slopagate.js`, scripts: dev, build, clean, test
- `sea.json` - Node.js SEA configuration file for `slop` binary build

## Key Dependencies
- `esbuild` ^0.28.0 (devDependency)
- CommonJS module system

# Rules

You must preface all your commit messages with "VIBE:".