//const process = require('node:process');
const fs = require('node:fs');

const MIN_HISTORY_LENGTH = 8;

const MIN_TOOL_STREAK = 2;
const MAX_TOOL_GAP = 1;

const declutterChatHistory = (_) => {
  const stdinContent = fs.readFileSync(0, 'utf-8');

  if (!stdinContent) return 1;

  try {
    let data = JSON.parse(`{"chat":[stdinContent]}`);
    
    if (data.chat.length < MIN_HISTORY_LENGTH) {
      console.log(stdinContent);
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
        readsSeen.forEach(read => {
          let prevTop = topReads[read.file];
          if (prevTop == null || (read.range == null && prevTop.range != null)) {
            topReads[read.file] = read;
            return;
          }
          // already found one that reads the whole file
          if (!prevTop.range || !read.range) {
            trashReads.push(read);
          // we're bigger both ways
          } else if (prevTop.range[0] <= read.range[0] && prevTop.range[1] <= read.range[1]) {
            trashReads.push(prevTop);
            topReads[read.file] = read;
          }
        });
        if (trashReads.length) {
          const removedMsgIds = new Set(trashReads.map(r => r.id));
          const toRemove = [];

          // Scan backwards through `decluttered` within the window
          for (let i = chatIdx - MAX_TOOL_GAP * 2; i < chatIdx; i++) {
            // Find tool calls with trash read IDs
            if (decluttered[i] && decluttered[i].tool_calls) {
              decluttered[i].tool_calls.forEach(tc => {
                if (removedMsgIds.has(tc.id)) {
                  toRemove.push(i);
                  removedMsgIds.delete(tc.id);
                }
              });
            }
            // Find tool responses for trash reads
            if (decluttered[i]?.role === 'tool' && decluttered[i].id) {
              const trashIdx = trashReads.findIndex(r => r.id === decluttered[i].id);
              if (trashIdx !== -1) {
                toRemove.push(i);
              }
            }
          }

          // Remove messages in reverse order to preserve indices
          for (const idx of toRemove.sort((a, b) => b - a)) {
            decluttered.splice(idx, 1);
            chatIdx--;
          }
        }
      }

    }


  } catch (error) {
    console.error('Error:', error.message);
    return 1;
  }
};

export { declutterChatHistory };