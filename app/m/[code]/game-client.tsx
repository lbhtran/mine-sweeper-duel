"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  generateMinesFromSeed,
  computeAdjacentCounts,
} from "@/lib/game/board";
import {
  BOARD_SIZE,
  CELL_COUNT,
  MINE_COUNT,
  FLAG_CAP,
  type Match,
  type PlayerState,
} from "@/lib/game/types";

// ──────────────────────────── helpers ────────────────────────────

function getOrCreatePlayerId(): string {
  let id = localStorage.getItem("msd_player_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("msd_player_id", id);
  }
  return id;
}

const CELL_COLORS: Record<number, string> = {
  1: "text-blue-400",
  2: "text-emerald-400",
  3: "text-red-400",
  4: "text-purple-400",
  5: "text-rose-600",
  6: "text-cyan-400",
  7: "text-zinc-300",
  8: "text-zinc-400",
};

// ──────────────────────────── Cell component ────────────────────────────

interface CellProps {
  index: number;
  mines: boolean[];
  adjacentCounts: number[];
  revealed: boolean[];
  flagged: boolean[];
  opponentRevealed?: boolean[];
  opponentFlagged?: boolean[];
  explodedIndex: number | null;
  gameOver: boolean;
  canAct: boolean;
  onReveal: (i: number) => void;
  onFlag: (i: number) => void;
  isMyBoard: boolean; // false = viewing for reference only
}

function Cell({
  index,
  mines,
  adjacentCounts,
  revealed,
  flagged,
  opponentRevealed,
  explodedIndex,
  gameOver,
  canAct,
  onReveal,
  onFlag,
  isMyBoard,
}: CellProps) {
  const isMine = mines[index];
  const isRevealed = revealed[index];
  const isOpponentRevealed = (opponentRevealed?.[index] ?? false) && !isRevealed;
  const isFlagged = flagged[index];
  const isExploded = explodedIndex === index;
  const count = adjacentCounts[index];

  const handleClick = () => {
    if (!canAct || !isMyBoard) return;
    if (!isRevealed && !isFlagged && !isOpponentRevealed) onReveal(index);
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canAct || !isMyBoard) return;
    if (!isRevealed && !isOpponentRevealed) onFlag(index);
  };

  // Determine display
  let bg = "bg-zinc-700 hover:bg-zinc-600";
  let content: React.ReactNode = null;

  if (isExploded) {
    bg = "bg-red-700";
    content = "💥";
  } else if (isRevealed) {
    if (isMine) {
      // Mine revealed at game end
      bg = "bg-red-900";
      content = "💣";
    } else {
      bg = "bg-zinc-800";
      content =
        count > 0 ? (
          <span className={`font-bold text-xs ${CELL_COLORS[count] ?? "text-zinc-300"}`}>
            {count}
          </span>
        ) : null;
    }
  } else if (isOpponentRevealed) {
    // Cell opened by the opponent — ghost/shadow style. Ring makes even empty cleared cells
    // distinguishable from unrevealed tiles (bg-zinc-700).
    bg = "bg-zinc-800 ring-1 ring-inset ring-zinc-600";
    if (isMine) {
      content = <span className="opacity-60">💣</span>;
    } else if (count > 0) {
      content = (
        <span className={`font-bold text-xs opacity-60 ${CELL_COLORS[count] ?? "text-zinc-300"}`}>
          {count}
        </span>
      );
    }
  } else if (isFlagged) {
    bg = "bg-zinc-700";
    content = "🚩";
  } else if (gameOver && isMine) {
    bg = "bg-zinc-800";
    content = "💣";
  }

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleRightClick}
      className={`w-8 h-8 flex items-center justify-center text-sm rounded select-none transition-colors ${bg} ${
        isOpponentRevealed && isMyBoard
          ? "cursor-not-allowed"
          : canAct && isMyBoard && !isRevealed && !isOpponentRevealed
          ? "cursor-pointer"
          : "cursor-default"
      }`}
      aria-label={`Cell ${index}`}
    >
      {content}
    </button>
  );
}

// ──────────────────────────── Board component ────────────────────────────

interface BoardProps extends Omit<CellProps, "index"> {
  title: string;
}

function Board({ title, mines, adjacentCounts, revealed, flagged, opponentRevealed, ...rest }: BoardProps) {
  const safeCells = mines.filter((m) => !m).length;
  // Count safe cells cleared directly by this player plus ghost cells cleared by the opponent
  const revealedSafe =
    revealed.filter((r, i) => r && !mines[i]).length +
    (opponentRevealed?.filter((r, i) => r && !mines[i]).length ?? 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">{title}</h3>
        <span className="text-xs text-zinc-500">
          {revealedSafe}/{safeCells} safe revealed
        </span>
      </div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 2rem)` }}
      >
        {Array.from({ length: CELL_COUNT }, (_, i) => (
          <Cell
            key={i}
            index={i}
            mines={mines}
            adjacentCounts={adjacentCounts}
            revealed={revealed}
            flagged={flagged}
            opponentRevealed={opponentRevealed}
            {...rest}
          />
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────── Planting board (ASYM) ────────────────────────────

interface PlantBoardProps {
  mines: boolean[];
  onToggle: (i: number) => void;
  deadline: string | null;
}

function PlantBoard({ mines, onToggle, deadline }: PlantBoardProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const mineCount = mines.filter(Boolean).length;

  useEffect(() => {
    if (!deadline) return;
    const update = () => {
      const diff = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [deadline]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">
          Plant your mines{" "}
          <span className="text-zinc-500">({mineCount}/{MINE_COUNT})</span>
        </h3>
        {secondsLeft !== null && (
          <span
            className={`text-sm font-mono ${
              secondsLeft <= 10 ? "text-red-400" : "text-zinc-400"
            }`}
          >
            {secondsLeft}s
          </span>
        )}
      </div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 2rem)` }}
      >
        {Array.from({ length: CELL_COUNT }, (_, i) => (
          <button
            key={i}
            onClick={() => onToggle(i)}
            className={`w-8 h-8 flex items-center justify-center text-sm rounded select-none transition-colors ${
              mines[i] ? "bg-red-800 hover:bg-red-700" : "bg-zinc-700 hover:bg-zinc-600"
            }`}
            aria-label={`Plant mine at cell ${i}`}
          >
            {mines[i] ? "💣" : null}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500">
        Click cells to place/remove mines. Your opponent will have to clear this board.
      </p>
    </div>
  );
}

// ──────────────────────────── Main GameClient ────────────────────────────

export default function GameClient({ code }: { code: string }) {
  // createBrowserClient is memoized via useRef so the instance is stable across renders
  const supabaseRef = useRef(createBrowserClient());
  const supabase = supabaseRef.current;
  const [match, setMatch] = useState<Match | null>(null);
  const [playerStates, setPlayerStates] = useState<PlayerState[]>([]);
  const [playerNum, setPlayerNum] = useState<1 | 2 | null>(null);
  const [playerId] = useState(() =>
    typeof window !== "undefined" ? getOrCreatePlayerId() : ""
  );
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [explodedIndex, setExplodedIndex] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const didJoin = useRef(false);

  // ── Join / load match ──
  useEffect(() => {
    if (!playerId || didJoin.current) return;
    didJoin.current = true;

    async function joinOrLoad() {
      // First try GET to see if already in match
      const getRes = await fetch(`/api/matches/${code}`);
      const getData = await getRes.json();

      if (!getRes.ok) {
        setStatusMsg(getData.error ?? "Match not found");
        setLoading(false);
        return;
      }

      const loadedMatch: Match = getData.match;
      const loadedStates: PlayerState[] = getData.playerStates ?? [];

      // Determine player num from loaded states
      const existing = loadedStates.find((s) => s.player_id === playerId);
      if (existing) {
        setPlayerNum(existing.player_num as 1 | 2);
        setMatch(loadedMatch);
        setPlayerStates(loadedStates);
        setLoading(false);
        return;
      }

      // Not in match yet — try to join
      const joinRes = await fetch(`/api/matches/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const joinData = await joinRes.json();

      if (!joinRes.ok) {
        setStatusMsg(joinData.error ?? "Cannot join match");
        setLoading(false);
        return;
      }

      setPlayerNum(joinData.playerNum as 1 | 2);
      setMatch(joinData.match);

      // Reload all states
      const refreshRes = await fetch(`/api/matches/${code}`);
      const refreshData = await refreshRes.json();
      setPlayerStates(refreshData.playerStates ?? []);
      setLoading(false);
    }

    joinOrLoad();
  }, [code, playerId]);

  // ── Realtime subscription ──
  useEffect(() => {
    if (!match) return;

    const matchId = match.id;
    const channel = supabase
      .channel(`match:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          setMatch(payload.new as Match);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_states",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const updated = payload.new as PlayerState;
          setPlayerStates((prev) => {
            const idx = prev.findIndex((s) => s.id === updated.id);
            if (idx === -1) return [...prev, updated];
            const next = [...prev];
            next[idx] = updated;
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // Intentionally depend only on match.id — we want to re-subscribe only when the
    // match itself changes (new ID), not on every match-state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, supabase]);

  // ── Derived state ──
  const myState = playerStates.find((s) => s.player_num === playerNum);
  const oppNum = playerNum === 1 ? 2 : 1;
  const oppState = playerStates.find((s) => s.player_num === oppNum);

  // Determine mines to display
  let mines: boolean[] = new Array(CELL_COUNT).fill(false);
  let adjacentCounts: number[] = new Array(CELL_COUNT).fill(0);

  if (match?.mode === "H2H_TURN" && match.seed) {
    mines = generateMinesFromSeed(match.seed);
    adjacentCounts = computeAdjacentCounts(mines);
  } else if (match?.mode === "ASYM_PLANT_CLEAR" && match.status === "PLAYING") {
    // For clearing: I'm clearing opponent's mines
    if (oppState?.mines) {
      mines = oppState.mines as boolean[];
      adjacentCounts = computeAdjacentCounts(mines);
    }
  }

  const isMyTurn =
    match?.mode === "H2H_TURN" ? match.current_turn === playerNum : true;
  const gameOver = match?.status === "FINISHED";
  const canAct =
    !actionPending &&
    !gameOver &&
    match?.status === "PLAYING" &&
    isMyTurn &&
    !myState?.exploded &&
    !myState?.cleared;

  // Find which mine the opponent hit so we can render the explosion marker on their board.
  // Works for both modes: H2H uses the shared mines array; ASYM uses my planted mines.
  let oppBoardExplodedIndex: number | null = null;
  if (oppState?.exploded) {
    const oppRev = oppState.revealed as boolean[];
    if (match?.mode === "H2H_TURN") {
      // Shared board — mines already in the `mines` variable
      const idx = oppRev.findIndex((r, i) => r && mines[i]);
      oppBoardExplodedIndex = idx >= 0 ? idx : null;
    } else if (match?.mode === "ASYM_PLANT_CLEAR" && myState?.mines) {
      const myMines = myState.mines as boolean[];
      const idx = oppRev.findIndex((r, i) => r && myMines[i]);
      oppBoardExplodedIndex = idx >= 0 ? idx : null;
    }
  }

  // ── Win / result display ──
  let resultMsg = "";
  if (gameOver && match) {
    if (match.winner === null) resultMsg = "";
    else if (match.winner === 0) resultMsg = "It's a draw!";
    else if (match.winner === playerNum) resultMsg = "🎉 You win!";
    else resultMsg = "💥 You lose";
  }

  // ── Actions ──
  const doAction = useCallback(
    async (action: "reveal" | "flag" | "plant", cellIndex: number) => {
      if (!playerNum) return;
      setActionPending(true);
      try {
        const res = await fetch(`/api/matches/${code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, playerNum, cellIndex }),
        });
        const data = await res.json();
        if (res.ok) {
          if (data.exploded) {
            setExplodedIndex(cellIndex);
          }
          if (data.playerState) {
            setPlayerStates((prev) => {
              const idx = prev.findIndex(
                (s) => s.player_num === playerNum
              );
              if (idx === -1) return [...prev, data.playerState];
              const next = [...prev];
              next[idx] = data.playerState;
              return next;
            });
          }
        }
      } finally {
        setActionPending(false);
      }
    },
    [code, playerNum]
  );

  const handleReveal = useCallback(
    (i: number) => doAction("reveal", i),
    [doAction]
  );
  const handleFlag = useCallback(
    (i: number) => doAction("flag", i),
    [doAction]
  );
  const handlePlant = useCallback(
    (i: number) => doAction("plant", i),
    [doAction]
  );

  // ── Render ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <p className="text-zinc-400 animate-pulse">Loading match…</p>
      </div>
    );
  }

  if (statusMsg && !match) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center space-y-4">
          <p className="text-red-400 text-lg">{statusMsg}</p>
          <Link href="/" className="text-indigo-400 underline text-sm">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!match || !playerNum) return null;

  // ── WAITING screen ──
  if (match.status === "WAITING") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 gap-6 p-6">
        <h1 className="text-2xl font-bold">Waiting for opponent…</h1>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-8 py-6 text-center space-y-2">
          <p className="text-sm text-zinc-400">Share this match code:</p>
          <p className="text-3xl font-mono font-bold tracking-widest text-indigo-400">
            {match.code}
          </p>
          <p className="text-xs text-zinc-500">or share the URL</p>
        </div>
        <p className="text-sm text-zinc-500">
          Mode:{" "}
          {match.mode === "H2H_TURN" ? "⚔️ Turn-based" : "🌱 Plant & Clear"}
        </p>
      </div>
    );
  }

  // ── PLANTING screen (ASYM) ──
  if (match.status === "PLANTING" && match.mode === "ASYM_PLANT_CLEAR") {
    const myMines = (myState?.mines ?? new Array(CELL_COUNT).fill(false)) as boolean[];
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6">
        <div className="w-full max-w-lg space-y-6">
          <header className="text-center">
            <h1 className="text-2xl font-bold">Plant Your Mines</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Place up to {MINE_COUNT} mines. Your opponent will have to clear this board.
            </p>
          </header>
          <PlantBoard
            mines={myMines}
            onToggle={handlePlant}
            deadline={match.planting_deadline}
          />
        </div>
      </div>
    );
  }

  // ── PLAYING / FINISHED screen ──
  const myRevealed = (myState?.revealed ?? new Array(CELL_COUNT).fill(false)) as boolean[];
  const myFlagged = (myState?.flagged ?? new Array(CELL_COUNT).fill(false)) as boolean[];
  const myFlagCount = myFlagged.filter(Boolean).length;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">
            ← Home
          </Link>
          <span className="text-zinc-600">|</span>
          <span className="font-mono text-indigo-400 font-bold">{match.code}</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-400">
            {match.mode === "H2H_TURN" ? "⚔️ Turn-based" : "🌱 Plant & Clear"}
          </span>
          {match.mode === "H2H_TURN" && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                isMyTurn
                  ? "bg-indigo-900 text-indigo-300"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {isMyTurn ? "Your turn" : "Opponent's turn"}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Result banner */}
        {resultMsg && (
          <div
            className={`w-full max-w-xl mb-6 p-4 rounded-xl text-center text-lg font-bold ${
              resultMsg.includes("win")
                ? "bg-emerald-900 text-emerald-300"
                : resultMsg.includes("lose")
                ? "bg-red-900 text-red-300"
                : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {resultMsg}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8 items-start justify-center">
          {/* My board */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300 font-medium">
                You (P{playerNum}){" "}
                {myState?.exploded ? "💥" : myState?.cleared ? "✅" : ""}
              </span>
              <span className="text-zinc-500">
                🚩 {myFlagCount}/{FLAG_CAP}
              </span>
            </div>
            <Board
              title=""
              mines={mines}
              adjacentCounts={adjacentCounts}
              revealed={myRevealed}
              flagged={myFlagged}
              opponentRevealed={
                match.mode === "H2H_TURN"
                  ? ((oppState?.revealed as boolean[]) ?? undefined)
                  : undefined
              }
              explodedIndex={explodedIndex}
              gameOver={gameOver}
              canAct={canAct}
              onReveal={handleReveal}
              onFlag={handleFlag}
              isMyBoard={true}
            />
            {match.mode === "H2H_TURN" && (
              <p className="text-xs text-zinc-500">
                Round {match.round} · Reveals: {myState?.reveal_count ?? 0}
              </p>
            )}
          </div>

          {/* Opponent board (ASYM: show opponent's progress on their own board, H2H: show opponent flags if game over) */}
          {oppState && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400 font-medium">
                  Opponent (P{oppNum}){" "}
                  {oppState.exploded ? "💥" : oppState.cleared ? "✅" : ""}
                </span>
                <span className="text-zinc-500">
                  🚩 {(oppState.flagged as boolean[]).filter(Boolean).length}/{FLAG_CAP}
                </span>
              </div>

              {match.mode === "H2H_TURN" ? (
                // Show opponent's progress on the same board
                <Board
                  title=""
                  mines={mines}
                  adjacentCounts={adjacentCounts}
                  revealed={(oppState.revealed as boolean[])}
                  flagged={gameOver ? (oppState.flagged as boolean[]) : new Array(CELL_COUNT).fill(false)}
                  explodedIndex={oppBoardExplodedIndex}
                  gameOver={gameOver}
                  canAct={false}
                  onReveal={() => {}}
                  onFlag={() => {}}
                  isMyBoard={false}
                />
              ) : (
                // ASYM: show opponent clearing my board (ghost/shadow on cleared tiles)
                <Board
                  title=""
                  mines={(myState?.mines as boolean[]) ?? new Array(CELL_COUNT).fill(false)}
                  adjacentCounts={computeAdjacentCounts(
                    (myState?.mines as boolean[]) ?? new Array(CELL_COUNT).fill(false)
                  )}
                  revealed={new Array(CELL_COUNT).fill(false)}
                  opponentRevealed={(oppState.revealed as boolean[])}
                  flagged={new Array(CELL_COUNT).fill(false)}
                  explodedIndex={oppBoardExplodedIndex}
                  gameOver={gameOver}
                  canAct={false}
                  onReveal={() => {}}
                  onFlag={() => {}}
                  isMyBoard={false}
                />
              )}
              <p className="text-xs text-zinc-500">
                Reveals: {oppState.reveal_count}
              </p>
            </div>
          )}
        </div>

        {/* Waiting for opponent */}
        {!oppState && match.status === "PLAYING" && (
          <p className="mt-6 text-zinc-500 text-sm animate-pulse">
            Waiting for opponent to connect…
          </p>
        )}
      </main>
    </div>
  );
}
