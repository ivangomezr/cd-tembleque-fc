# Data validation

Every write is checked in three layers:

1. **Form** (instant feedback): `src/lib/validation.js`, the same rules the database applies.
2. **Store** (`src/lib/store.js`): every write method runs the validator before calling Supabase,
   so no screen can skip it.
3. **Database** (the real barrier, also for direct API calls):
   `supabase/migrations/20261017180000_data_integrity.sql` — CHECK constraints, foreign keys,
   unique indexes and validation triggers.

The JS rules and the SQL rules are kept in sync by tests (`validation.test.js` compares lists
with the migration and the UI; `dbErrors.test.js` checks that every constraint has a message).

## Audit: where the app writes

| Table | Written from | Before | Now enforced by the database |
| --- | --- | --- | --- |
| `jugadores` | Admin › Plantilla, Plantilla (edit) | Name not blank; dorsal clash only checked in the browser | Name 1-60 chars, no control chars · position required and known · dorsal 1-99, unique among active players · known status · photo must be https |
| `jugadores_privado` | Plantilla (edit) | — | Note ≤ 280 chars |
| `temporadas` | Admin › Temporada, Liga › Zonas | — | Name required and unique · year 2000-2100 · places 0-30 · match length 1-120 · changing the year cannot leave matches outside the season |
| `equipos_liga` | Liga › Equipos | Name not blank / unique (browser) | Name unique per season (case-insensitive) · short name ≤ 16 · sanction 0-99 · one own team per season · the own team cannot be renamed, deleted or changed · a rival with matches against the club cannot be deleted |
| `partidos_liga` | Liga › Jornadas | Teams differ, own team excluded, once per matchday (browser) | All of that, plus: both teams from the same season · each home/away pair once per season · goals 0-99 · matchday 1-99 · date inside the season · not "played" with a future date |
| `partidos` | Admin › Partidos, match page (kit, call-up, MVP) | Date/time/rival/field required, matchday unique (browser) | One side is the club, the rival is a team of the group (league) · matchday 1-99 and unique (friendlies: 0) · the rival has no other game that matchday · date inside the season · HH:MM time · goals 0-99 · not "played" before kick-off · call-up is a list of ≤ 50 distinct existing players · nobody with lineup/events/stats can be dropped from it · MVP only in a played match and among participants · score cannot go below the goals already credited (no timeline) |
| `alineaciones` | Match page › Alineación / Convocatoria | — | Known formation · ≤ 11 slots `{linea, posicion, jugador_id}` with no extra keys · no duplicate player or slot · players exist and are called up · cannot contradict the timeline |
| `eventos_partido` | Match page › Cronología | Minute 1-130 and player selected (browser) | Match has kicked off · minute 1-90 in league (1-120 friendlies), added time 0-15 only at 45+ / 90+ · who must/must not be filled in per event type · players called up · **order of the match** (below) · deleting an event cannot break the order |
| `estadisticas` | Recalculated by the app; Admin › Stats (manual) | Sum of goals/assists vs score (browser, no timeline) | Counters 0-99 · max 2 yellows and 1 red, 2 yellows ⇒ red · minutes ≤ match length, 0 if not played · only called-up players score anything · `titular` only if in the lineup · minutes only for starters or players who came on · **with a timeline, goals/assists/cards must match it** · without one, sums ≤ the club's goals · goals conceded ≤ rival goals |
| `votos_mvp` | Match page › MVP | RLS (identity, played match, participant) | Plus: active voter, friendly messages · one vote per player and match (unique) |
| `patrocinadores` | Patrocinadores | — | Name ≤ 80 · image must be https |

The season of lineups, events, stats and votes is copied from their match by a trigger, so it
cannot be faked. Deleting a player removes him from call-ups and lineups (events keep the
minute but lose the name, and his stats go with him).

### Order of the match (timeline replay)

Events are replayed in order (minute, added time, creation):

- Nobody appears after being sent off (the same minute is allowed).
- A second yellow must be recorded as **2ª amarilla** after one **amarilla**; nobody is sent off twice.
- When the starting XI is saved: the player going off must be on the pitch and the one coming on
  must not; scorers, assisters and penalty takers must be playing at that minute.
- Cards may go to substitutes on the bench.

## Decisions on ambiguous rules

| Question | Decision | Why |
| --- | --- | --- |
| Is the shirt number required? | **No**, optional, but 1-99 and unique among active players when set. | The model allowed `null` and new signings may not have one yet. 1-99 is what the shirt drawing supports. |
| Which dates belong to a season? | **`año − 1` … `año + 1`**. | The season only stores a year, and it is not defined whether 2026 means the 2026/27 season starting in 2026 or ending in 2026. The window accepts both and still catches typos like 2062. |
| Are minutes above 90 valid? | League: **no**, write `90+3`. Friendlies: up to 120 (extra time). Added time only at the end of each half, max 15. | League matches have no extra time, and the app already caps minutes played at the match length. |
| Must the timeline match the final score? | **No.** The timeline may be partial; the match page shows the existing "doesn't match the score" warning. | Admins often enter the score first and the timeline later (or only the goals). Requiring equality would block normal use. |
| Limit on substitutions? Re-entry after being substituted? | **Not enforced.** | The model does not store the competition's substitution rules, and the minutes calculation already supports re-entry. |
| Who may vote for MVP? | Any **active** player with an account, for a teammate called up or with minutes, never himself, one vote per match. Not limited to called-up voters. | The previous model allowed any linked player; restricting voters to the call-up is a club decision, not something the data implies. |
| Voting deadline? | **None.** | Not in the model. Easy to add later (e.g. 7 days after the match). |
| Goals in a match not marked as played? | Kept, but ignored by the table and stats. | Unticking "played" by mistake should not wipe the score. |
| Stats rows for players not called up? | Allowed only if everything is 0. | The recalculation keeps empty rows of players removed from the call-up. |
| Places (ascenso + promoción + descenso) vs number of teams? | Checked in the app only. | Teams are often added after setting up the season; the database would block that order of work. |
| Images as `data:` URLs? | Rejected by the database (local demo mode still allows them). | They bloat the database; production uploads go to Cloudinary. |
| Old rows that break a new rule? | The migration does **not** change or delete them. CHECK rules are added `NOT VALID` and validated when possible; editing such a row asks to fix it. Duplicates (dorsal, matchday, team names, fixtures) stop the migration until fixed. | No destructive changes to club data. |

## "Played" ticked automatically

When the admin opens or creates a match whose kick-off plus match length has passed (league
fixtures without time: from the next day), the **Partido jugado** box is ticked automatically
and a note asks to check the score. Saving with an untouched 0-0 asks for confirmation.

It is **not** done by the database on its own: marking a match as played without a score would
put a 0-0 in the table and add minutes to the starting XI. Doing it in the form keeps a person
in the loop, while the database still refuses "played" for matches that have not started.

## Errors shown to users

- Rules checked by triggers fail with SQLSTATE **`CD400`**; their messages are written for users
  (Spanish, with names and minutes, no table names).
- Constraint violations are translated by name in `src/lib/dbErrors.js`.
- Anything else shows a generic message. The raw error only goes to the browser console.
  The error toast (`ErrorToast`) shows only messages marked as safe.

## Apply and verify (test environment first)

1. **Check existing data** — in the SQL editor of the project (staging first), run
   `supabase/checks/data_integrity_preflight.sql`. Fix anything marked **BLOQUEA**.
   **AVISO** rows can stay; you will be asked to fix them when you edit them.
2. **Apply** — `npx supabase db push` (or paste `20261017180000_data_integrity.sql` into the
   SQL editor and run it). If old rows break a rule, you get a *WARNING* naming it; that is fine.
3. **Test** — `npx supabase start && npm run test:db` locally (or `npx supabase test db --linked`
   against staging) and `npm test`. All suites must pass:
   `auth_rls`, `permissions_matrix`, `data_integrity`.
4. **Try it in the app** (Vercel Preview pointing at staging): add a player with dorsal 100,
   a yellow card in minute 95, a second plain yellow to the same player, a match dated last week.
   Each one must show a clear message (or tick "played" automatically for the last one).
5. **Production** — run the preflight again, apply the migration, deploy the frontend.
