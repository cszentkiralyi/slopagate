const fs = require('node:fs');
const path = require('node:path');
const { Logger } = require('../util.js');

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
    Logger.log(`Rebuilding memory index (${fs.readdirSync(this.memoryDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md').length} files)`);
    const files = fs.readdirSync(this.memoryDir)
      .filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
      .sort();

    const entries = files.map(f => {
      const content = fs.readFileSync(path.join(this.memoryDir, f), 'utf8');
      const firstLine = content.split('\n')[0]?.trim() || f;
      return `${f}: ${firstLine}`;
    });

    const index = `# Memory Index\n\n* ${entries.join('\n* ')}\n`;
    fs.writeFileSync(this.indexFile, index);
  }

  list() {
    Logger.log(`Listing memory entries`);
    if (!fs.existsSync(this.memoryDir)) return [];
    return fs.readdirSync(this.memoryDir)
      .filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
      .sort()
      .map(f => {
        const content = fs.readFileSync(path.join(this.memoryDir, f), 'utf8');
        const firstLine = content.split('\n')[0]?.trim().replace(/^#+\s*/, '') || f;
        return { file: f, summary: firstLine };
      });
  }

  read(file) {
    Logger.log(`Reading memory file: ${file}`);
    const filePath = path.join(this.memoryDir, file);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  }

  write(file, content) {
    Logger.log(`Writing memory file: ${file}`);
    if (!content || !content.trim()) {
      throw new Error('Empty content');
    }
    const filePath = path.join(this.memoryDir, file);
    fs.writeFileSync(filePath, content);
    this.createIndex();
  }

  delete(file) {
    Logger.log(`Deleting memory file: ${file}`);
    const filePath = path.join(this.memoryDir, file);
    if (!fs.existsSync(filePath)) throw new Error('File not found');
    fs.unlinkSync(filePath);
    this.createIndex();
  }

  search(query) {
    Logger.log(`Searching memory for: ${query}`);
    const q = query.toLowerCase();
    return this.list()
      .filter(e => fs.readFileSync(path.join(this.memoryDir, e.file), 'utf8').toLowerCase().includes(q));
  }
}

module.exports = Memory;