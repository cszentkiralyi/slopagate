# slop context management

## Problems & challenges we are solving

The big, overarching theme here is that the middle of the context window is where
data goes to die. With a lesser SLM and accompanying smaller (<128K) context window,
we need to be more-careful about what's in context at any given time.

### Kinds of messages/data

#### System prompt

- Not part of normal history, so it's exempt from compaction, summarization, etc
- Should be dynamic so parts can be turned on/off based on what's happening (e.g. no
  tool guidance section if there are no tools)
- Compress? If we allocate a token budget for the system prompt, we can use that to
  strip out sections (based on headers, I guess?) to fit in the budget

#### Tool calls

- Low-priority: `ls` & `grep` output shouldn't be relevant as long as `read` or
  `edit`; once a file is found, do we *really* care about what else is in the
  directory? So not all tools should be treated equally.
- Errors: Can we detect a bad call, followed by a good one, that lets us just nuke
  the bad call from history outright?
- Redundancy: (`read` only, for now) often read a small range of lines, then a
  larger range or the whole file; if the small range is a strict subset of a later
  read within some turn threshold, we can just outright remove the small range
  since it's redundant.
- Length: Tool responses over some age and length thresholds should have their
  content trimmed in the middle with a "[... N chars truncated ...]" message to
  replace it (little-coder did a ratio of 50%/25% as opposed to a fixed length
  and/or split down the middle). Maybe a token limit?
- Age: All tool calls should, eventually, be replaced by a "[Old tool result
  content cleared]" string or something like Claude

#### Conversation

- The N most-recent messages need to remain in context verbatim
- Message "importance" is basically an inverted bell curve, translated left:

  `▇▇▅▃▂▁▂▃▄▅▆▇████`
  
  Compacting messages does not affect this, and in fact moves more of the (now
  summarized) context _up_ in importance by merging it with "earlier" messages.
  Maybe this should be actually represented, mathematically?
  
  `y =  min(1, 1 - (0.9 * e^(-((* x) - 0.5)^2 / (2 * (0.25)^2))))`
  
  For x in [0, 1], return importance y in [0.1, 1] where higher = more-important
  
  - `0.9` is the amplitude A; we invert so (1 - A) is the lowest importance score
    we will assign
  - `0.5` is the center of the curve
  - `1.2x` shrinks the curve width by ~10% (maybe unnecessary? or silly?)
  - `0.25` is the standard deviation (68% are +/- <=1 dev from center, 95% <=2,
    99% <= 3)
- At some point we need to use the LLM to summarize for us, condensing multiple
  old user/model messages & tool responses into a single fake user message with
  a fake "thanks, now I have the context to continue" model response.

### Goals

The overall point is to show the user reality (every message, in the order it
was arrived or sent, without modifications) but constantly tweak what we send
to the model to maintain its reasoning & output quality.

1. Every message is added to a root context, like our current "history." This
   is all we ever serialize as part of a session. This is the initial "active"
   context.
2. If the active context reaches some threshold, or the user runs the command,
   we fork & full compact, and the new context becomes active. The context we
   deal with when talking to the server is limited to relevant message data and
   we fit it in the context window length.
3. Before every message we send to the model (user/tool/system), we fork our
   active context & light compact to strip out low-hanging fruit.

## Design

### `Context` class

A `Context` represents the chat data the session will provide to a model at the
start of the user's turn: the system prompt, user messages, tool responses, and
model messages. It provides utilities to manage context length, and contents.

- `estimated_tokens` : number, estimated tokens for prompt + messages + budgets
  that can be used as a proxy for "how much context are we eating," should only
  be updated on new message and fully recalculated on init or self-compact
- `limits` : object `{ system_prompt, window, tool_response, tool_age }`, the
  token or turn limitations for various compaction layers
- `budgets` : object `{ generation }`, token amounts to reserve for various
  purposes
- `system_prompt` : string (public)
- `messages` : array of messages, replaces current `Session.history` (public)
- `add(message)` : public method to add message to context
- `fork(layers)` : return a new deep copy with the given compaction layers
  applied to the copy; maybe also a way to provide a new system prompt before
  the compaction is applied?
- `compact(layers)` : destructively apply the given compactions to self
- `requestSummary(s)` : callback used by `chat_summary` compaction to summarize
  the transcript string `s` via external means

#### Compaction types

- Light: system_prompt, tool_age, tool_redundancy, chat_importance
- Full: tool_age, tool_length, tool_redundancy, chat_summary

#### Compaction layers

TBD: do we honor `this.limits.window` as-is, or do we keep ourselves under
some threshold (70%) _of_ that? little-coder reserved a generation budget,
and so can we... is that enough?

Finalized layers:

- `system_prompt`
  - Compress system prompt text to fit in `this.limits.system_prompt` tokens
  - Only run if prompt exceeds limit
- `tool_age`
  - Prune (remove) tool calls & responses over a certain age in turns,
    specified globally or by tool name in `this.limits.tool_age`
  - Always runs
- `tool_length`
  - Trim tool responses to fit in `this.limits.tool_response` tokens
  - Only runs if entire context exceeds `this.limits.window`
- `tool_redundancy`
  - Prune tool calls that are subsets of later tool calls
  - Always runs
- `chat_importance`
  - Auto-prune messages based on importance score, respecting back-and-forth
  - Only runs if entire context exceeds `this.limits.window`
- `chat_summary`
  - Convert all but the N-most-recent messages into a transcript and use
    `this.requestSummary()` to replace them with on synthetic back-and-forth
    of the summary from the user, and the model thanking them for context
  - Only runs if entire context exceeds `this.limits.window`

Experimental/hypothetical layers:

- `chat_length`
  - Prune all but the N-most-recent messages, respecting back-and-forth (in
    what direction? add or subtract one if unbalanced)
  - No idea why we'd use this over `chat_summary` *or* `chat_importance`
- `chat_relevance`
  - Convert all but the N-most-recent messages into a transcript and use
    `this.requestRelevancePrune()` to prune them based on whether the result
    considers them relevant to the user's most-recent message
  - Maybe kicks in once we exceed a threshold of tool calls in our messages?