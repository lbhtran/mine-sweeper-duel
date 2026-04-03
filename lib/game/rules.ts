import { Match, PlayerState, GameResult } from "./types";
import {
  countProgress,
  countCorrectFlags,
  countWrongFlags,
  isCleared,
} from "./board";

/**
 * Evaluate H2H_TURN round outcome.
 *
 * Called at end of each round (after both players have taken their reveal),
 * or immediately when the board is collectively cleared or a player explodes.
 * Returns a GameResult.
 *
 * With cell locking enabled, the board is considered cleared when both players'
 * reveals combined cover all non-mine cells.  The winner in that case is the
 * player who personally revealed more safe cells (more progress).
 */
export function evaluateH2HTurnRound(
  mines: boolean[],
  p1: PlayerState,
  p2: PlayerState
): GameResult {
  // With cell locking, the board is cleared when both players together have
  // revealed all non-mine cells.
  const combinedRevealed = p1.revealed.map((r, i) => r || p2.revealed[i]);
  const boardCleared = isCleared(mines, combinedRevealed);

  // Board fully cleared and neither exploded → winner by progress
  if (boardCleared && !p1.exploded && !p2.exploded) {
    const prog1 = countProgress(mines, p1.revealed);
    const prog2 = countProgress(mines, p2.revealed);
    if (prog1 > prog2) return { outcome: "win", winner: 1 };
    if (prog2 > prog1) return { outcome: "win", winner: 2 };
    return { outcome: "draw" };
  }

  // Both exploded this round → tiebreakers
  if (p1.exploded && p2.exploded) {
    const prog1 = countProgress(mines, p1.revealed);
    const prog2 = countProgress(mines, p2.revealed);
    if (prog1 !== prog2) return { outcome: "win", winner: prog1 > prog2 ? 1 : 2 };

    const cf1 = countCorrectFlags(mines, p1.flagged);
    const cf2 = countCorrectFlags(mines, p2.flagged);
    if (cf1 !== cf2) return { outcome: "win", winner: cf1 > cf2 ? 1 : 2 };

    const wf1 = countWrongFlags(mines, p1.flagged);
    const wf2 = countWrongFlags(mines, p2.flagged);
    if (wf1 !== wf2) return { outcome: "win", winner: wf1 < wf2 ? 1 : 2 };

    return { outcome: "draw" };
  }

  // Exactly one exploded this round
  if (p1.exploded && !p2.exploded) return { outcome: "win", winner: 2 };
  if (p2.exploded && !p1.exploded) return { outcome: "win", winner: 1 };

  // Board cleared but one player exploded → survivor wins
  if (boardCleared && p1.exploded) return { outcome: "win", winner: 2 };
  if (boardCleared && p2.exploded) return { outcome: "win", winner: 1 };

  // Neither exploded, board not yet fully cleared → game continues
  return { outcome: "in_progress" };
}

/**
 * Evaluate ASYM_PLANT_CLEAR outcome.
 *
 * p1 clears p2's board (p2.mines), p2 clears p1's board (p1.mines).
 */
export function evaluateAsymResult(
  p1: PlayerState, // p1 is clearing p2's mines
  p2: PlayerState, // p2 is clearing p1's mines
  p2Mines: boolean[], // mines p2 planted (p1 must clear)
  p1Mines: boolean[] // mines p1 planted (p2 must clear)
): GameResult {
  const p1Cleared = p1.cleared;
  const p2Cleared = p2.cleared;

  // Neither exploded outcomes
  if (p1Cleared && p2Cleared) {
    // Both cleared: faster player wins
    if (!p1.cleared_at || !p2.cleared_at) return { outcome: "draw" };
    const t1 = new Date(p1.cleared_at).getTime();
    const t2 = new Date(p2.cleared_at).getTime();
    if (t1 < t2) return { outcome: "win", winner: 1 };
    if (t2 < t1) return { outcome: "win", winner: 2 };
    return { outcome: "draw" };
  }

  if (p1Cleared && !p1.exploded) return { outcome: "win", winner: 1 };
  if (p2Cleared && !p2.exploded) return { outcome: "win", winner: 2 };

  // Both exploded
  if (p1.exploded && p2.exploded) {
    // Identified mines = correctly flagged opponent mines
    const id1 = countCorrectFlags(p2Mines, p1.flagged);
    const id2 = countCorrectFlags(p1Mines, p2.flagged);
    if (id1 !== id2) return { outcome: "win", winner: id1 > id2 ? 1 : 2 };

    // Tiebreak: time-to-explosion
    if (p1.exploded_at && p2.exploded_at) {
      const t1 = new Date(p1.exploded_at).getTime();
      const t2 = new Date(p2.exploded_at).getTime();
      if (t1 < t2) return { outcome: "win", winner: 1 };
      if (t2 < t1) return { outcome: "win", winner: 2 };
    }
    return { outcome: "draw" };
  }

  // One exploded, one cleared
  if (p1.exploded && p2Cleared) return { outcome: "win", winner: 2 };
  if (p2.exploded && p1Cleared) return { outcome: "win", winner: 1 };

  // Game still in progress
  return { outcome: "in_progress" };
}

/**
 * Summarize the game outcome as a human-readable string for display.
 */
export function describeResult(
  result: GameResult,
  playerNum: number
): string {
  if (result.outcome === "in_progress") return "";
  if (result.outcome === "draw") return "It's a draw!";
  return result.winner === playerNum ? "You win! 🎉" : "You lose 💥";
}

export function isMatchFinished(match: Match): boolean {
  return match.status === "FINISHED";
}
