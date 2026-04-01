const fs = require('node:fs');

const MIN_HISTORY_LENGTH = 8;

const MIN_TOOL_STREAK = 2;
const MAX_TOOL_GAP = 1;
const MAX_READ_DELTA = 3;

// undo reading, not "not yet read"
const unreadChatHistory = (override_opts) => {
  const stdinContent = fs.readFileSync(0, 'utf-8');

  if (!stdinContent) return 1;

  try {
    let chat = JSON.parse(`[${stdinContent}]`);
    let chatlen = chat.length;
    let minlen = (override_opts && override_opts.min_len) || MIN_HISTORY_LENGTH;
    
    if (chatlen < minlen) {
      return 0;
    }
    
    let goodReads = [];
    let readsSeen = [];
    let chatIdx, msg, seen;
    for (chatIdx = 0; chatIdx < chatlen; chatIdx++) {
      msg = chat[chatIdx];
      goodReads.push(msg);

      // Ignore any non-LLM messages, and ignore the most-recent back-and-forth
      if (msg.role !== 'assistant' || chatIdx >= chatlen - 2) {
        continue;
      }

      if (msg.tool_calls) {
        msg.tool_calls.forEach(toolCall => {
          if (toolCall.function.name === 'read') {
            let toolArgs = toolCall.function.arguments;
            let range = null;
            if (toolArgs.start_line || toolArgs.end_line) {
              range = [toolArgs.start_line || 0, toolArgs.end_line || 9999];
            }
            readsSeen.push({
              idx: chatIdx,
              id: toolCall.id,
              file: toolArgs.function.arguments.file_path,
              range: range
            });
          }
        })
      }

      readsSeen = readsSeen.filter(read => chatIdx < read.idx + (MAX_TOOL_GAP * 2));
      if (readsSeen > MIN_TOOL_STREAK) {
        let topReads = {}, trashReads = [];
        
        // Returns true if `a` is a larger range than `b`
        const isSupersetRange = (a, b) => {
          if (a.range[0] <= b.range[0] && a.range[1] <= b.range[1]) return false;
          let idx = (a.range[0] < b.range[0]) ? 0 : 1;
          if (a.range[idx] + MAX_READ_DELTA >= b.range[idx]) return true;
          return false;
        }

        readsSeen.forEach(read => {
          let prevTop = topReads[read.file];
          if (prevTop == null || (read.range == null && prevTop.range != null)) {
            topReads[read.file] = read;
            if (prevTop) trashReads.push(prevTop);
            return;
          }
          if (!prevTop.range || !read.range) { // already found one that reads the whole file
            trashReads.push(read);
            return;
          }
          if (isSupersetRange(read, prevTop)) {
            trashReads.push(prevTop);
            topReads[read.file] = read;
          }
        });
        if (trashReads.length) {
          const removedMsgIds = new Set(trashReads.map(r => r.id));
          const toRemove = [];

          // Scan backwards through `goodReads` within the window
          for (let i = 0; i >= 0 && i < MAX_TOOL_GAP * 2 && i < goodReads.length; i++) {
            // Find tool calls with trash read IDs
            let idx = goodReads.length - i - 1;
            let msg = goodReads[idx];
            if (!msg) continue;
            if (msg.role === 'assistant' && msg.tool_calls) {
              let new_tools = [];
              msg.tool_calls.forEach(tc => {
                if (!removedMsgIds.has(tc.id))
                   new_tools.push(tc) 
              });
              if (new_tools.length) {
                msg.tool_calls = new_tools;
              } else {
                toRemove.push(idx); // TODO: maybe not
              }
            // Find tool responses for trash reads
            } else if (msg.role === 'tool' && removedMsgIds.has(msg.id)) {
              toRemove.push(idx);
            }
          }

          // Remove messages in reverse order to preserve indices
          for (const idx of toRemove.sort((a, b) => b - a)) {
            goodReads.splice(idx, 1); // TODO: is splice efficient at all?
          }
        }
      }
    }
    
    let result = JSON.stringify(goodReads);
    result = result.substring(1, result.length - 2);
    console.log(result);

  } catch (error) {
    console.error('Error:', error.message);
    return 1;
  }
};

module.exports = { unreadChatHistory };