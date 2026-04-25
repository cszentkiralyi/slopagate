import { countTokens } from '../utils/tokens.js'

/**
 * @typedef {Object} Message
 * @property {string} role - 'system', 'user', or 'model'
 * @property {string} content - message content
 * @property {string} [type] - optional type like 'tool_call' or 'tool_response'
 */

/**
 * @typedef {Object} Limits
 * @property {number} system_prompt - token budget for system prompt
 * @property {number} window - total context window limit
 * @property {number} tool_response - max tokens per tool response
 * @property {number} tool_age - max age in turns before tool call is pruned
 */

/**
 * @typedef {Object} Context
 */

export class Context {
  /**
   * @param {Object} opts
   * @param {string} [opts.system_prompt]
   * @param {number} [opts.limits.window]
   * @param {number} [opts.limits.system_prompt]
   * @param {number} [opts.limits.tool_response]
   * @param {number} [opts.limits.tool_age]
   */
  constructor(opts = {}) {
    this.system_prompt = opts.system_prompt || ''
    this.limits = {
      system_prompt: opts.limits?.system_prompt || 1000,
      window: opts.limits?.window || 128000,
      tool_response: opts.limits?.tool_response || 1000,
      tool_age: opts.limits?.tool_age || 10,
    }
    this.budgets = { generation: opts.budgets?.generation || 2000 }
    this.messages = opts.messages || []
    this.estimated_tokens = this._calculateTokens()
  }

  /**
   * Calculate estimated tokens for prompt + messages + budgets
   * @private
   */
  _calculateTokens() {
    let tokens = countTokens(this.system_prompt)
    for (const msg of this.messages) {
      tokens += countTokens(msg.content)
    }
    return tokens
  }

  /**
   * Add a message to context
   * @param {Message} message 
   */
  add(message) {
    this.messages.push(message)
    this.estimated_tokens = this._calculateTokens()
    return this
  }

  /**
   * Fork and apply compaction layers
   * @param {Array} layers - ['light'] or ['full'] or combination
   * @returns {Context} new Context instance with compaction applied
   */
  fork(layers) {
    const copy = new Context({
      system_prompt: this.system_prompt,
      limits: { ...this.limits },
      budgets: { ...this.budgets },
      messages: this.messages.map(m => ({ ...m })),
    })

    const lightLayers = ['tool_age', 'tool_redundancy', 'chat_importance']
    const fullLayers = ['system_prompt', 'tool_length', 'chat_summary']

    // Determine which layers to apply
    const layersToApply = layers.map(l => lightLayers.includes(l) ? l : l)

    // Always apply chat_importance in light mode
    layersToApply.push('chat_importance')

    // Apply each layer
    for (const layer of layersToApply) {
      copy[`${layer}()`] = copy[`_${layer}`]()
    }

    return copy
  }

  /**
   * Apply compaction destructively to self
   * @param {Array} layers - ['light'] or ['full']
   * @returns {Context} self
   */
  compact(layers) {
    const lightLayers = ['tool_age', 'tool_redundancy', 'chat_importance']
    const fullLayers = ['system_prompt', 'tool_length', 'chat_summary']

    const layersToApply = layers.includes('full')
      ? [...fullLayers, ...lightLayers]
      : lightLayers

    for (const layer of layersToApply) {
      this[`_${layer}`]()
    }

    this.estimated_tokens = this._calculateTokens()
    return this
  }

  /**
   * @template T
   * @param {T} fn 
   * @returns {T}
   * @private
   */
  _each(fn) {
    for (const msg of this.messages) {
      fn(msg)
    }
  }

  /**
   * Light compaction: tool_age, tool_redundancy, chat_importance
   */
  _tool_age() {
    const limit = this.limits.tool_age
    const turnCounts = new Map()

    // First pass: count turns per message
    this.messages.forEach(msg => {
      let turns = 0
      this._each(m => {
        if (m.role === 'user' && m.content && m.content.startsWith('turn ')) {
          turns = parseInt(m.content.split(' ')[1])
        }
      })
      turnCounts.set(msg.id || msg.type, turns)
    })

    // Second pass: remove messages older than limit turns
    // Need to reconstruct turn counts properly
    let turnCount = 0
    const messagesToRemove = new Set()
    this._each(msg => {
      if (msg.role === 'user') {
        const match = msg.content.match(/^turn (\d+)/)
        if (match) {
          turnCount = parseInt(match[1])
          if (turnCount < limit) {
            messagesToRemove.add(msg.id)
          }
        }
      }
    })

    // Remove tool calls with older turns
    this.messages = this.messages.filter(msg => {
      if (msg.role !== 'tool') return true
      const turnCount = msg.turn || 0
      return turnCount >= limit
    })

    return this
  }

  /**
   * Tool redundancy: remove tool calls that are subsets of later tool calls
   */
  _tool_redundancy() {
    // Group tool calls by type and keep track of the most recent for each file
    const toolStack = []
    const toRemove = new Set()

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i]

      if (msg.type === 'tool_response') {
        const content = msg.content

        // Check if this is a strict subset of a later response
        let redundant = false
        const startMatch = content.match(/^\[(?<start>\d+) lines \.\.\. (?<end>\d+ lines)\]$/)
        if (startMatch) {
          const { start: startLine, end: endLine } = startMatch.groups
          const endLine = parseInt(endLine)

          // Look for later response that contains this range
          for (let j = i + 1; j < this.messages.length; j++) {
            const later = this.messages[j]
            if (later.type === 'tool_response') {
              const laterContent = later.content
              const laterMatch = laterContent.match(/^\[(?<start>\d+) lines \.\.\. (?<end>\d+ lines)\]$/)
              if (laterMatch) {
                const { start: laterStart, end: laterEnd } = laterMatch.groups
                const laterStart = parseInt(laterStart)
                const laterEnd = parseInt(laterEnd)

                // Check if this range is a strict subset
                if (laterStart <= startLine && laterEnd >= endLine) {
                  redundant = true
                  break
                }
              }
            }
          }

          if (redundant) {
            toRemove.add(i)
          }
        }
      }
    }

    // Remove redundant messages
    for (const i of toRemove) {
      this.messages.splice(i, 1)
    }

    return this
  }

  /**
   * Chat importance: prune low-importance messages
   * Uses inverted bell curve: y = min(1, 1 - (0.9 * e^(-((x - 0.5)^2) / (2 * 0.25^2))))
   */
  _chat_importance() {
    const messagesToRemove = []
    const importanceFn = (x) => Math.min(1, 1 - (0.9 * Math.exp(-Math.pow((x - 0.5), 2) / (2 * 0.25 * 0.25))))

    // Calculate importance for each message based on recency
    // x is normalized position from 0 (oldest) to 1 (newest)
    for (let i = 0; i < this.messages.length; i++) {
      const x = i / Math.max(1, this.messages.length - 1)
      const importance = importanceFn(x)
      this.messages[i].importance = importance

      // Remove if importance below threshold (e.g., 0.2)
      if (importance < 0.2) {
        messagesToRemove.push(i)
      }
    }

    // Remove in reverse order to maintain indices
    for (const i of messagesToRemove.reverse()) {
      this.messages.splice(i, 1)
    }

    return this
  }

  /**
   * System prompt: compress if over limit
   */
  _system_prompt() {
    // Placeholder - implement compression if needed
    // For now, just return early if under limit
    if (this.system_prompt.length <= this.limits.system_prompt) {
      return this
    }
    // TODO: Implement compression logic

    return this
  }

  /**
   * Tool length: trim long responses
   */
  _tool_length() {
    for (const msg of this.messages) {
      if (msg.type === 'tool_response' && msg.content.length > this.limits.tool_response) {
        // Trim with ellipsis
        const mid = Math.floor(msg.content.length / 2)
        msg.content = msg.content.slice(0, mid) + ' [...] ' + msg.content.slice(-mid)
      }
    }
    return this
  }

  /**
   * Chat summary: convert old messages to LLM summary
   */
  _chat_summary() {
    const n = Math.max(5, Math.floor(this.messages.length * 0.2))

    const summaryRequest = this.messages.slice(0, this.messages.length - n).map(m => {
      return m.role === 'user' ? m : (m.role === 'model' ? m : {})
    }).map(m => {
      return typeof m === 'string' ? m : m.content
    }).join('\n')

    // In real impl, call requestSummary callback here
    // For now, just keep all messages
    return this
  }

  /**
   * Request summary callback
   * @param {string} transcript 
   * @returns {Promise<string>}
   */
  requestSummary(transcript) {
    return Promise.resolve(`[SUMMARY: ${transcript.substring(0, 50)}...]`)
  }
}class Context {
}