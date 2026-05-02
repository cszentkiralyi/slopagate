const fs = require('node:fs');
const path = require('node:path');

class Memory {
  constructor(config) {
    const slopDir = config.slopDir || config.session?.config?.get?.('slop_dir') || config.get('slop_dir');
    this.slopDir = slopDir;
    this.memoryDir = path.join(slopDir, 'memory');
    this.indexFile = path.join(this.memoryDir, 'MEMORY.md');
    this.summaryTokenBudget = config.summaryTokenBudget || config.session?.config?.get?.('memory_summary_budget') || config.get('memory_summary_budget') || 500;
  }

  async init() {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
    if (!fs.existsSync(this.indexFile)) {
      this.createIndex();
    }
  }

  createIndex() {
    const entries = fs.readdirSync(this.memoryDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('MEMORY'))
      .map(f => {
        const content = fs.readFileSync(path.join(this.memoryDir, f), 'utf8');
        const summary = this.extractSummary(content);
        const label = this.extractLabel(content);
        return `${label}: ${summary}`;
      })
      .sort();

    const index = `# Memory Index\n\n* ${entries.join('\n* ')}\n`;
    fs.writeFileSync(this.indexFile, index);
  }

  extractSummary(content) {
    const lines = content.split('\n').filter(l => l.trim().startsWith('-'));
    if (lines.length === 0) return 'No summary available';
    return lines[0].replace('- ', '').trim().substring(0, 150);
  }

  extractLabel(content) {
    const lines = content.split('\n').filter(l => l.trim().startsWith('#'));
    if (lines.length === 0) return 'Untitled';
    return lines[0].replace('# ', '').trim();
  }

  list() {
    if (!fs.existsSync(this.indexFile)) return [];
    const content = fs.readFileSync(this.indexFile, 'utf8');
    const matches = content.match(/\* (.+?): (.+)/g) || [];
    return matches.map(m => {
      const match = m.match(/\* (.+?): (.+)/);
      if (!match) return null;
      return {
        file: match[1],
        summary: match[2]
      };
    }).filter(Boolean);
  }

  read(file) {
    const filePath = path.join(this.memoryDir, file);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  }

  write(file, content) {
    if (!content || !content.trim()) {
      throw new Error('Empty content');
    }
    if (file.startsWith('mem:')) file = file.slice(4);
    const filePath = path.join(this.memoryDir, file);
    fs.writeFileSync(filePath, content);
    this.createIndex();
  }

  delete(file) {
    if (!fs.existsSync(file)) throw new Error('File not found');
    fs.unlinkSync(file);
    this.createIndex();
  }

  search(query) {
    const entries = this.list();
    const q = query.toLowerCase();
    return entries.filter(e => e.summary.toLowerCase().includes(q));
  }
}

module.exports = Memory;