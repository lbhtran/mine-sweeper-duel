"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GameMode } from "@/lib/game/types";

function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("msd_player_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("msd_player_id", id);
  }
  return id;
}

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<GameMode>("H2H_TURN");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    setError("");
    setCreating(true);
    try {
      const playerId = getOrCreatePlayerId();
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create match");
      router.push(`/m/${data.match.code}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setCreating(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setError("");
    setJoining(true);
    try {
      const playerId = getOrCreatePlayerId();
      const res = await fetch(`/api/matches/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to join match");
      router.push(`/m/${code}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6">
      <div className="w-full max-w-md space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">💣 Mine Sweeper Duel</h1>
          <p className="text-zinc-400">Two-player online Minesweeper</p>
        </header>

        {/* Create a match */}
        <section className="bg-zinc-900 rounded-2xl p-6 space-y-4 border border-zinc-800">
          <h2 className="text-lg font-semibold">Create a Match</h2>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Game Mode</label>
            <div className="flex gap-3">
              <button
                onClick={() => setMode("H2H_TURN")}
                className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${
                  mode === "H2H_TURN"
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                }`}
              >
              ⚔️ Classic
              </button>
              <button
                onClick={() => setMode("ASYM_PLANT_CLEAR")}
                className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${
                  mode === "ASYM_PLANT_CLEAR"
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                🌱 Plant &amp; Clear
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              {mode === "H2H_TURN"
                ? "Both players reveal cells alternately on the same seeded board."
                : "Plant mines on your board, then take turns clearing the opponent's board."}
            </p>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold transition-colors"
          >
            {creating ? "Creating…" : "Create Match"}
          </button>
        </section>

        {/* Join a match */}
        <section className="bg-zinc-900 rounded-2xl p-6 space-y-4 border border-zinc-800">
          <h2 className="text-lg font-semibold">Join a Match</h2>
          <form onSubmit={handleJoin} className="flex gap-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter code (e.g. AB3X7Y)"
              maxLength={6}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={joining || joinCode.trim().length < 6}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm transition-colors"
            >
              {joining ? "Joining…" : "Join"}
            </button>
          </form>
        </section>

        {error && (
          <p className="text-center text-red-400 text-sm">{error}</p>
        )}

        <p className="text-center text-xs text-zinc-600">
          Share the match code with a friend to play together.
        </p>
      </div>
    </div>
  );
}
