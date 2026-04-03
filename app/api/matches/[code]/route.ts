import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  generateMinesFromSeed,
  computeAdjacentCounts,
  reveal,
  toggleFlag,
  isCleared,
} from "@/lib/game/board";
import { evaluateH2HTurnRound, evaluateAsymResult } from "@/lib/game/rules";
import { CELL_COUNT, FLAG_CAP, MINE_COUNT, type PlayerState } from "@/lib/game/types";

type Params = { params: Promise<{ code: string }> };

/** Merge a raw DB row with a partial state update into a typed PlayerState. */
function mergeState(
  base: PlayerState,
  patch: Partial<PlayerState>
): PlayerState {
  return { ...base, ...patch };
}
/**
 * GET /api/matches/[code]
 * Returns match + both player states (without opponent mines in ASYM planting phase)
 */
export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const supabase = createServerClient();

  const { data: match, error } = await supabase
    .from("matches")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const { data: playerStates } = await supabase
    .from("player_states")
    .select("*")
    .eq("match_id", match.id)
    .order("player_num");

  return NextResponse.json({ match, playerStates: playerStates ?? [] });
}

/**
 * POST /api/matches/[code]/join
 * Body: { playerId: string }
 */
export async function POST(request: Request, { params }: Params) {
  const { code } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.playerId) {
    return NextResponse.json({ error: "playerId is required" }, { status: 400 });
  }

  const { playerId } = body as { playerId: string };
  const supabase = createServerClient();

  const { data: match, error } = await supabase
    .from("matches")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (match.status !== "WAITING") {
    return NextResponse.json(
      { error: "Match is not accepting players" },
      { status: 409 }
    );
  }

  if (match.player1_id === playerId) {
    // Rejoining as player 1 — return existing state
    const { data: ps } = await supabase
      .from("player_states")
      .select("*")
      .eq("match_id", match.id)
      .eq("player_num", 1)
      .single();
    return NextResponse.json({ match, playerState: ps, playerNum: 1 });
  }

  if (match.player2_id) {
    return NextResponse.json({ error: "Match is full" }, { status: 409 });
  }

  // Transition to PLAYING (H2H_TURN) or PLANTING (ASYM)
  const newStatus = match.mode === "ASYM_PLANT_CLEAR" ? "PLANTING" : "PLAYING";

  const { data: updatedMatch } = await supabase
    .from("matches")
    .update({ player2_id: playerId, status: newStatus, planting_deadline: null })
    .eq("id", match.id)
    .select()
    .single();

  const { data: playerState } = await supabase
    .from("player_states")
    .insert({
      match_id: match.id,
      player_num: 2,
      player_id: playerId,
      revealed: new Array(CELL_COUNT).fill(false),
      flagged: new Array(CELL_COUNT).fill(false),
      reveal_count: 0,
      exploded: false,
      cleared: false,
      cleared_at: null,
      exploded_at: null,
      mines:
        match.mode === "ASYM_PLANT_CLEAR" ? new Array(CELL_COUNT).fill(false) : null,
    })
    .select()
    .single();

  return NextResponse.json({
    match: updatedMatch,
    playerState,
    playerNum: 2,
  });
}

/**
 * PATCH /api/matches/[code]
 * Body: { action: "reveal" | "flag" | "plant"; playerNum: 1 | 2; cellIndex: number }
 *
 * plant: toggle a mine during ASYM planting phase
 * flag:  toggle a flag marker
 * reveal: reveal a cell
 */
export async function PATCH(request: Request, { params }: Params) {
  const { code } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { action, playerNum, cellIndex } = body as {
    action: "reveal" | "flag" | "plant" | "ready";
    playerNum: 1 | 2;
    cellIndex: number;
  };

  if (
    !["reveal", "flag", "plant", "ready"].includes(action) ||
    ![1, 2].includes(playerNum)
  ) {
    return NextResponse.json({ error: "Invalid action params" }, { status: 400 });
  }

  // Cell-based actions require a valid cellIndex
  if (action !== "ready") {
    if (
      typeof cellIndex !== "number" ||
      cellIndex < 0 ||
      cellIndex >= CELL_COUNT
    ) {
      return NextResponse.json({ error: "Invalid cellIndex" }, { status: 400 });
    }
  }

  const supabase = createServerClient();

  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (matchErr || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (match.status === "WAITING" || match.status === "FINISHED") {
    return NextResponse.json({ error: "Action not allowed in current status" }, { status: 409 });
  }

  const { data: states } = await supabase
    .from("player_states")
    .select("*")
    .eq("match_id", match.id)
    .order("player_num");

  const myState = states?.find((s) => s.player_num === playerNum);
  if (!myState) {
    return NextResponse.json({ error: "Player state not found" }, { status: 404 });
  }

  // ──────── PLANT (ASYM planting phase) ────────
  if (action === "plant") {
    if (match.status !== "PLANTING") {
      return NextResponse.json(
        { error: "Not in planting phase" },
        { status: 409 }
      );
    }

    // Cannot change mines after clicking ready
    if (myState.ready) {
      return NextResponse.json(
        { error: "Already readied — mine layout is locked" },
        { status: 409 }
      );
    }

    const mines = [...(myState.mines as boolean[])];
    const currentMineCount = mines.filter(Boolean).length;

    if (mines[cellIndex]) {
      // Remove mine
      mines[cellIndex] = false;
    } else {
      // Add mine
      if (currentMineCount >= MINE_COUNT) {
        return NextResponse.json(
          { error: "Mine cap reached" },
          { status: 409 }
        );
      }
      mines[cellIndex] = true;
    }

    const { data: updated } = await supabase
      .from("player_states")
      .update({ mines })
      .eq("id", myState.id)
      .select()
      .single();

    return NextResponse.json({ playerState: updated });
  }

  // ──────── READY (ASYM: lock mines and signal ready to start) ────────
  if (action === "ready") {
    if (match.status !== "PLANTING") {
      return NextResponse.json(
        { error: "Not in planting phase" },
        { status: 409 }
      );
    }

    if (myState.ready) {
      return NextResponse.json({ error: "Already ready" }, { status: 409 });
    }

    const mines = (myState.mines as boolean[]) ?? new Array(CELL_COUNT).fill(false);
    const mineCount = mines.filter(Boolean).length;

    if (mineCount !== MINE_COUNT) {
      return NextResponse.json(
        { error: `Must place exactly ${MINE_COUNT} mines before readying` },
        { status: 409 }
      );
    }

    // Mark this player as ready
    const { data: updatedState } = await supabase
      .from("player_states")
      .update({ ready: true })
      .eq("id", myState.id)
      .select()
      .single();

    // Re-fetch opponent state to check if both are now ready
    const opponentNum = playerNum === 1 ? 2 : 1;
    const { data: freshStates } = await supabase
      .from("player_states")
      .select("*")
      .eq("match_id", match.id)
      .order("player_num");

    const opponentState = freshStates?.find((s) => s.player_num === opponentNum);

    if (opponentState?.ready) {
      // Both players ready — start the clearing phase
      await supabase
        .from("matches")
        .update({ status: "PLAYING", current_turn: 1 })
        .eq("id", match.id);
    }

    return NextResponse.json({ playerState: updatedState });
  }

  // ──────── FLAG ────────
  if (action === "flag") {
    // Flags may only be toggled on the player's own turn (both modes)
    if (match.current_turn !== playerNum) {
      return NextResponse.json({ error: "Not your turn" }, { status: 409 });
    }
    if (match.status !== "PLAYING") {
      return NextResponse.json({ error: "Game not active" }, { status: 409 });
    }

    // H2H_TURN: cannot flag a cell already revealed by the opponent
    if (match.mode === "H2H_TURN") {
      const opponentNum = playerNum === 1 ? 2 : 1;
      const opponentState = states?.find((s) => s.player_num === opponentNum);
      if (opponentState && (opponentState.revealed as boolean[])[cellIndex]) {
        return NextResponse.json(
          { error: "Cell already revealed by opponent" },
          { status: 409 }
        );
      }
    }

    const newFlagged = toggleFlag(
      cellIndex,
      myState.revealed as boolean[],
      myState.flagged as boolean[],
      FLAG_CAP
    );
    if (!newFlagged) {
      return NextResponse.json(
        { error: "Cannot flag this cell (revealed or cap reached)" },
        { status: 409 }
      );
    }

    const { data: updated } = await supabase
      .from("player_states")
      .update({ flagged: newFlagged })
      .eq("id", myState.id)
      .select()
      .single();

    return NextResponse.json({ playerState: updated });
  }

  // ──────── REVEAL ────────
  if (action === "reveal") {
    if (match.status !== "PLAYING") {
      return NextResponse.json({ error: "Game not active" }, { status: 409 });
    }

    // H2H_TURN and ASYM_PLANT_CLEAR: only the current player can reveal
    if (match.current_turn !== playerNum) {
      return NextResponse.json({ error: "Not your turn" }, { status: 409 });
    }

    // Cannot reveal if already exploded/cleared
    if (myState.exploded || myState.cleared) {
      return NextResponse.json(
        { error: "Player is already done" },
        { status: 409 }
      );
    }

    // Determine the mine layout
    let mines: boolean[];
    if (match.mode === "H2H_TURN") {
      if (!match.seed) {
        return NextResponse.json({ error: "No board seed" }, { status: 500 });
      }
      mines = generateMinesFromSeed(match.seed);
    } else {
      // ASYM: revealing opponent's board → opponent's mines
      const opponentNum = playerNum === 1 ? 2 : 1;
      const opponentState = states?.find((s) => s.player_num === opponentNum);
      if (!opponentState?.mines) {
        return NextResponse.json(
          { error: "Opponent mines not set" },
          { status: 409 }
        );
      }
      mines = opponentState.mines as boolean[];
    }

    // H2H_TURN: enforce cell locking — each tile may only be revealed by one player
    let opponentRevealedForH2H: boolean[] | undefined;
    if (match.mode === "H2H_TURN") {
      const opponentNum = playerNum === 1 ? 2 : 1;
      const opponentState = states?.find((s) => s.player_num === opponentNum);
      if (opponentState) {
        opponentRevealedForH2H = opponentState.revealed as boolean[];
        if (opponentRevealedForH2H[cellIndex]) {
          return NextResponse.json(
            { error: "Cell already revealed by opponent" },
            { status: 409 }
          );
        }
      }
    }

    const adjacentCounts = computeAdjacentCounts(mines);
    const { exploded, newRevealed } = reveal(
      cellIndex,
      mines,
      adjacentCounts,
      myState.revealed as boolean[],
      opponentRevealedForH2H
    );

    const newRevealCount = myState.reveal_count + 1;

    // H2H_TURN: board is cleared when both players together cover all non-mine cells
    let cleared: boolean;
    if (match.mode === "H2H_TURN" && opponentRevealedForH2H) {
      const combinedRevealed = newRevealed.map(
        (r, i) => r || opponentRevealedForH2H![i]
      );
      cleared = !exploded && isCleared(mines, combinedRevealed);
    } else {
      cleared = !exploded && isCleared(mines, newRevealed);
    }

    const now = new Date().toISOString();

    const stateUpdate: Record<string, unknown> = {
      revealed: newRevealed,
      reveal_count: newRevealCount,
      exploded,
      cleared,
      exploded_at: exploded ? now : myState.exploded_at,
      cleared_at: cleared ? now : myState.cleared_at,
    };

    const { data: updatedMyState } = await supabase
      .from("player_states")
      .update(stateUpdate)
      .eq("id", myState.id)
      .select()
      .single();

    // ── H2H_TURN: advance turn / check round end ──
    if (match.mode === "H2H_TURN") {
      const opponentNum = playerNum === 1 ? 2 : 1;
      const opponentState = states?.find((s) => s.player_num === opponentNum);

      const newRound = match.round;
      const bothPlayed = opponentState
        ? opponentState.reveal_count >= newRevealCount
        : false;

      let matchUpdate: Record<string, unknown> = {
        current_turn: opponentNum,
      };

      // Evaluate immediately when board is collectively cleared or when
      // both players have taken the same number of turns (end of round).
      const shouldEvaluate = cleared || bothPlayed;

      if (shouldEvaluate) {
        const updatedMyStateForEval = mergeState(myState as PlayerState, {
          revealed: newRevealed,
          reveal_count: newRevealCount,
          exploded,
          cleared,
          exploded_at: exploded ? now : (myState.exploded_at as string | null),
          cleared_at: cleared ? now : (myState.cleared_at as string | null),
        });

        const roundResult = evaluateH2HTurnRound(
          mines,
          playerNum === 1 ? updatedMyStateForEval : (opponentState as PlayerState),
          playerNum === 2 ? updatedMyStateForEval : (opponentState as PlayerState)
        );

        if (roundResult.outcome !== "in_progress") {
          matchUpdate = {
            ...matchUpdate,
            status: "FINISHED",
            round: newRound + 1,
            winner:
              roundResult.outcome === "draw" ? 0 : roundResult.winner,
          };
        } else if (bothPlayed) {
          matchUpdate = { ...matchUpdate, round: newRound + 1 };
        }
      }

      await supabase.from("matches").update(matchUpdate).eq("id", match.id);
    }

    // ── ASYM: handle turns and check if both done ──
    if (match.mode === "ASYM_PLANT_CLEAR") {
      const opponentNum = playerNum === 1 ? 2 : 1;
      const opponentState = states?.find((s) => s.player_num === opponentNum);
      const opponentDone = opponentState && (opponentState.exploded || opponentState.cleared);
      const currentDone = exploded || cleared;

      if (currentDone && opponentDone) {
        // Both done — evaluate
        const updatedMyStateForEval = mergeState(myState as PlayerState, {
          revealed: newRevealed,
          reveal_count: newRevealCount,
          exploded,
          cleared,
          exploded_at: exploded ? now : (myState.exploded_at as string | null),
          cleared_at: cleared ? now : (myState.cleared_at as string | null),
        });

        const p1State =
          playerNum === 1 ? updatedMyStateForEval : (opponentState as PlayerState);
        const p2State =
          playerNum === 2 ? updatedMyStateForEval : (opponentState as PlayerState);

        const p1Mines = (states?.find((s) => s.player_num === 1)?.mines ??
          []) as boolean[];
        const p2Mines = (states?.find((s) => s.player_num === 2)?.mines ??
          []) as boolean[];

        const result = evaluateAsymResult(p1State, p2State, p2Mines, p1Mines);

        await supabase.from("matches").update({
          status: "FINISHED",
          winner: result.outcome === "draw" ? 0 : result.outcome === "win" ? result.winner : null,
        }).eq("id", match.id);
      } else {
        // Game still in progress — advance turn
        let nextTurn: number;
        if (currentDone) {
          // Current player just finished → switch to opponent so they can continue
          nextTurn = opponentNum;
        } else if (opponentDone) {
          // Opponent is already done → keep turn with current player so they can continue
          nextTurn = playerNum;
        } else {
          // Neither done → alternate turns normally
          nextTurn = opponentNum;
        }
        await supabase.from("matches").update({ current_turn: nextTurn }).eq("id", match.id);
      }
    }

    return NextResponse.json({ playerState: updatedMyState, exploded, cleared });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
