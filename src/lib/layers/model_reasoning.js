const model_reasoning = ({ messages, config }) => {
  let ttl = config.ttl ?? 0; // Unspecified = drop all reasoning
  let reasoning_count = 0;
  let ret = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.reasoning_content !== undefined) {
      reasoning_count++;
      if (reasoning_count > ttl) {
        let copy = { ...m };
        delete copy.reasoning_content;
        ret.push(copy);
      } else {
        ret.push(m);
      }
    } else {
      ret.push(m);
    }
  }
  return { messages: ret.reverse() };
};

module.exports = model_reasoning;
