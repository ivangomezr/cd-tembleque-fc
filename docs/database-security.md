# Database security

Audit of the Supabase database (October 2026) and how it is locked down. The goal: **nobody
can change club data without the right role, even when calling the Supabase REST API directly
with the public (anon) key** — the React UI is never the security boundary.

## 1. Findings in the original schema (`20261016000000_init.sql`)

| # | Severity | Finding |
| --- | --- | --- |
| 1 | **Critical** | Every table had an `"anon write"` policy `FOR ALL USING (true) WITH CHECK (true)`. Anyone with the anon key (it ships in the JS bundle) could insert, update or delete matches, players, stats, the league table, seasons, votes, sponsors and the activity log. |
| 2 | High | `validar_clave(jugador_id, pin)` was executable by `anon`: an unlimited, unauthenticated PIN-guessing oracle (6-digit PIN → at most 1M calls). |
| 3 | High | Supabase's default privileges grant `ALL` (incl. `TRUNCATE`, `REFERENCES`, `TRIGGER`) on every table and `EXECUTE` on every function to `anon`/`authenticated`. RLS does not cover `TRUNCATE`. |
| 4 | Medium | Private player data (`jugadores.estado_desc`: injury / sanction details) was public. |
| 5 | Medium | MVP votes were public row by row: anyone could see who voted for whom. Players could vote for anybody, including people who did not play. |
| 6 | Medium | `push_subscriptions` (endpoints + keys) were readable and writable by anyone. |
| 7 | Low | Activity log author was sent by the client, so it could be forged. |
| — | Info | No views exist. No Storage buckets are used (images go to Cloudinary unsigned presets). No `service_role` key is used in the frontend (enforced by a test). |

## 2. Fix: migrations (applied in order, history untouched)

| Migration | What it does |
| --- | --- |
| `20261017000000_supabase_auth_roles.sql` | Supabase Auth roles (`perfiles`), role helpers, trusted-only role assignment, drops the PIN oracle, removes every `anon write` policy and replaces it with role-based policies, server-side activity log author. |
| `20261017120000_db_hardening.sql` | Least-privilege `GRANT`s (revoke all, grant back the minimum), no automatic exposure of future objects, private player data moved to `jugadores_privado`, secret MVP ballot with `mvp_ranking()` and stricter vote rules, `EXECUTE` revoked on every function except the needed ones, RLS forced on every table in `public`. |
| `20261017180000_data_integrity.sql` | Data rules: constraints, unique indexes, validation triggers, timeline order, stats vs timeline. See [data-validation.md](data-validation.md); run `supabase/checks/data_integrity_preflight.sql` first. |

Nothing is dropped from earlier migrations; the old `jugadores.estado_desc` column is kept but
always empty (a trigger moves any value to `jugadores_privado`). `claves_jugadores` is only
dropped by hand with `supabase/cleanup/drop_claves_jugadores.sql`, after the PINs are migrated.

## 3. Resulting permissions

`R` read · `I` insert · `U` update · `D` delete · `—` nothing (error 42501 or 0 rows)

| Table | anon (visitor) | jugador | admin | superadmin |
| --- | --- | --- | --- | --- |
| `temporadas` | R | R | R, U (settings only¹) | R I U D |
| `jugadores` | R (public columns) | R | R I U D | R I U D |
| `jugadores_privado` | — | R | R I U D | R I U D |
| `equipos_liga`, `partidos_liga` | R | R | R I U D | R I U D |
| `partidos`, `alineaciones`, `eventos_partido`, `estadisticas` | R | R | R I U D | R I U D |
| `patrocinadores` | R | R | R I U D | R I U D |
| `votos_mvp` | — (totals via `mvp_ranking`) | own vote: R I U D² | R all, own vote I U D² | same as admin |
| `perfiles` | — | R own | R all | R all |
| `activity_log` | — | — | I (author set by server) | R I |
| `push_subscriptions`, `claves_jugadores` | — | — | — | — (service role only) |

¹ Activating, closing or renaming a season is rejected by the `temporadas_proteger` trigger unless superadmin.
² A vote is valid only if the match is played, the voter is the logged-in player, he does not vote for himself, and the voted player was called up or played minutes.

**RPC functions** — `anon` can execute only `mvp_ranking(partido_id)`. `authenticated` can also
execute the role helpers used inside policies (`mi_rol`, `mi_jugador_id`, `is_admin`,
`is_superadmin`, `voto_valido`). `asignar_rol*` can only be run from the SQL editor or with
the service role (`scripts/auth-admin.mjs` on a trusted machine).

**Never** put the `service_role` / `sb_secret_…` key in Vercel, in a `VITE_` variable or in
`src/`. `src/lib/__tests__/secrets.test.js` fails the build if it appears.

## 4. Tests

- `supabase/tests/auth_rls.test.sql` — roles, profiles, votes, seasons, log (27 tests).
- `supabase/tests/permissions_matrix.test.sql` — insert/update/delete matrix for anon,
  jugador, admin and superadmin on all 14 tables, reads and privacy, vote rules, and structural
  checks: no write grants to anon, no `TRUNCATE/REFERENCES/TRIGGER`, only `mvp_ranking` callable
  by anon, RLS on every table, no unsafe views, no anon storage policies, no public buckets
  (198 tests).

## 5. Apply and verify in a test environment **before production**

### Option A — local database (recommended first)

Needs Docker Desktop running.

```bash
npx supabase start          # local Postgres + API with every migration applied
npm run test:db             # = supabase test db → must end with "All tests successful"
npm test                    # client tests (incl. no service_role in the frontend)
npx supabase stop
```

### Option B — staging Supabase project (same as production)

1. Create a second free project in Supabase, e.g. `cd-tembleque-staging`.
2. Copy production data if you want realistic data (optional):
   Dashboard → Database → Backups, or `npx supabase db dump --data-only -f prod-data.sql`
   against production and load it into staging.
3. Link and push the migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <STAGING_REF>
   npx supabase db push        # shows the pending migrations and applies them
   ```
4. Run the pgTAP tests against staging (everything runs inside a transaction and is rolled back):
   ```bash
   npx supabase test db --linked
   ```
5. Manual checks with the **anon** key (Settings → API). Each one must be rejected:
   ```bash
   URL=https://<STAGING_REF>.supabase.co
   KEY=<anon/publishable key>
   # write as a visitor → 401/403 "permission denied"
   curl -s -X POST "$URL/rest/v1/partidos" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
        -H "Content-Type: application/json" -d '{"jornada":99,"fecha":"2099-01-01","local":"X","visitante":"Y"}'
   # delete as a visitor → 401/403 (or [] with nothing deleted)
   curl -s -X DELETE "$URL/rest/v1/jugadores?id=gt.0" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: return=representation"
   # private data → "permission denied for table jugadores_privado"
   curl -s "$URL/rest/v1/jugadores_privado" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
   # individual votes hidden, totals public
   curl -s "$URL/rest/v1/votos_mvp" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
   curl -s -X POST "$URL/rest/v1/rpc/mvp_ranking" -H "apikey: $KEY" -H "Content-Type: application/json" -d '{"p_partido_id":1}'
   # public data still readable → JSON array
   curl -s "$URL/rest/v1/partidos?select=id,local,visitante&limit=3" -H "apikey: $KEY"
   ```
6. Deploy the branch as a Vercel **Preview** with the staging `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY`, create test accounts with `scripts/auth-admin.mjs` (pointing
   `scripts/.env.admin` at staging) and click through: public pages as a visitor, vote as a
   player, edit a match as admin, close a season as superadmin.

### Production

Only when staging is green:

1. Back up production (Dashboard → Database → Backups, or `supabase db dump`).
2. `npx supabase link --project-ref <PROD_REF>` → `npx supabase db push`
   (or paste the two migration files, in order, in the SQL editor).
3. Merge to `main` so Vercel deploys the matching frontend **right after** — the old frontend
   cannot write once the migrations are in.
4. Create the accounts (`node scripts/auth-admin.mjs user …`, `migrate-pins`), see
   [auth.md](auth.md).
5. Repeat the `curl` checks of step 5 against production.
6. In Supabase → Advisors → Security, confirm there are no RLS warnings.
