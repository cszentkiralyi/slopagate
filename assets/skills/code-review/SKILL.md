---
name: code-review
description: review code for issues, improvements, and best practices
---
Perform a review of the following: $ARGUMENTS. If nothing was provided, ask the user what they want you to review. Focus on the following areas in the changes:

- Do the changes introduce new bugs or broken functionality? Missing references or syntax errors?
- Is there redundant or wasteful logic, unused variables, and dead code?
- Does the code style, naming conventions, and indentation match the surrounding file?

Start with a "ship"/"don't ship" verdict, and then specify the issues you found with specific examples. Do not justify a "ship" decision unless something is so surprising/clever that it might be a problem. If you think you found a bug or logical error, verify it; don't assume what helpers do or what variables exist without doing some tracing first.
