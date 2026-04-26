These are not complaints, they are notes of things the harness should consider
mitigating.

- Edits sometimes double-up files after a while; cause unknown
  - Validate edits by paren count?
- Sometimes models rewrite the whole file (e.g. -57 +56 in a 56-line file), I
  think `edit` should prevent that and force existing files to be edited in
  chunks.
- These models suck at incorporating their changes into their known file 
  content. If we read something, then edit it, we need to purge those old reads
  since they might be inaccurate and the model can't possibly recover on its
  own so we might as well just clap the whole thing and make it re-read from
  zero.
- If it screws up a search string for `edit`, it'll start trying to use `bash`
  to run commands or write/execute scripts to do the edits. It would be nice to
  catch this and shut it down sooner rather than later.