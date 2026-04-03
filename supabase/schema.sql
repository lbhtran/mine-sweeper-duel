-- Mine Sweeper Duel — Supabase Database Schema
-- Run this in the Supabase SQL editor (or via supabase db reset)

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ──────────── matches ────────────
create table if not exists public.matches (
  id                  uuid        primary key default gen_random_uuid(),
  code                text        not null unique,
  mode                text        not null check (mode in ('H2H_TURN', 'ASYM_PLANT_CLEAR')),
  status              text        not null default 'WAITING'
                                    check (status in ('WAITING', 'PLANTING', 'PLAYING', 'FINISHED')),
  seed                bigint,                         -- seeded board for H2H_TURN
  player1_id          text,
  player2_id          text,
  current_turn        int         not null default 1, -- 1 or 2, H2H_TURN only
  round               int         not null default 0,
  planting_deadline   timestamptz,                    -- ASYM planting phase end
  clearing_started_at timestamptz,
  winner              int,                            -- 1, 2, or 0 for draw; null = unresolved
  created_at          timestamptz not null default now()
);

-- ──────────── player_states ────────────
create table if not exists public.player_states (
  id           uuid        primary key default gen_random_uuid(),
  match_id     uuid        not null references public.matches (id) on delete cascade,
  player_num   int         not null check (player_num in (1, 2)),
  player_id    text,
  revealed     boolean[]   not null default array_fill(false, '{81}'),
  flagged      boolean[]   not null default array_fill(false, '{81}'),
  reveal_count int         not null default 0,
  exploded     boolean     not null default false,
  cleared      boolean     not null default false,
  cleared_at   timestamptz,
  exploded_at  timestamptz,
  mines        boolean[],                             -- ASYM: mines planted by this player
  ready        boolean     not null default false,     -- ASYM planting: player clicked ready
  unique (match_id, player_num)
);

-- ──────────── Migrations ────────────
-- Idempotent column additions for databases created before these columns were added.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is a no-op when the column already exists.
alter table public.player_states add column if not exists ready boolean not null default false;

-- ──────────── Indexes ────────────
create index if not exists idx_matches_code on public.matches (code);
create index if not exists idx_player_states_match_id on public.player_states (match_id);

-- ──────────── Row Level Security ────────────
alter table public.matches enable row level security;
alter table public.player_states enable row level security;

-- Allow anyone to read matches (needed for joining by code)
create policy "matches_read" on public.matches
  for select using (true);

-- Only the server (service role) can insert/update/delete
-- The app uses the service-role key in server-side API routes.
-- Client-side only reads via anon key (RLS select policy above).

-- Allow client to read player_states for their own match
create policy "player_states_read" on public.player_states
  for select using (true);

-- ──────────── Realtime ────────────
-- Enable realtime for both tables so clients can subscribe to changes.
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.player_states;
