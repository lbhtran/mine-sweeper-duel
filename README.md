# mine-sweeper-duel

Online two-player Minesweeper. See [specs.md](./specs.md) for the full game specification.

**Game modes:**
- **⚔️ Turn-based (H2H_TURN)** — Both players take turns revealing cells on the same seeded board.
- **🌱 Plant & Clear (ASYM_PLANT_CLEAR)** — Each player plants mines on their own board, then races to clear the opponent's board simultaneously.

## Tech Stack

- [Next.js 16](https://nextjs.org) — App Router, Server Components, Route Handlers
- [Supabase](https://supabase.com) — PostgreSQL database + Realtime subscriptions
- [Tailwind CSS v4](https://tailwindcss.com)
- Deployed on [Vercel](https://vercel.com)

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.local.example .env.local
# Fill in your Supabase URL and keys (see "Supabase Setup" below)

# 3. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Supabase Setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a new project, and note your:
- **Project URL** (`https://your-project-ref.supabase.co`)
- **Anon / public key**
- **Service role key** (Settings → API)

### 2. Apply the database schema

The schema is applied automatically by the **Migrate Database** GitHub Actions workflow (`.github/workflows/migrate.yml`) whenever `supabase/schema.sql` changes on the `main` branch, or on manual trigger.

To enable the workflow, add a `SUPABASE_DB_URL` repository secret (**Settings → Secrets and variables → Actions**) with your Supabase database connection string:
```
postgresql://postgres:[DB_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

You can also apply the schema manually: in your Supabase project, open the **SQL Editor** and run the contents of [`supabase/schema.sql`](./supabase/schema.sql).

This creates:
- `matches` table
- `player_states` table
- Row Level Security policies
- Realtime publication for both tables

### 3. Enable Realtime

Supabase Realtime must be enabled for the `matches` and `player_states` tables.

The schema SQL already runs `alter publication supabase_realtime add table ...`, but double-check in **Database → Replication** that both tables are listed under `supabase_realtime`.

---

## Deploy to Vercel

### Option A — Vercel CLI (recommended)

```bash
# Install Vercel CLI globally
npm i -g vercel

# Deploy (follow prompts)
vercel

# For production deployment
vercel --prod
```

During the first deploy, Vercel will ask you to link or create a project.

### Option B — GitHub Integration

1. Push this repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Vercel will auto-detect Next.js and use the settings in `vercel.json`.

### Environment Variables

After creating the Vercel project, add these environment variables in **Project Settings → Environment Variables**:

| Variable | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project-ref.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role key | Production, Preview, Development |

> ⚠️ **`SUPABASE_SERVICE_ROLE_KEY`** is secret — it has full database access. Never expose it client-side. It is only used in Next.js **Route Handlers** (server-side).

### Verify Deployment

```bash
# Run production build locally to catch errors before deploying
npm run build
npm run start
```

---

## Project Structure

```
app/
  page.tsx                  Home page — create or join a match
  m/[code]/
    page.tsx                Match server component (dynamic route)
    game-client.tsx         Client component — game UI + Supabase Realtime
  api/
    matches/
      route.ts              POST /api/matches — create a new match
      [code]/
        route.ts            GET/POST/PATCH /api/matches/[code]

lib/
  game/
    types.ts                Shared type definitions & constants
    board.ts                Board generation, reveal (flood fill), flag logic
    rules.ts                Win condition evaluation (H2H + ASYM)
  supabase/
    client.ts               Browser Supabase client (anon key)
    server.ts               Server Supabase client (service role key)

supabase/
  schema.sql                Database schema — run once in Supabase SQL editor

.env.local.example          Template for required environment variables
vercel.json                 Vercel deployment configuration
specs.md                    Full game specification (MVP)
```
