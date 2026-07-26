const Tool = require('./tool.js');

class ActivateSkillTool extends Tool {
  name = 'ActivateSkill';
  parameters = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the skill to activate' }
    },
    required: ['name']
  };

  get description() {
    if (!this.harness.skills || !this.harness.skills.names.length) {
      return 'Activate a skill to get its instructions. No skills loaded.';
    }
    const skillList = this.harness.skills.names.map(name => {
      const skill = this.harness.skills.get(name);
      const desc = skill?.description || 'No description';
      return `- ${name}: ${desc}`;
    }).join('\n');
    return `Activate a skill to get its instructions. Available skills:\n${skillList}`;
  }

  constructor(props) {
    super(props);
    this.handler = this.handler;
    Object.assign(this, props);
  }

  normalize() {
    return null;
  }

  async handler(args, tool) {
    if (!args.name) {
      return 'Error: Missing name argument';
    }
    tool.message({ state: 'spin', summary: args.name });
    const skill = this.harness.skills.get(args.name);
    if (!skill) {
      tool.message({ state: 'error', summary: args.name });
      return `Error: Skill "${args.name}" not found. Available skills: ${this.harness.skills.names.join(', ')}`;
    }
    tool.message({ state: 'done', summary: args.name });
    return skill.content;
  }
}

module.exports = ActivateSkillTool;