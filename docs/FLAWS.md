# Small-model flaws

These are not complaints, they are notes of things the harness should consider mitigating.

- Edits sometimes double-up files after a while; cause unknown
  - Validate edits by paren count?
- Sometimes models rewrite the whole file (e.g. -57 +56 in a 56-line file), I think `edit` should prevent that and force existing files to be edited in chunks.
- These models suck at incorporating their changes into their known file content. If we read something, then edit it, we need to purge those old reads since they might be inaccurate and the model can't possibly recover on its own so we might as well just clap the whole thing and make it re-read from zero.
- If it screws up a search string for `edit`, it'll start trying to use `bash` to run commands or write/execute scripts to do the edits. It would be nice to catch this and shut it down sooner rather than later.
- If we detect strings of errors (failed bash calls in a chain, reading the wrong directory over and over, etc) should we just put a stop to things and tell me model to figure its shit out? I'm not sure how to *correct* this behavior, just that it's annoying, detectable, and something I don't want to see.
- Qwen especially *loves* reading whole files instead of using `grep` to narrow down ranges. What if we block whole-file `read` until the agent searches or the user mentions the file by name? Or even harder, the LLM _has_ to use `grep` before reading every turn, or _every time_?

  
## Implemented mitigations

### Command steering

**Verdict: effective**. We went from seeing strings of bad bash commands (try this, no this, okay how about this) to seeing just one rejected attempt and then correct tool usage on the next tool call based on the hint.

> Models *really* want to use `bash`, we should have a hinting system that steers them towards similar tools instead of disallowed commands:
> 
> - `cat <<*`, `sed` = `edit`
> - `cat *`, `head *`, `tail *` = `read`
> - `ls`, `find` = `ls`
> - `grep` = `grep`
> 
> It might also be that tools named `ls` & `grep` are confusing, maybe we should rename them? `glob` & `string-search`? Capitalize them to `Ls` or `Glob`?