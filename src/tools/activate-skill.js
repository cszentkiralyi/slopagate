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
    if (!this.skills || !this.skills.names.length) {
      return 'Activate a skill to get its instructions. No skills loaded.';
    }
    const skillList = this.skills.names.map(name => {
      const skill = this.skills.get(name);
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

  async handler(args, tool) {
    if (!args.name) {
      return 'Error: Missing name argument';
    }
    const skill = this.skills.get(args.name);
    if (!skill) {
      return `Error: Skill "${args.name}" not found. Available skills: ${this.skills.names.join(', ')}`;
    }
    tool.message({ state: 'spin', subject: `ActivateSkill(${args.name})` });
    tool.message({ state: 'done', subject: `ActivateSkill(${args.name})` });
    return skill.content;
  }
}

module.exports = ActivateSkillTool;