# Neon RPS – real-time multiplayer Rock Paper Scissors

React + Vite + Supabase (Realtime, Postgres, Edge Functions) + Vercel. All free tiers.

## How security works
- Browser only has the **anon/publishable key**. The `service_role` key lives only inside the Edge Function (injected by Supabase) – never in this repo.
- Players sign in with **Supabase anonymous auth** (a real, persistent user id per browser).
- Tables have **RLS on**. Browsers can only `select` rooms/players they belong to. **Nobody can insert/update/delete from the browser.**
- Unrevealed moves are in the `moves` table: RLS on, no policies, no grants → unreadable from the client. Players only see `has_moved` (true/false).
- The Edge Function `game` validates the JWT, input and rate (15 req/10 s per user per instance, best-effort), then calls SQL functions that lock the room row, check membership/phase, and compute results. Scores and winners are never client-supplied. Both moves are revealed in one atomic update.
- Limits: room codes are 5 chars from a 32-char alphabet; anyone with a code can try to join (max 2 players). Presence channel names include the room code. Rate limiting is per function instance, not global.

## Setup (Windows PowerShell)

### 1. Prerequisites
```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
# close and reopen PowerShell, then:
node -v; npm -v; git --version
```

### 2. Get the project and install
Extract the zip, then:
```powershell
cd path\to\neon-rps
npm install
```
(To start a Vite project from scratch instead: `npm create vite@latest neon-rps -- --template react`, then copy these files over it and run `npm install @supabase/supabase-js`.)

### 3. Create a Supabase project
1. https://supabase.com → New project (free). Note the **Project URL**, **anon/publishable key** (Settings → API) and the **project ref** (the part before `.supabase.co`).
2. **Authentication → Sign In / Providers → enable "Allow anonymous sign-ins".**

### 4. Credentials
```powershell
Copy-Item .env.example .env.local
notepad .env.local   # paste URL and anon key ONLY
```

### 5. Database + Edge Function
Easiest: Supabase dashboard → SQL Editor → paste all of `supabase/migrations/20260101000000_init.sql` → Run.

Deploy the function:
```powershell
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase functions deploy game
```
JWT verification stays ON (default). Do not set any service key yourself.

### 6. Run locally
```powershell
npm run dev
```
Open http://localhost:5173.

### 7. Test with two players
Anonymous sessions are per-browser-profile, so use **two different browsers** (e.g. Chrome + Edge), an Incognito window, or a phone. Do not use two tabs in the same profile.

### 8. GitHub
```powershell
git init
git add .
git status        # confirm .env.local is NOT listed
git commit -m "Neon RPS"
git branch -M main
git remote add origin https://github.com/YOUR-USER/neon-rps.git
git push -u origin main
```
(Create the empty repo at github.com/new first.)

### 9. Vercel
1. https://vercel.com → Add New → Project → import the GitHub repo (framework: Vite is auto-detected).
2. Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same values as `.env.local`).
3. Deploy. If you add variables later: Deployments → ⋯ → Redeploy.
4. Invite links automatically use your live domain (`https://YOUR-DOMAIN.vercel.app/?room=CODE`).

## Verification checklist
| Feature | How to verify |
|---|---|
| Create/join | A creates room, copies link; B opens it, enters name, joins. |
| Room full | Third browser tries the code → "already has two players". |
| Missing room | Join `ZZZZZ` → "does not exist". |
| Hidden moves | A picks; B sees only "locked in". In DevTools → Network, no move appears in any response until B picks. Querying `moves` from the console returns a permission error. |
| Rules / scoring | Play rounds; winner shown to both at the same time; first to 3 ends the match. |
| Rematch / reset | Rematch after match; Reset score mid-game. |
| Refresh / reconnect | Refresh either tab; you return to the same room and score. |
| Disconnect | Close B's tab; A sees "disconnected" banner; reopen the link → connected again. |
| Leave | Click Leave → confirm; the other player returns to "waiting". |
| Sound / a11y | Mute toggle; Tab key shows focus rings; OS "reduce motion" stops animations. |

## Troubleshooting
- "Could not start": anonymous sign-ins not enabled.
- Moves fail with a generic error: Edge Function not deployed (`npx supabase functions logs game`).
- No live updates: confirm the migration ran (it adds tables to the `supabase_realtime` publication).
