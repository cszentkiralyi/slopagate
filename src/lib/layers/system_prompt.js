const system_prompt = ({ messages, system_prompt, limits, estimated_tokens }) => {
  if (!system_prompt || !system_prompt.length
    || !limits || !limits.system_prompt
    || estimated_tokens < limits.system_prompt)
    return;
  let budget = limits.system_prompt,
    prompt = system_prompt.split('\n'),
    lines = [];
  i;
  for (i = 0; i < prompt.length && budget > 0; i++) {
    lines.push(prompt[i]);
    budget -= Context.estimateTokens(prompt[i]);
  }
  // We currently allow overshooting if there's no newline.
  return { system_prompt: lines.join('\n') };
};

module.exports = system_prompt;