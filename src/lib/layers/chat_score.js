const { Logger, lerp, louse } = require('../../util.js');

/**
 * Group messages into turns for scoring.
 * A turn consists of user message(s) + assistant responses/tool calls.
 * Each new user message after an assistant response starts a new turn.
 */
function groupIntoTurns(messages) {
  const turns = [];
  let currentTurn = null;

  for (const msg of messages) {
    if (msg.role === 'user') {
      // If we already have assistant responses in the current turn,
      // start a new turn for this user message
      if (currentTurn && currentTurn.assistantMessages.length > 0) {
        currentTurn = { userMessages: [], assistantMessages: [] };
        turns.push(currentTurn);
      } else if (!currentTurn) {
        // First user message ever
        currentTurn = { userMessages: [], assistantMessages: [] };
        turns.push(currentTurn);
      }
      // If currentTurn exists but has no assistant messages, keep adding to it (consecutive user messages)
      if (!currentTurn) {
        currentTurn = { userMessages: [], assistantMessages: [] };
        turns.push(currentTurn);
      }
      currentTurn.userMessages.push(msg);
    } else if (msg.role === 'assistant' || msg.role === 'tool') {
      // Add assistant/tool messages to the current turn
      if (!currentTurn) continue;
      currentTurn.assistantMessages.push(msg);
    }
  }

  return turns;
}

/**
 * Score a single message based on importance and recency.
 */
function scoreMessage(msg, totalMessages, index) {
  const baseImportance = msg.importance || 0;
  const recencyFactor = (index / totalMessages); // Newer messages (higher index) get higher scores
  return baseImportance * 0.7 + recencyFactor * 0.3;
}

/**
 * Score a turn based on the highest-scoring message in it.
 */
function scoreTurn(turn, index, totalTurns) {
  const allMessages = [...turn.userMessages, ...turn.assistantMessages];
  let maxScore = 0;

  for (const msg of allMessages) {
    const msgScore = scoreMessage(msg, totalTurns * 2, index); // Approximate position
    if (msgScore > maxScore) {
      maxScore = msgScore;
    }
  }

  return maxScore;
}

/**
 * Inflate the budget across selected turns from newest to oldest.
 */
function inflateBudget(selectedTurns, remainingBudget, totalBudget) {
  let currentBudget = remainingBudget;

  // Sort turns newest-to-oldest for inflation
  const sortedTurns = [...selectedTurns].reverse();

  for (const turn of sortedTurns) {
    const turnSize = turn.userMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0) +
                     turn.assistantMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);

    // Allocate a proportional share of the remaining budget
    const allocation = Math.min(turnSize, currentBudget * 0.1); // Up to 10% of remaining per turn
    turn.budgetAllocation = allocation;
    currentBudget -= allocation;
  }

  return selectedTurns;
}

/**
 * Collapse adjacent user messages into synthetic messages.
 */
function collapseUserMessages(turn) {
  if (turn.userMessages.length <= 1) return turn.userMessages[0];

  const collapsedContent = turn.userMessages.map(m => m.content).join('\n\n');
  const collapsedTokenCount = turn.userMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);

  return {
    role: 'user',
    content: collapsedContent,
    tokenCount: collapsedTokenCount,
    _collapsed: true // Mark as synthetic for debugging
  };
}

/**
 * chat_score compaction layer - v2.0
 */
const chat_score = ({ messages, config, context_window, budget }) => {
  if (!messages || !messages.length) return { messages: [] };

  // Calculate target saturation percentage
  const targetSaturation = budget.target_saturation || config.saturation || 0.55;

  // Group messages into turns
  const turns = groupIntoTurns(messages);

  // Score each turn
  const scoredTurns = turns.map((turn, index) => ({
    turn,
    score: scoreTurn(turn, index, turns.length)
  })).sort((a, b) => b.score - a.score); // Sort by score descending (newest first)

  // Identify the trailing user-only turn from original conversation order (last one with no assistant response)
  let trailingUserTurn = null;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].assistantMessages.length === 0) {
      trailingUserTurn = turns[i];
      break;
    }
  }

  // Separate stub turns (with assistant responses) from trailing user-only turns
  const stubTurns = [];
  for (const st of scoredTurns) {
    if (trailingUserTurn && st.turn === trailingUserTurn) continue; // skip trailing turn
    if (st.turn.assistantMessages.length > 0) {
      stubTurns.push(st);
    }
  }

  // Select stubs within 10% budget from highest-scoring turns
  const selectedStubs = [];
  let usedBudget = 0;
  const budgetThreshold = context_window * targetSaturation * 0.1; // 10% of available budget

  for (const scoredStub of stubTurns) {
    const turnSize = scoredStub.turn.userMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0) +
                     scoredStub.turn.assistantMessages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);

    if (usedBudget + turnSize <= budgetThreshold) {
      selectedStubs.push(scoredStub.turn);
      usedBudget += turnSize;
    } else {
      break; // Stop when we exceed the threshold
    }
  }

  // Inflate remaining budget across selected stubs newest-to-oldest
  inflateBudget(selectedStubs, budget.available - usedBudget, budget.available);

  // Build final message list: selected stubs in score order (newest first), then trailing user turn
  const resultMessages = [];
  for (const turn of selectedStubs) {
    const collapsedUserMsg = collapseUserMessages(turn);
    if (collapsedUserMsg) {
      resultMessages.push(collapsedUserMsg);
    }
    for (const am of turn.assistantMessages) {
      resultMessages.push(am);
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