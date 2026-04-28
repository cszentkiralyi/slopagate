class Skills {
  static FRONT_MATTER_KEYS = [ 'name', 'description' ];
  
  #skills = new Map();
  
  get names() { return Array.from(this.#skills.keys()); }

  constructor(props) {
    let { skillTexts } = props || {};
    this.addSkills(skillTexts);
  }
  
  get(skill) {
    return this.#skills.get(skill);
  }
  
  has(skill) {
    return this.#skills.has(skill);
  }
  
  addSkills(skillTexts) {
    let skill;
    for (let i in skillTexts) {
      if (skill = Skills.parse(skillTexts[i])) {
        this.#skills.set(skill.name, skill);
      }
    }
  }
  
  static parse(skillText) {
    if (!skillText || !skillText.length || skillText.length < 6) return null;
    let blockStart = skillText.indexOf('---'),
        blockEnd = skillText.indexOf('---', 3),
        content = skillText.substring(blockStart + 3, blockEnd),
        lines = content.split('\n'),
        ret = {}, line, i, k, s_k, v;
        
    lines.forEach(line => {
      for (i in Skills.FRONT_MATTER_KEYS) {
        k = Skills.FRONT_MATTER_KEYS[i];
        s_k = k + ':';
        if (line.startsWith(s_k)) {
          v = line.substring(s_k.length).trim();
          ret[k] = v;
          break;
        }
      }
    });
    
    if (Object.keys(ret).length) {
      ret.content = skillText.substring(blockEnd + 3);
      return ret;
    }
    
    return null;
  }

}

module.exports = Skills;