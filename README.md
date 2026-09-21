# SIPPP · Inject

Rebuild of the SIPPP (Bappenas, Musrenbang Otsus Papua) **inject** flow in Next.js: upload a
pendampingan spreadsheet, get every row cleaned, matched against the legacy tables and classified
(update / insert / insert + RKPD / error), review it, then write it — nothing touches the legacy
tables until an operator approves and presses *Terapkan*.

- **How to run it, step by step: [`docs/RUNNING.md`](docs/RUNNING.md)**
- Contract & rules: [`docs/INJECT-CONTRACT.md`](docs/INJECT-CONTRACT.md)
- Decisions, gaps, things to confirm: [`docs/REMARKS.md`](docs/REMARKS.md)

## Setup (local)

Requirements: Node ≥ 20, Docker Postgres `bitbybit-postgres` (pg15) with database `sippp_next`
cloned from the legacy `sipppv2` dump (`create database sippp_next template sipppv2; create extension pg_trgm;`).

```bash
npm ci
cp .env.local.example .env.local   # or ask a teammate; see variables below
npm run db:migrate                 # creates schema `inject`
npm run db:seed                    # local super-admin: inject_dev / inject123
npm run dev -- --port 3000
```

`.env.local`

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgres://postgres:<pw>@127.0.0.1:5432/sippp_next` |
| `SESSION_SECRET` | ≥ 32 random chars, signs the session cookie |
| `INJECT_TAHUN` | RKPD year the spreadsheets belong to (2027) |
| `INJECT_SUGGESTER` | `rules` (local trigram, default) or `none`. No LLM is wired; nothing leaves the machine. |
| `DEV_ADMIN_USERNAME` / `DEV_ADMIN_PASSWORD` | credentials created by `db:seed` |

## Commands

| Command | What |
|---|---|
| `npm test` | unit tests for the pipeline (no DB needed) |
| `npm run typecheck` / `npm run lint` | |
| `npm run inject:cli -- "<file.xlsx>" [--pemda 94.08]` | dry-run a spreadsheet, prints the review table, creates a batch (writes nothing to legacy tables) |
| `npx tsx --env-file=.env.local scripts/ui-smoke.ts "<file.xlsx>" [--apply]` | drives the real UI with Playwright, screenshots into `.context/` |

## Layout

```
app/(auth)/login          legacy mst_users login (bcrypt $2y$), JWT cookie
app/(app)/inject          batch list + upload; [batchId] review & apply
lib/inject/parse.ts       xlsx → rows            lib/inject/resolve.ts   names → ids (exact/alias/fuzzy)
lib/inject/classify.ts    update/insert/error    lib/inject/apply.ts     transactional writes + audit
lib/inject/store.ts       inject.* persistence   lib/inject/suggest.ts   pluggable fuzzy backend
db/migrations             schema `inject` (batch, row, alias, audit_log)
```
