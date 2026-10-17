# CD Tembleque FC

Progressive web app for **CD Tembleque FC** — Segunda Autonómica de Castilla-La Mancha, Group 4.
Results, league table, squad, stats, match timeline and MVP voting, installable on any phone.

Built with **React 18 + Vite**, data in **Supabase**, deployed on **Vercel**.

## Features

- **Home** — next match countdown, position, points, last results, top scorers.
- **League table** — computed automatically from every result of the group: total / home / away
  tables, form guide (last 5), promotion / play-off / relegation zones, points deductions and
  head-to-head tie-breaks. **Matchday** view with every fixture of each round.
- **Matches** — upcoming and played matches, home and away.
- **Match detail**
  - Minute-by-minute **timeline**: goals (penalty, own goal), assists, yellow / second yellow /
    red cards and substitutions, with half-time and full-time markers.
  - 11-a-side lineup (4-4-2, 4-3-3, 4-2-3-1…), call-up and substitutes.
  - Player sheet with minutes played, and MVP voting.
- **Stats** — goals, assists, **minutes played**, appearances, starts, cards, saves, goals conceded.
- **Admin panel** — matches, stats, squad, league (teams, results, zones), seasons and activity log.

### How minutes are calculated

When a match is marked as played (and every time its lineup or timeline changes) the app
rebuilds that match's rows in `estadisticas`:

| Situation | Minutes |
| --- | --- |
| Starter, not replaced | 90 |
| Starter replaced at minute *m* | *m* |
| Substitute coming on at minute *m* | 90 − *m* |
| Sent off (red / second yellow) at minute *m* | until *m* |

Added time is capped (90+3 counts as 90). When the match has a timeline, goals, assists, cards
and goals conceded by the goalkeeper on the pitch are also derived from it; saves stay manual.
Season totals are the sum of every match. The logic lives in `src/lib/timeline.js` and is unit-tested.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your keys (optional for local dev)
npm run dev                  # http://localhost:5173
npm test                     # unit tests (vitest)
```

Without Supabase variables the app runs in **local mode** and stores everything in
`localStorage`. In development the admin password is `admin`.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema — either:
   - **CLI**: `npx supabase link --project-ref <ref>` then `npx supabase db push`, or
   - **Dashboard**: paste `supabase/migrations/20261016000000_init.sql` into the SQL Editor.
3. Run `supabase/seed.sql` once (creates the active season and the club as a league team).
4. Configure Auth and create the accounts (superadmin, admins, one per player) — see
   **[docs/auth.md](docs/auth.md)**.
5. Copy the project URL and anon key into `.env.local`.

## Deploying to Vercel

1. Import the GitHub repository in Vercel (framework preset: **Vite**).
2. Add the environment variables from `.env.example` for **Production** and **Preview**.
   Use a separate Supabase project (or branch) for Preview if you can.
3. Every push to `main` deploys production; every pull request gets a preview URL.

The SPA rewrite and cache headers are in `vercel.json`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | Supabase anon (public) key |
| `VITE_PLAYER_LOGIN_DOMAIN` | no | Domain of the synthetic player logins (default `jugadores.cdtembleque.app`) |
| `VITE_AUTH_STORAGE` | no | `local` (default) or `session` — where supabase-js keeps the session |
| `VITE_CLOUDINARY_CLOUD_NAME` | no | Image uploads (photos, crests) |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | no | Unsigned upload preset |
| `VITE_VAPID_PUBLIC_KEY` | no | Web push |
| `VITE_PUSH_SECRET` | no | Shared secret for the `send-push` edge function |

The service-role key is used **only** by `scripts/auth-admin.mjs` on a trusted machine,
from `scripts/.env.admin` (git-ignored). It never goes to Vercel or into a `VITE_` variable.

## Project structure

```
src/
  config/club.js        # club name, competition, season — change here
  lib/
    store.js            # data layer (Supabase or localStorage)
    standings.js        # league table + tie-breaks (pure)
    timeline.js         # timeline helpers + minutes played (pure)
    playerTotals.js     # season totals per player
  components/           # MatchTimeline, Alineacion, MatchCard, Sheet…
  pages/                # one file per route, admin panels in pages/admin
supabase/
  migrations/           # SQL schema (source of truth)
  functions/send-push/  # web push edge function
```

## Security

- **Authentication**: Supabase Auth (email + password for staff, name + PIN for players).
  Sessions are short-lived JWTs renewed with rotating refresh tokens.
- **Authorisation**: roles (`visitante`, `jugador`, `admin`, `superadmin`) live in
  `public.perfiles` and are enforced by Row Level Security on every table. Hiding buttons in
  React is only a convenience — the database rejects anything the role is not allowed to do.
- **Role assignment** happens only from trusted contexts (SQL editor or `scripts/auth-admin.mjs`
  with the service-role key). The client has no write access to `perfiles`.
- Tests: `npm test` (client auth, roles, expiry, sign-out) and `npm run test:db`
  (pgTAP RLS tests in `supabase/tests`).

- **Least privilege**: visitors can only read public data; the anon key cannot write anything.
  Private player notes live in `jugadores_privado` (members only) and MVP votes are a secret
  ballot (public totals through `mvp_ranking`). No `service_role` key in the frontend.

- **Data validation**: every write is validated in the form, in the store and, as the last
  barrier, in the database (constraints, foreign keys, unique indexes and triggers with clear
  error messages). Rules and decisions: [docs/data-validation.md](docs/data-validation.md).

Details, setup and migration: [docs/auth.md](docs/auth.md). Database audit, permission matrix
and how to verify migrations on staging first: [docs/database-security.md](docs/database-security.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branching model and commit conventions.
