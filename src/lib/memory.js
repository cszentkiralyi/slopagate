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
    try {
      if (!fs.existsSync(this.memoryDir)) {
        fs.mkdirSync(this.memoryDir, { recursive: true });
      }
      if (!fs.existsSync(this.indexFile)) {
        this.createIndex();
      }
    } catch (e) {
      Logger.log(`Memory init failed: ${e.message}`);
      return 'Error: tool use failed';
    }
  }

  createIndex() {
    try {
      const files = fs.readdirSync(this.memoryDir)
        .filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
        .sort();

      const entries = files.map(f => {
        const content = fs.readFileSync(path.join(this.memoryDir, f), 'utf8');
        const { metadata, content: body } = this.parseFrontmatter(content);
        const name = f.replace(/\.md$/, '');
        const description = metadata.summary || body.split('\n')[0]?.trim().replace(/^#+\s*/, '') || '';
        return `- ${name}: ${description}`;
      });

      const index = entries.join('\n') + (entries.length ? '\n' : '');
      fs.writeFileSync(this.indexFile, index);
    } catch (e) {
      Logger.log(`createIndex failed: ${e.message}`);
      return 'Error: tool use failed';
    }
  }

  parseFrontmatter(content) {
    const fmRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
    const match = content.match(fmRegex);
    if (!match) return { metadata: {}, content: content, hasFrontmatter: false };
    const meta = {};
    match[1].split('\n').forEach(line => {
      const [key, ...val] = line.split(':');
      if (key && val.length) meta[key.trim()] = val.join(':').trim();
    });
    return { metadata: meta, content: match[2], hasFrontmatter: true };
  }

  validateLastUpdated(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime());
  }

  isStale(dateStr) {
    if (!dateStr) return true;
    const d = new Date(dateStr);
    const now = new Date();
    return (now - d) > 86400000; // 1 day in ms
  }

  list() {
    try {
      Logger.log(`Listing memory entries`);
      if (!fs.existsSync(this.memoryDir)) return [];
      this.createIndex();
      const entries = fs.readdirSync(this.memoryDir)
        .filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
        .sort()
        .map(f => {
          const content = fs.readFileSync(path.join(this.memoryDir, f), 'utf8');
          const { metadata, content: body, hasFrontmatter } = this.parseFrontmatter(content);
          const summary = metadata.summary || (body.split('\n')[0] || '').trim().replace(/^#+\s*/, '') || f;
          const lastUpdated = metadata.lastUpdated;

          if (lastUpdated && !this.validateLastUpdated(lastUpdated)) {
            Logger.warn(`Memory file "${f}" has invalid lastUpdated date: ${lastUpdated}`);
          }
          if (this.isStale(lastUpdated)) {
            Logger.warn(`Memory file "${f}" is stale (last updated: ${lastUpdated || 'never'})`);
          }

          return { file: f, summary, lastUpdated };
        });
      return entries;
    } catch (e) {
      Logger.log(`list failed: ${e.message}`);
      return 'Error: tool use failed';
    }
  }

  read(file) {
    try {
      Logger.log(`Reading memory file: ${file}`);
      const filePath = path.join(this.memoryDir, file);
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf8');
      const { content: body, hasFrontmatter } = this.parseFrontmatter(content);
      if (!hasFrontmatter) {
        Logger.warn(`Memory file "${file}" is missing frontmatter — consider adding lastUpdated and summary fields`);
      }
      return body;
    } catch (e) {
      Logger.log(`read failed: ${e.message}`);
      return 'Error: tool use failed';
    }
  }

  write(file, content) {
    try {
      Logger.log(`Writing memory file: ${file}`);
      if (!content || !content.trim()) {
        throw new Error('Empty content');
      }
      const filePath = path.join(this.memoryDir, file);
      const timestamp = new Date().toISOString();
      const frontmatter = `---\nlastUpdated: ${timestamp}\n---\n`;
      fs.writeFileSync(filePath, frontmatter + content);
      this.createIndex();
    } catch (e) {
      Logger.log(`write failed: ${e.message}`);
      return 'Error: tool use failed';
    }
  }

  delete(file) {
    try {
      Logger.log(`Deleting memory file: ${file}`);
      const filePath = path.join(this.memoryDir, file);
      if (!fs.existsSync(filePath)) throw new Error('File not found');
      fs.unlinkSync(filePath);
      this.createIndex();
    } catch (e) {
      Logger.log(`delete failed: ${e.message}`);
      return 'Error: tool use failed';
    }
  }

  search(query) {
    try {
      Logger.log(`Searching memory for: ${query}`);
      const q = query.toLowerCase();
      const entries = this.list();
      if (entries === 'Error: tool use failed') return entries;
      return entries.filter(e => {
        const content = fs.readFileSync(path.join(this.memoryDir, e.file), 'utf8');
        return content.toLowerCase().includes(q);
      });
    } catch (e) {
      Logger.log(`search failed: ${e.message}`);
      return 'Error: tool use failed';
    }
  }
}

module.exports = Memory;