//const process = require('node:process');
const fs = require('node:fs');

const MIN_HISTORY_LENGTH = 8;

const MIN_TOOL_STREAK = 2;
const MAX_TOOL_GAP = 1;
const MAX_READ_DELTA = 3;

const declutterChatHistory = (_) => {
  const stdinContent = fs.readFileSync(0, 'utf-8');

  if (!stdinContent) return 1;

  try {
    let data = JSON.parse(`{"chat":[${stdinContent}]}`);
    
    if (data.chat.length < MIN_HISTORY_LENGTH) {
      return 0;
    }
    
    let decluttered = [];
    
    let readsSeen = [];
    let chatIdx, msg, seen;
    for (chatIdx = 0; chatIdx < data.chat.length; chatIdx++) {
      msg = data.chat[chatIdx];
      decluttered.push(msg);

      if (msg.role !== 'assistant') {
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

        const isSupersetRange = (a, b) => b.range[0] <= a.range[0] && b.range[1] <= a.range[1];
        const isLeewayRange = (a, b) => {
          if (a.range[0] <= b.range[0] && a.range[1] <= b.range[1]) return false;
          let idx = (a.range[0] < b.range[0]) ? 0 : 1;
          if (a.range[idx] + MAX_READ_DELTA >= b.range[idx]) return true;
          return false;
        }

        readsSeen.forEach(read => {
          let prevTop = topReads[read.file];
          if (prevTop == null || (read.range == null && prevTop.range != null)) {
            topReads[read.file] = read;
            return;
          }
          // already found one that reads the whole file
          if (!prevTop.range || !read.range) {
            trashReads.push(read);
            return;
          } else if (isSupersetRange(read, prevTop) || isLeewayRange(read, prevTop)) {
            trashReads.push(prevTop);
            topReads[read.file] = read;
          }
        });
        if (trashReads.length) {
          const removedMsgIds = new Set(trashReads.map(r => r.id));
          const toRemove = [];

          // Scan backwards through `decluttered` within the window
          for (let i = 0; i >= 0 && i < MAX_TOOL_GAP * 2 && i < decluttered.length; i++) {
            // Find tool calls with trash read IDs
            let idx = decluttered.length - i - 1;
            let msg = decluttered[idx];
            if (!msg) continue;
            if (msg.role === 'assistant' && msg.tool_calls) {
              msg.tool_calls.forEach(tc => {
                if (removedMsgIds.has(tc.id)) {
                  msg.tool_calls.filter(x => x !== tc);
                }
              });
            // Find tool responses for trash reads
            } else if (msg.role === 'tool' && removedMsgIds.has(msg.id)) {
              toRemove.push(idx);
            }
          }

          // Remove messages in reverse order to preserve indices
          for (const idx of toRemove.sort((a, b) => b - a)) {
            decluttered.splice(idx, 1); // TODO: is splice efficient at all?
          }
        }
      }
    }
    
    let result = JSON.stringify(decluttered);
    result = result.substring(1, result.length - 2);
    console.log(result);

  } catch (error) {
    console.error('Error:', error.message);
    return 1;
  }
};

module.exports = { declutterChatHistory };