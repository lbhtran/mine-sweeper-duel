# Mine Sweeper Duel — Game Specification (MVP)

> Current date reference: 2026-04-03

This document defines the MVP rules and behavior for **Mine Sweeper Duel**, an online, two‑player Minesweeper game designed for easy deployment (e.g., Next.js on Vercel) with realtime multiplayer (e.g., Supabase).

The MVP includes two game modes:

- **H2H_TURN**: Turn-based head-to-head on the same seeded board.
- **ASYM_PLANT_CLEAR**: Asymmetric mode where each player plants mines on their own board, then clears the opponent's board simultaneously.

No skills/attacks are included in MVP.

---

## 1. Global Constants

- Board size: **9×9** (81 cells)
- Mine count: **10**
- Flag cap: **10 flags maximum placed at any moment**
- Indexing: a cell is identified by a single integer index `i` in `[0, 80]` where `i = y * 9 + x`.

---

## 2. Core Minesweeper Rules

These rules apply in all modes unless overridden.

### 2.1 Reveal

- A player may attempt to **reveal** a hidden cell.
- If the revealed cell contains a mine, the player **explodes immediately**.
  - **No first-click safety**: a mine click always explodes, even on the first reveal.
- If the revealed cell is safe:
  - Reveal it.
  - If its adjacent mine count is `0`, apply standard Minesweeper **flood fill** / cascade:
    - Reveal all connected zero cells and their bordering numbered cells.

### 2.2 Flags

- Flags are a **planning tool**.
- Flags can be **toggled on/off** (mark/unmark).
- A player may have at most **10 flags placed at any time**.
  - Placing a new flag when already at 10 is not allowed.
  - Unflagging is always allowed.
- Flags do not force gameplay behavior (e.g., flags do not block reveals unless the UI chooses to prevent it).

---

## 3. Mode: H2H_TURN (Turn-based Head-to-Head)

### 3.1 Overview

- Two players play on the **same truth board**.
- The truth board is generated deterministically from a server-provided seed and contains **10 mines**.
- Each player has their **own private** revealed/flagged state.

### 3.2 Turn Structure

- Players alternate turns.
- On a player's turn:
  1. They may **toggle flags** any number of times (subject to the 10-flag cap).
     - **Flags may only be toggled during the player's own turn.**
  2. They must commit exactly **one reveal action**.
     - The reveal may cascade (flood fill). The cascade is part of the single action.
  3. After the reveal resolves, the turn passes to the opponent.

### 3.3 Equal-Turn Fairness (Round Completion)

- The game winner is determined only when both players have taken the **same number of reveal actions**.
- Define a **round** as both players each completing one reveal action.
- If a player explodes on their reveal, the opponent still gets to take their reveal so that turns remain equal; then the game is resolved at the end of the round.

### 3.4 Win / Draw Conditions

Evaluation happens **only at end of round** (equal reveal counts).

1. **Exactly one player exploded** during the round → the non-exploded player wins.
2. **Both players exploded** during the round → apply tiebreakers (Section 3.5).
3. **Both players cleared** all non-mine cells at any time → **DRAW**.
4. If **one player cleared** and the other did not (and neither exploded), then at end of the round the clearer wins.

### 3.5 Tiebreakers (if both exploded in the same round)

Tiebreakers are applied in order. First difference decides.

1. **Progress (safe cells revealed):**
   - `progress = count(revealed[i] == true AND isMine(i) == false)`
   - Higher progress wins.
2. **Correct flags:**
   - `correctFlags = count(flagged[i] == true AND isMine(i) == true)`
   - Higher correctFlags wins.
3. **Wrong flags:**
   - `wrongFlags = count(flagged[i] == true AND isMine(i) == false)`
   - Lower wrongFlags wins.
4. If still tied → **DRAW**.

Notes:
- Although flags are private, they affect tiebreakers, so they must be stored server-side or otherwise verifiable.

---

## 4. Mode: ASYM_PLANT_CLEAR (Asymmetric Plant & Clear)

### 4.1 Overview

- Each player has their own 9×9 board.
- **Planting phase:** each player places mines on **their own** board.
- **Clearing phase:** each player clears the **opponent's** board.
- Clearing is **simultaneous** (not turn-based).

### 4.2 Planting Phase

- Duration: **30 seconds**.
- Each player may place **0 to 10 mines** on their own board.
  - Fewer mines gives the opponent an advantage.
- At the end of 30 seconds, mine placement is locked and the game transitions to clearing.

Special case:
- If a player plants **0 mines**, then the opponent's first safe reveal will naturally cascade to reveal the whole board (all zeros) under standard Minesweeper flood fill.

### 4.3 Clearing Phase

- Both players play simultaneously.
- Reveal rules follow core Minesweeper behavior (Section 2).

### 4.4 Win Conditions

Let `clearingStartedAt` be the time the clearing phase begins. Time is measured by wall clock.

Primary outcomes:

1. If one player clears all non-mine cells on the opponent board without exploding (and the opponent has not cleared yet) → that player wins.
2. If **both players clear** the opponent board → winner is the faster player (lower wall-clock duration from `clearingStartedAt` to `clearedAt`).
3. If one player clears and the other explodes → clearer wins.
4. If **both players explode**:
   - Winner is the player with higher **identified mines**.
   - If tied, winner is the faster player (time-to-explosion from `clearingStartedAt`).
   - If still tied, draw.

### 4.5 Identified Mines

In the both-exploded case, compute:

- `identifiedMines = count(flagged[i] == true AND isMine(i) == true)`

Where `isMine(i)` refers to mines on the **opponent board** the player was clearing.

Flags remain a planning tool (can be toggled freely during clearing), but are capped at 10.

---

## 5. Multiplayer / Matchmaking Constraints (MVP)

- Matches are joined by visiting a URL containing the match code (e.g., `/m/<CODE>`).
- Match is **locked to exactly 2 players**.
  - If 2 players have already joined, additional visitors cannot join (no spectators in MVP).

---

## 6. Non-Goals (MVP)

- No skills, attacks, powerups, or special items.
- No spectator mode.
- No first-click safety.
- No rating/ladder.
