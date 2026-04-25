These are not complaints, they are notes of things the harness should consider
mitigating.

- Edits sometimes double-up files after a while; cause unknown
  - Validate edits by paren count?
- Sometimes models rewrite the whole file (e.g. -57 +56 in a 56-line file), I
  think `edit` should prevent that and force existing files to be edited in
  chunks.