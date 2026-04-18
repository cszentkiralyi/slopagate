const fs = require('node:fs');

const { ID } = require('./util.js');

class Session {
  _id;
  _model;
  _think;
  _connection;

  history = [];
  tools;
  get id() { return this._id; }
  get model() { return this._model; }
  get think() { return this._think; }
  get connection() { return this._connection; }
  
  get toolDefinitions() {
    return this.tools.map(t => t.description);
  }
  
  constructor(props) {
    this._id = props.id || ID();
    this._model = props.model;
    this._think = props.think || false;
    this._connection = props.connection;
    this.tools = props.tools || [];
  }
  
  async handleTool(toolCall) {
    let id = toolCall.id;
    let name = toolCall.function.name;
    let args = toolCall.function.arguments;
    let output;
    
    let tool = this.tools.filter(t => t.name === name)[0];
    if (tool) {
      output = await tool.run(args);
    } else {
      output = `Error: tool "${name}" not found!`;
    }
    
    return { id, tool_name: name, content: output };
  }
  
  async send_internal(messages)  {
    let payload = {
      model: this.model,
      think: false, // TODO
      stream: false, // TODO
      messages: messages,
      tools: this.tools.map(t => t.spec)
    };
    
    let response = await fetch(this.connection, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
      // TODO
      // signal: abortSignal
      // Somewhere else, make an AbortController whose c.signal we pass here.
      // Use c.abort() to cancel this request.
    });

    // TODO: blindly assumes success
    let responseJson = await response.text();
    return JSON.parse(responseJson);
  }
  
  async send(outgoing) {
    this.history.push(outgoing);

    let responseObj = await this.send_internal(this.history);
    // TODO: responseObj has other cool stuff in it that I want to use later:
    // - prompt_eval_count (tokens up)
    // - eval_count (tokens down)
    // - prompt_eval_duration / eval_duration / total_duration
    let incoming = responseObj.message;
    
    while (incoming.tool_calls) {
      let results = await Promise.all(incoming.tool_calls.map(t => this.handleTool(t)));
      results.forEach(r => r.role = 'tool');
      // TODO: assumes 1 tool call with no accompanying user-facing content
      this.history.push(results[0]);
      responseObj = await this.send_internal(this.history);
      incoming = responseObj.message;
    }

    this.history.push(incoming);
    return incoming;
  }
}

module.exports = Session;