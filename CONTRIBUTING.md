# Contributing

## Branches

| Branch | Purpose | Deploys to |
| --- | --- | --- |
| `main` | Always stable, what fans see. Protected: no direct pushes. | Vercel **Production** |
| `develop` | Integration branch for the next release. | Vercel **Preview** (staging URL) |
| `feature/<short-name>` | New functionality, from `develop`. | Preview per PR |
| `fix/<short-name>` | Bug fix, from `develop`. | Preview per PR |
| `hotfix/<short-name>` | Urgent production fix, from `main`, merged into `main` **and** `develop`. | Preview per PR |
| `chore/<short-name>`, `docs/<short-name>` | Tooling, dependencies, docs. | Preview per PR |

Names are lowercase and kebab-case: `feature/match-timeline`, `fix/minutes-added-time`.

### Day-to-day flow

```bash
git switch develop && git pull
git switch -c feature/league-table
# …work, commit small steps…
git push -u origin feature/league-table
# open a PR into develop → review the Vercel preview → squash & merge
```

Release: open a PR `develop → main` titled `release: v1.1.0`, merge it, then tag:

```bash
git switch main && git pull
git tag -a v1.1.0 -m "v1.1.0" && git push --tags
```

### GitHub settings (once)

- Settings › Branches › add rules for `main` (and `develop`): require a pull request,
  require the **CI** check to pass, disallow force pushes.
- Settings › General › Pull Requests: allow **squash merging** only, enable
  "Automatically delete head branches".

## Commits — Conventional Commits

Format: `<type>(<optional scope>): <imperative summary, lowercase, no period>`

| Type | Use for |
| --- | --- |
| `feat` | New functionality for users |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `style` | Visual / CSS only, or formatting |
| `perf` | Performance |
| `test` | Adding or fixing tests |
| `docs` | README, comments, docs |
| `chore` | Tooling, config, dependencies |
| `ci` | GitHub Actions |
| `db` | Supabase migrations (`db: add eventos_partido table`) |

Rules of thumb:

- **One logical change per commit.** If the summary needs "and", split it.
- Commit whenever something works and could be reverted on its own: a component, a migration,
  a bug fix plus its test.
- Summary ≤ 72 characters, imperative mood ("add", not "added").
- Use the body to explain *why*, and `BREAKING CHANGE:` when a migration or env var change is
  required.
- Never commit `.env*` files, Supabase `.temp/` or `snippets/`, or real passwords.

Examples:

```
feat(timeline): add minute-by-minute events to match detail
feat(stats): compute minutes played from lineup and substitutions
fix(table): apply head-to-head only when both legs are played
db: add equipos_liga and partidos_liga tables
style(theme): switch palette to club blue and navy
chore(deps): bump vite to 5.4
docs(readme): document Supabase setup
```

## Database changes

The schema lives in `supabase/migrations/`. Never edit an applied migration — create a new one:

```bash
npx supabase migration new add_player_nationality
# edit the generated SQL, then
npx supabase db push
```

Commit the migration together with the code that uses it.

## Before opening a PR

- `npm test` and `npm run build` pass.
- Checked on a 390px wide screen.
- No `console.log` left behind.

## Icons

- No emojis in the interface: they look different on iOS, Android and Windows. Use `<Icon name="…" />` (`src/components/Icon.jsx`), which draws SVG icons from **Tabler Icons** (MIT) in the text colour.
- The available icons are in `src/lib/icons.js`. To add one, find it on https://tabler.io/icons and copy its `<path d="…">` values in the same format.
- For statistics (goals, assists, cards…) use `<StatIcon stat="goles" />` from `EventIcons.jsx`, so each stat always has the same icon.
- Icon-only buttons need an `aria-label`. `icons.test.js` fails if an emoji or an unknown icon name shows up.
