# slopagate.sh

Propagate slop with the lowest-common denominator: a shell script. It's no
OpenCode or Claude Code, but it will sure impersonate one badly.

Foolishly assumes you run Ollama at the default endpoint; you can change a
lot of stuff but it expects Ollama's default HTTP API no matter the endpoint.

Run `bin/slop` to start. Use `help` CLI command to see the environmental
variables that are used to configure the harness, directories used to set
prompts and load commands, etc. Most of your time will just be spent in the
LLM REPL like any other harness.

Requires `jq`, `curl`, `node`, and then basic POSIX stuff like `awk`, `grep`,
etc. You'll also need to check the `version.txt` files in `vendor/` and
populate those dependencies yourself.


## Building & running

Instructions are approximate because I've been working on this for two weeks
straight and don't know what a fresh environment looks like anymore.

1. Check `vendor/` and populate its folders with... whatever `version.txt`
   says to. I didn't think this part through.
2. `make bin/stt` to build the sufficient text tool
3. `make slop` or `bin/slop` to run, lots of things are controlled through
   env vars so check `slop help` or read the script to configure it.


## Node war crimes

There are tools that this script depends on to solve trivial problems that
common Bash approaches make tedious. These are bundled into a standalone
Node executable and placed in `bin/`. Use `make bin/stt` to make the sufficient
text tool from the Javascript in `src/stt/`.