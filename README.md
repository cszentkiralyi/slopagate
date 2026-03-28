# slopagate.sh

Propagate slop with the lowest-common denominator: a shell script. It's no
OpenCode or Claude Code, but it will sure impersonate one badly.

Run `bin/slop` to start. Use `help` CLI command to see the environmental
variables that are used to configure the harness, directories used to set
prompts and load commands, etc. Most of your time will just be spent in the
LLM REPL like any other harness.

Requires `jq`, `curl`, and then basic POSIX stuff like `awk`, `sed`, etc.
You'll also need to populate the `vendor/` subdirectories based on their
respective `version.txt` files describing repos/releases -- this could be
handled by NPM or something, but this is still a no-ecosystem shell script
so don't get ahead of yourself.