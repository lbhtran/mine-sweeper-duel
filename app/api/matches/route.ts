import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateMatchCode } from "@/lib/game/board";
import type { GameMode } from "@/lib/game/types";
import { CELL_COUNT } from "@/lib/game/types";

/**
 * POST /api/matches
 * Body: { mode: GameMode; playerId: string }
 * Creates a new match and player 1's state, returns { match, playerState }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !body.mode || !body.playerId) {
    return NextResponse.json(
      { error: "mode and playerId are required" },
      { status: 400 }
    );
  }

  const { mode, playerId } = body as { mode: GameMode; playerId: string };
  if (mode !== "H2H_TURN" && mode !== "ASYM_PLANT_CLEAR") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Generate a unique match code
  let code = generateMatchCode();
  let attempts = 0;
  while (attempts < 10) {
    const { data } = await supabase
      .from("matches")
      .select("code")
      .eq("code", code)
      .maybeSingle();
    if (!data) break; // code is free
    code = generateMatchCode();
    attempts++;
  }

  // For H2H_TURN: generate seed now
  const seed = mode === "H2H_TURN" ? Math.floor(Math.random() * 2 ** 31) : null;

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .insert({
      code,
      mode,
      status: "WAITING",
      seed,
      player1_id: playerId,
      player2_id: null,
      current_turn: 1,
      round: 0,
      planting_deadline: null,
      clearing_started_at: null,
      winner: null,
    })
    .select()
    .single();

  if (matchError || !match) {
    return NextResponse.json(
      { error: matchError?.message ?? "Failed to create match" },
      { status: 500 }
    );
  }

  const { data: playerState, error: stateError } = await supabase
    .from("player_states")
    .insert({
      match_id: match.id,
      player_num: 1,
      player_id: playerId,
      revealed: new Array(CELL_COUNT).fill(false),
      flagged: new Array(CELL_COUNT).fill(false),
      reveal_count: 0,
      exploded: false,
      cleared: false,
      cleared_at: null,
      exploded_at: null,
      mines: mode === "ASYM_PLANT_CLEAR" ? new Array(CELL_COUNT).fill(false) : null,
    })
    .select()
    .single();

  if (stateError || !playerState) {
    return NextResponse.json(
      { error: stateError?.message ?? "Failed to create player state" },
      { status: 500 }
    );
  }

  return NextResponse.json({ match, playerState }, { status: 201 });
}
