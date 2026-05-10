class Skills {
  static FRONT_MATTER_KEYS = [ 'name', 'description' ];
  static NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  
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
    if (!skillTexts) return;
    for (let { text, dirName } of skillTexts) {
      let skill = Skills.parse(text, dirName);
      if (skill) {
        this.#skills.set(skill.name, skill);
      }
    }
  }
  
  static parse(skillText, dirName) {
    if (!skillText || typeof skillText !== 'string') return null;
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
    
    let name = ret.name, desc = ret.description;
    
    // Validate required fields
    if (!name || !desc) return null;
    
    // Name must be 1-64 characters
    if (name.length < 1 || name.length > 64) return null;
    
    // Name must match directory name
    if (dirName && name !== dirName) return null;
    
    // Name format: lowercase alphanumeric and hyphens, no consecutive hyphens, no start/end with hyphen
    if (!Skills.NAME_RE.test(name)) return null;
    
    ret.content = skillText.substring(blockEnd + 3);
    return ret;
  }

}

module.exports = Skills;