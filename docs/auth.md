# Authentication & roles

## Model

| Role | How you get it | Can |
| --- | --- | --- |
| `visitante` | No session (or a session without profile) | Read public data: matches, table, squad, stats, timeline, MVP totals |
| `jugador` | Account linked to a row of `jugadores` | Everything above + vote MVP **as himself**, only in played matches, for a teammate who took part; see private player notes |
| `admin` | Assigned from a trusted context | Manage matches, timeline, lineups, stats, squad, league, sponsors, season settings |
| `superadmin` | Assigned from a trusted context | Admin + create/close seasons + read the activity log |

- Identity: **Supabase Auth**. Staff log in with email + password. Players keep the
  "pick your name + PIN" screen: each player has an Auth account with the synthetic email
  `jugador-<id>@<VITE_PLAYER_LOGIN_DOMAIN>` and the PIN as password. No email is ever sent.
- Roles: `public.perfiles (user_id, jugador_id, rol)`. Clients can read **their own** row
  (admins can read all). There are no write policies, `insert/update/delete` are revoked from
  `anon`/`authenticated`, and a trigger rejects writes that carry an end-user JWT.
- Enforcement: RLS policies on every table use `is_admin()`, `is_superadmin()` and
  `mi_jugador_id()`. The React checks (`useAuth().isAdmin`, …) only decide what to show.
- Activity log: the author (`user_id`, `jugador_id`, `jugador_nombre`) is set by a trigger from
  the JWT; whatever the client sends is overwritten.

## Sessions

- Access token (JWT) lifetime: Supabase › Authentication › Sessions / JWT expiry (default 3600 s).
- `supabase-js` refreshes it automatically before it expires (`autoRefreshToken`), also when the
  PWA comes back to the foreground. Refresh tokens rotate on every use.
- If the refresh token is revoked or expired, supabase-js emits `SIGNED_OUT`; the app drops the
  role, shows "Tu sesión ha caducado" and every request falls back to visitor permissions.
- "Cerrar sesión" calls `signOut({ scope: 'local' })`, which revokes this device's refresh
  token on the server and clears the session locally (even if the request fails offline).
- Storage: the only thing stored is the Supabase session itself (key `cdt-supabase-auth`), in
  `localStorage` by default or `sessionStorage` with `VITE_AUTH_STORAGE=session`. No passwords,
  hashes or home-made tokens. The previous keys (`cdt_auth`, `cdt_jugador_activo`) are deleted on
  startup.

## One-time setup in Supabase

1. **SQL Editor**: run `supabase/migrations/20261017000000_supabase_auth_roles.sql`
   (or `npx supabase db push`).
2. **Authentication › Sign In / Providers**
   - Email provider: **enabled**.
   - **Allow new users to sign up: OFF** — accounts are created only by an admin.
   - Minimum password length: 8 recommended (migrated shorter PINs keep working).
3. **Authentication › Rate Limits**: keep (or lower) the sign-in limit per IP. This is what
   protects PINs against guessing — the old `validar_clave` RPC had no limit and was removed.
4. **Authentication › Sessions**: refresh-token rotation on (default). Optional: lower JWT expiry,
   inactivity timeout / time-box (paid plans).

## Trusted tooling: `scripts/auth-admin.mjs`

Runs on your computer with the **service-role key** (never in Vercel, never `VITE_`):

```bash
cp scripts/.env.admin.example scripts/.env.admin   # fill URL, service-role key, domain

node scripts/auth-admin.mjs user tu@email.com --role superadmin --generate  # your account
node scripts/auth-admin.mjs user entrenador@email.com --role admin --jugador 12 --generate
node scripts/auth-admin.mjs players --generate     # a PIN for every player without account
node scripts/auth-admin.mjs player 7 --pin 48151623
node scripts/auth-admin.mjs role jugador:7 admin   # promote a player
node scripts/auth-admin.mjs disable jugador:7      # ban + remove role
node scripts/auth-admin.mjs list
```

Without the script (dashboard only): **Authentication › Users › Add user** (email + password,
"Auto confirm"), then in the SQL Editor:

```sql
select asignar_rol_por_email('tu@email.com', 'superadmin');
select asignar_rol_por_email('jugador-7@jugadores.cdtembleque.app', 'jugador', 7);
```

`asignar_rol*` cannot be executed by `anon` or `authenticated`.

Role changes apply on the user's next page load or token refresh.

## Migrating the existing users

Nothing in matches, stats, lineups or votes changes: they reference `jugadores.id`, and the new
accounts are linked to the **same** `jugador_id` through `perfiles`.

1. Deploy the migration (step 1 above). From this moment the old login stops working.
2. Create your superadmin account (`user … --role superadmin`).
3. Import the old PINs: `node scripts/auth-admin.mjs migrate-pins`.
   `claves_jugadores.clave_hash` is bcrypt (pgcrypto `gen_salt('bf')`), the same algorithm Supabase
   Auth uses, so the hash is imported with `password_hash` and **every player keeps their PIN**.
   If a row fails (e.g. the project rejects hash import), the script prints the command to give
   that player a new PIN.
4. Players who never had a PIN: `node scripts/auth-admin.mjs players --generate`.
5. Re-assign admins: everyone who used the old shared admin password needs their own account
   (`user <email> --role admin [--jugador <id>]`). The shared password and
   `VITE_ADMIN_PASSWORD_HASH` are gone — delete that variable from Vercel.
6. Check with `node scripts/auth-admin.mjs list`, then run
   `supabase/cleanup/drop_claves_jugadores.sql`.

> Behaviour change: before, any player with a PIN could edit everything. Now players can only
> vote; give `admin` to the people who should manage the team.

## Tests

- `npm test` — `src/lib/__tests__/auth.test.js`: role mapping and permissions, player and admin
  login, wrong PIN, account linked to another player, user without profile, expired stored
  session, token refresh, revoked refresh token, voluntary vs. involuntary sign-out, no writes
  to storage.
- `npm run test:db` (`supabase test db`, needs `npx supabase start`) —
  `supabase/tests/auth_rls.test.sql`: 27 pgTAP checks that visitors, players, users without
  profile, admins and superadmins can do exactly what the table above says, that nobody can
  raise their own role and that the log author cannot be spoofed.
