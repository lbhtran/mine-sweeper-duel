import { BOARD_SIZE, CELL_COUNT, MINE_COUNT } from "./types";

/**
 * Mulberry32 seeded PRNG — returns a float in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Generate mines array from seed (H2H_TURN shared board).
 * Returns boolean[81] where true = mine.
 */
export function generateMinesFromSeed(seed: number): boolean[] {
  const rng = mulberry32(seed);
  const mines = new Array<boolean>(CELL_COUNT).fill(false);
  const indices = Array.from({ length: CELL_COUNT }, (_, i) => i);

  // Fisher–Yates partial shuffle — swap only the last MINE_COUNT positions
  for (let i = indices.length - 1; i >= indices.length - MINE_COUNT; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  for (let i = 0; i < MINE_COUNT; i++) {
    mines[indices[CELL_COUNT - 1 - i]] = true;
  }

  return mines;
}

/**
 * Get the (x, y) coordinates of cell index i.
 */
export function indexToXY(i: number): { x: number; y: number } {
  return { x: i % BOARD_SIZE, y: Math.floor(i / BOARD_SIZE) };
}

/**
 * Get the cell index from (x, y) coordinates.
 */
export function xyToIndex(x: number, y: number): number {
  return y * BOARD_SIZE + x;
}

/**
 * Get the indices of all valid neighbors of cell i.
 */
export function getNeighbors(i: number): number[] {
  const { x, y } = indexToXY(i);
  const neighbors: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        neighbors.push(xyToIndex(nx, ny));
      }
    }
  }
  return neighbors;
}

/**
 * Compute adjacent mine counts for all cells.
 */
export function computeAdjacentCounts(mines: boolean[]): number[] {
  const counts = new Array<number>(CELL_COUNT).fill(0);
  for (let i = 0; i < CELL_COUNT; i++) {
    if (mines[i]) continue;
    counts[i] = getNeighbors(i).filter((n) => mines[n]).length;
  }
  return counts;
}

/**
 * Perform a reveal action on cell `target`.
 * Returns:
 *   - `exploded: true` if the cell is a mine
 *   - `newRevealed` array (copy of revealed with newly revealed cells set to true)
 * Does NOT mutate inputs.
 *
 * @param opponentRevealed - Optional array of cells already claimed by the opponent.
 *   When provided (H2H_TURN mode), flood-fill cascades will not enter opponent-claimed
 *   cells, enforcing the rule that each tile may only be cleared by one player.
 */
export function reveal(
  target: number,
  mines: boolean[],
  adjacentCounts: number[],
  revealed: boolean[],
  opponentRevealed?: boolean[]
): { exploded: boolean; newRevealed: boolean[] } {
  // If already revealed, no-op
  if (revealed[target]) {
    return { exploded: false, newRevealed: revealed.slice() };
  }

  // Mine hit
  if (mines[target]) {
    const newRevealed = revealed.slice();
    newRevealed[target] = true;
    return { exploded: true, newRevealed };
  }

  // Safe reveal with flood fill
  const newRevealed = revealed.slice();
  const queue: number[] = [target];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Skip cells already claimed by the opponent (cell locking for H2H_TURN)
    if (opponentRevealed?.[current]) continue;

    if (!newRevealed[current] && !mines[current]) {
      newRevealed[current] = true;
      if (adjacentCounts[current] === 0) {
        // Cascade to all neighbors
        for (const n of getNeighbors(current)) {
          if (!visited.has(n) && !newRevealed[n]) {
            queue.push(n);
          }
        }
      }
    }
  }

  return { exploded: false, newRevealed };
}

/**
 * Toggle a flag on cell `target`.
 * Returns new flagged array or null if the action is not allowed
 * (e.g., trying to add a flag when at FLAG_CAP or on a revealed cell).
 */
export function toggleFlag(
  target: number,
  revealed: boolean[],
  flagged: boolean[],
  flagCap: number
): boolean[] | null {
  // Cannot flag a revealed cell
  if (revealed[target]) return null;

  const newFlagged = flagged.slice();

  if (newFlagged[target]) {
    // Unflagging is always allowed
    newFlagged[target] = false;
    return newFlagged;
  }

  // Placing a new flag — check cap
  const currentFlags = newFlagged.filter(Boolean).length;
  if (currentFlags >= flagCap) return null;

  newFlagged[target] = true;
  return newFlagged;
}

/**
 * Check if all non-mine cells have been revealed (board cleared).
 */
export function isCleared(mines: boolean[], revealed: boolean[]): boolean {
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!mines[i] && !revealed[i]) return false;
  }
  return true;
}

/**
 * Count revealed safe cells (progress metric).
 */
export function countProgress(mines: boolean[], revealed: boolean[]): number {
  let count = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!mines[i] && revealed[i]) count++;
  }
  return count;
}

/**
 * Count correctly flagged mines.
 */
export function countCorrectFlags(mines: boolean[], flagged: boolean[]): number {
  let count = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (mines[i] && flagged[i]) count++;
  }
  return count;
}

/**
 * Count incorrectly placed flags.
 */
export function countWrongFlags(mines: boolean[], flagged: boolean[]): number {
  let count = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!mines[i] && flagged[i]) count++;
  }
  return count;
}

/**
 * Generate a random 6-character alphanumeric match code.
 */
export function generateMatchCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
