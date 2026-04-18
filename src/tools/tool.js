class Tool {
  name;
  description;
  parameters;
  handler;
  
  get spec() {
    return {
      'type': 'function',
      'function': {
        'name': this.name,
        'description': this.description || this.name,
        'parameters': this.parameters,
      }
    };
  }
  get json() { return JSON.stringify(this.spec); }
  
  constructor(props) { Object.assign(this, props); }
  
  async run(args) {
    return await this.handler(args);
  }
}

module.exports = Tool;