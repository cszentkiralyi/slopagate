# Slopagate

> A coding agent harness similar to OpenCode or Claude Code, but much worse.

Node.js port of a Bash project to take small, local language models to their illogical extreme in pursuit of agentic coding assistant behavior. If you can read a `package.json` I'd start there.

## Usage

```
# Start a session from the repo
$ npm run dev

# Build standalone `slop` SEA binary for distribution
$ npm run build
$ ./slop
```

## Structure

- `src/core/interface.js` handles instantuating & exposing the TUI
- `src/core/program.js` handles instantiating the harness model, loading configs, and hooking up to the Interface

Read `SLOP.md` for the rest, we feed it to LLMs so it'll be good enough for humans too.

## Apologies

I have written this primarily for personal use. The harness has many assumptions built around me running local models on Arch Linux. Tools and paths may need to be adjusted for other environments; if you have ideas for a robust abstraction over that, I'm open to PRs.

Also I am writing this on my free time, for fun, just because I can; hence the borderline-do-whatever-you-want MIT license. If you have problems or run into issues, feel free to open an issue that may be ignored, or better yet fix it and open a PR. This is not high-quality software, it is an exploratory hobby project that has happened to turn out well.