const { Logger, louse } = require('../../util.js');

/**
 * Group messages into turns per PLAN.md step 1.
 * From oldest-to-newest: consecutive user messages start a turn; gather until
 * next user message and add to that turn. Next user message(s) begin the next turn.
 */
function groupIntoTurns(messages) {
  const turns = [];
  let currentTurn = null;

  for (const msg of messages) {
    if (msg.role === 'user') {
      // A new user message after assistant responses starts a new turn;
      // otherwise it continues the current turn (consecutive users).
      if (!currentTurn || currentTurn.assistantMessages.length > 0) {
        currentTurn = { userMessages: [], assistantMessages: [] };
        turns.push(currentTurn);
      }
      currentTurn.userMessages.push(msg);
    } else if (msg.role === 'assistant' || msg.role === 'tool') {
      if (!currentTurn) continue;
      currentTurn.assistantMessages.push(msg);
    }
  }

  return turns;
}

/**
 * Score a turn using v1's formula: louse(recency) with decay for older turns.
 * All messages in a turn share the same position, so we compute one score per turn.
 */
function scoreTurn(turn, allTurns, globalIndex) {
  const normalizedPos = globalIndex / allTurns.length;
  const baseScore = louse(normalizedPos);

  // Penalize older turns (position <= 0.5) using the same decay as v1:
  //   g(x, t) = x > 0.5 ? f(x) : Math.max((1 - t/T) * f(x), 0)
  if (normalizedPos <= 0.5) {
    return Math.max(baseScore * (1 - normalizedPos), 0);
  }

  return baseScore;
}

/**
 * Collapse adjacent user messages into one synthetic message (PLAN.md step 5).
 */
function collapseUserMessages(turn) {
  if (turn.userMessages.length <= 1) return turn.userMessages[0];

  const collapsedContent = turn.userMessages.map(m => m.content).join('\n\n');
  const collapsedTokenCount = turn.userMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);

  return {
    role: 'user',
    content: collapsedContent,
    tokenCount: collapsedTokenCount,
    _collapsed: true
  };
}

/**
 * chat_score compaction layer - v2.0 (per PLAN.md)
 */
const chat_score = ({ messages, config, context_window, budget }) => {
  if (!messages || !messages.length) return { messages: [] };

  const targetSaturation = budget.target_saturation || config.saturation || 0.55;

  // Step 1: Group into turns (oldest-to-newest)
  const turns = groupIntoTurns(messages);

  // Step 2: Score each turn; sort descending by score for selection
  const scoredTurns = turns.map((turn, index) => ({
    turn,
    score: scoreTurn(turn, turns.length, index)
  })).sort((a, b) => b.score - a.score);

  // Find trailing user-only turn (no assistant response) — preserve at end per PLAN.md
  let trailingUserTurn = null;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].assistantMessages.length === 0) {
      trailingUserTurn = turns[i];
      break;
    }
  }

  // Step 3: Select stubs greedily from highest-scoring turns.
  // Stub budget is 10% of the available layer budget; only user message tokens count against it.
  const stubBudget = budget.available * 0.1;
  const selectedStubs = [];
  let usedStubBudget = 0;

  for (const { turn } of scoredTurns) {
    if (turn === trailingUserTurn || turn.assistantMessages.length === 0) continue;
    const userTokenCost = turn.userMessages.reduce(
      (sum, m) => sum + (m.tokenCount || 0), 0
    );
    if (usedStubBudget + userTokenCost <= stubBudget) {
      selectedStubs.push({ turn, isStub: true });
      usedStubBudget += userTokenCost;
    } else {
      break;
    }
  }

  // Step 4: Iterate newest-to-oldest to assemble final list.
  // Budget B = available - usedStubBudget; remaining capacity after all stubs.
  const b = Math.max(0, budget.available - usedStubBudget);
  let budgetLeft = b;
  const resultMessages = [];

  // Process selected stubs newest-to-oldest (reverse of selection order since
  // scoredTurns was descending and we appended in that order)
  for (const { turn } of [...selectedStubs].reverse()) {
    const collapsedUserMsg = collapseUserMessages(turn);
    resultMessages.push(collapsedUserMsg);

    // Cost of the "rest" of the turn (non-user content) — PLAN.md step 4.ii
    const restCost = turn.assistantMessages.reduce(
      (sum, m) => sum + (m.tokenCount || 0), 0
    );

    if (restCost <= budgetLeft) {
      // Inflate: add full assistant/tool messages and subtract from B
      for (const am of turn.assistantMessages) {
        resultMessages.push(am);
      }
      budgetLeft -= restCost;
    }
  }

  // Append trailing user-only turn at the end if it exists
  if (trailingUserTurn) {
    const collapsedUserMsg = collapseUserMessages(trailingUserTurn);
    if (collapsedUserMsg) {
      resultMessages.push(collapsedUserMsg);
    }
  }

  Logger.log(`chat_score: threshold=${config.threshold}, ${messages.length} messages -> ${resultMessages.length}`);

  return { messages: resultMessages };
};

module.exports = chat_score;