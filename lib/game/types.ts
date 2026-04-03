// Board constants
export const BOARD_SIZE = 9;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE; // 81
export const MINE_COUNT = 10;
export const FLAG_CAP = 10;

export type GameMode = "H2H_TURN" | "ASYM_PLANT_CLEAR";

export type MatchStatus =
  | "WAITING" // waiting for 2nd player
  | "PLANTING" // ASYM: players planting mines
  | "PLAYING" // game in progress
  | "FINISHED"; // game over

export interface Match {
  id: string;
  code: string;
  mode: GameMode;
  status: MatchStatus;
  seed: number | null; // for H2H_TURN board generation
  player1_id: string | null;
  player2_id: string | null;
  current_turn: number; // 1 or 2 (both modes during PLAYING)
  round: number; // completed rounds (H2H_TURN)
  planting_deadline: string | null; // ISO timestamp (unused — kept for schema compatibility)
  clearing_started_at: string | null; // ISO timestamp (ASYM)
  winner: number | null; // 1, 2, or 0 for draw
  created_at: string;
}

export interface PlayerState {
  id: string;
  match_id: string;
  player_num: number; // 1 or 2
  player_id: string | null;
  revealed: boolean[]; // length 81
  flagged: boolean[]; // length 81
  reveal_count: number;
  exploded: boolean;
  cleared: boolean;
  cleared_at: string | null;
  exploded_at: string | null;
  mines: boolean[] | null; // ASYM: mines this player planted on their own board
  ready: boolean; // ASYM planting: player has clicked ready
}

// Derived cell state for rendering
export type CellState =
  | { kind: "hidden" }
  | { kind: "flagged" }
  | { kind: "revealed"; adjacentMines: number }
  | { kind: "mine_exploded" }
  | { kind: "mine_revealed" }; // shown at game end

export interface BoardCell {
  index: number;
  x: number;
  y: number;
  isMine: boolean;
  adjacentMines: number;
  state: CellState;
}

export type GameResult =
  | { outcome: "in_progress" }
  | { outcome: "win"; winner: 1 | 2 }
  | { outcome: "draw" };
