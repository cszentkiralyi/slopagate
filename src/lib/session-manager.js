const fs = require('node:fs');
const path = require('node:path');

class SessionManager {
  static HISTORY_INDEX = path.join(process.env.HOME, '.slopagate', 'history.jsonl');
  static HISTORY_DIR = path.join(process.env.HOME, '.slopagate', 'history');

  // --- Index ---

  /**
   * List all sessions from the index file.
   * @returns {{id: string, created: string, modified: string}[]}
   */
  listSessions() {
    if (!fs.existsSync(SessionManager.HISTORY_INDEX)) {
      return [];
    }

    const lines = fs.readFileSync(SessionManager.HISTORY_INDEX, 'utf-8').trim().split('\n');
    return lines
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }

  /**
   * Append a session record to the index.
   */
  #appendIndex(session) {
    fs.mkdirSync(path.dirname(SessionManager.HISTORY_INDEX), { recursive: true });
    fs.appendFileSync(SessionManager.HISTORY_INDEX, JSON.stringify(session) + '\n');
  }

  /**
   * Update a session's modified timestamp in the index.
   */
  #updateIndex(session) {
    if (!fs.existsSync(SessionManager.HISTORY_INDEX)) return;

    const lines = fs.readFileSync(SessionManager.HISTORY_INDEX, 'utf-8').trim().split('\n');
    const updated = lines.map(line => {
      const entry = JSON.parse(line);
      if (entry.id === session.id) {
        return { ...entry, modified: new Date().toISOString() };
      }
      return line;
    });

    fs.writeFileSync(SessionManager.HISTORY_INDEX, updated.join('\n') + '\n');
  }

  // --- Session persistence ---

  /**
   * Save a session to disk.
   * @param {Session} session - The session to save
   * @param {boolean} isNew - Whether this is a new session (creates index entry)
   */
  saveSession(session, isNew = true) {
    // Ensure history directory exists
    fs.mkdirSync(SessionManager.HISTORY_DIR, { recursive: true });

    // Write all messages as JSONL
    const messages = session.history.map(m => JSON.stringify(m));

    fs.writeFileSync(
      path.join(SessionManager.HISTORY_DIR, `${session.id}.jsonl`),
      messages.join('\n')
    );

    // Index entry
    const indexEntry = {
      id: session.id,
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    };

    if (isNew) {
      this.#appendIndex(indexEntry);
    } else {
      this.#updateIndex(indexEntry);
    }
  }

  /**
   * Read messages for a session from disk.
   * @param {string} id
   * @returns {{role: string, content: string}[]}
   */
  readSession(id) {
    const filePath = path.join(SessionManager.HISTORY_DIR, `${id}.jsonl`);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    return lines
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }

  /**
   * Load messages for a session from disk.
   * @param {string} id
   * @returns {{role: string, content: string}[]}
   */
  loadSession(id) {
    return this.readSession(id);
  }

  /**
   * Delete a session and its index entry.
   * @param {string} id
   */
  deleteSession(id) {
    // Remove messages file
    const filePath = path.join(SessionManager.HISTORY_DIR, `${id}.jsonl`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from index
    if (fs.existsSync(SessionManager.HISTORY_INDEX)) {
      const lines = fs.readFileSync(SessionManager.HISTORY_INDEX, 'utf-8').trim().split('\n');
      const filtered = lines.filter(line => {
        const entry = JSON.parse(line);
        return entry.id !== id;
      });
      fs.writeFileSync(SessionManager.HISTORY_INDEX, filtered.join('\n') + '\n');
    }
  }

  /**
   * Clean up old sessions.
   * @param {Object} options
   * @param {number} options.maxAge - Maximum age in days (default: 7)
   * @param {number} options.maxCount - Maximum number of sessions to keep (default: 20)
   */
  cleanup({ maxAge = 7, maxCount = 20 } = {}) {
    const sessions = this.listSessions();
    if (sessions.length === 0) return;

    const now = Date.now();
    const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;

    // Delete sessions older than maxAge
    const toDelete = sessions.filter(s => {
      const age = now - new Date(s.modified).getTime();
      return age > maxAgeMs;
    });

    for (const session of toDelete) {
      this.deleteSession(session.id);
    }

    // If still over maxCount, delete oldest
    const remaining = this.listSessions();
    if (remaining.length > maxCount) {
      const sorted = remaining.sort((a, b) => new Date(b.modified) - new Date(a.modified));
      const excess = sorted.slice(maxCount);

      for (const session of excess) {
        this.deleteSession(session.id);
      }
    }
  }
}

module.exports = SessionManager;
