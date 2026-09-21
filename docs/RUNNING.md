# Running SIPPP · Inject

Step-by-step, from a clean machine to a reviewed inject. Every command below was run on
2026-09-21 against this repo **except step 2a** (the 1.3 GB dump restore), which was already done
on the development machine and is documented from the dump's format, not re-executed.

## 0. Prerequisites

| Need | Checked with | Notes |
|---|---|---|
| Node ≥ 20 (developed on 25.0) and npm | `node -v && npm -v` | |
| Docker with a Postgres 15 container | `docker ps \| grep postgres` | This project uses the existing `bitbybit-postgres` container (image `pgvector/pgvector:pg15`, port 5432, user `postgres`). Any Postgres ≥ 13 with `pg_trgm` works. |
| The legacy SIPPP dump | `sippp_2026-08-04 0143.sql` | Only for step 2a. |
| Pendampingan spreadsheets | `INJECT /CHEK-OK/*.xlsx` | Note the folder name ends with a space; quote the path. |

## 1. Install

```bash
git clone git@github.com:maulanaadil/sipp-crafting.git && cd sipp-crafting
npm ci
```

In Conductor this is the workspace **setup script**; it also tries step 3's migration and skips it
quietly if the database is not reachable.

## 2. Database

The app never alters legacy tables. It needs a database that *contains* the legacy SIPPP schema
(`public.*`) and adds its own tables in schema `inject`.

### 2a. Restore the legacy dump once → `sipppv2` (not re-run by the author of this doc)

```bash
docker exec bitbybit-postgres psql -U postgres -c "create database sipppv2"
docker exec -i bitbybit-postgres psql -U postgres -d sipppv2 < "/path/to/sippp_2026-08-04 0143.sql"
```

The file is a Navicat dump with one `INSERT` per row (~650k rows), so expect this to take a while.
Keep `sipppv2` pristine — it is the template for everything else.

### 2b. Clone it → `sippp_next` (seconds)

```bash
docker exec bitbybit-postgres psql -U postgres -c "create database sippp_next template sipppv2"
docker exec bitbybit-postgres psql -U postgres -d sippp_next \
  -c "create extension if not exists pg_trgm; create extension if not exists unaccent;"
```

`create database … template` fails with *"source database is being accessed by other users"* if
anything is connected to `sipppv2`; close those sessions first.

**Reset to a clean slate** at any time (drops every test inject):

```bash
docker exec bitbybit-postgres psql -U postgres -c "drop database sippp_next"
# then repeat 2b, 3 and 4
```

## 3. Environment and migrations

```bash
cp .env.local.example .env.local
```

Fill in:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgres://postgres:<password>@127.0.0.1:5432/sippp_next` — the password is the container's `POSTGRES_PASSWORD` (`docker inspect bitbybit-postgres --format '{{range .Config.Env}}{{println .}}{{end}}' \| grep POSTGRES_PASSWORD`) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `INJECT_TAHUN` | `2027` (spreadsheets say "Tahun 2026"; the data year is 2027) |
| `INJECT_SUGGESTER` | `rules` — local trigram matching. No LLM is wired; nothing leaves the machine. |

```bash
npm run db:migrate   # creates schema `inject`; safe to re-run
```

Expected: `migrations up to date (1 files, …)`.

## 4. A user to log in with

The dump's 122 users have unknown passwords, so create a local super-admin:

```bash
npm run db:seed      # safe to re-run; resets the password
```

Expected: `dev user ready: inject_dev / inject123 (userlevel 10 Pusat, role 10 Super Admin)`.
Local development only — never run this against a shared database.

## 5. Run

```bash
npm run dev -- --port 3000      # Conductor: press ▶ (uses $CONDUCTOR_PORT)
```

Open <http://localhost:3000> → redirected to `/login` → sign in with `inject_dev` / `inject123`.

Production-style run: `npm run build && npm run start -- --port 3000` (same `.env.local`; set
`NODE_ENV=production` so the session cookie is `Secure` — that requires HTTPS).

## 6. Use it

1. **Unggah dan periksa** — choose one pemda's `.xlsx` (start small: `94.04-260906b_Mimika_v1.xlsx`,
   38 rows). The pemda is detected from the *Pemda* column.
2. **Review** — every row is `update`, `insert`, `insert + RKPD` or `error`. Open a row to see what
   was matched, what will be written, and to fix a match (ticking *ingat pemetaan ini* saves it for
   later files).
3. **Setujui baris bersih** approves rows with no warnings; approve the rest one by one, or
   **Batalkan** to take a decision back.
4. **Tulis N baris ke SIPPP** → **Ya, tulis sekarang**. One transaction per click; if anything
   fails nothing is written. You can approve more rows and write again.

Nothing touches `trx_musrenbang_usulan`, `trx_musrenbang_usulan_sumberdana` or `trx_rkpd_<tahun>`
before step 4. Every write is recorded in `inject.audit_log` with before/after values.

## 7. Check your work

```bash
npm test                  # 31 unit tests, no database needed
npm run typecheck && npm run lint

# dry-run a file from the terminal (creates a batch, writes nothing to legacy tables)
npm run inject:cli -- "/path/to/INJECT /CHEK-OK/260917a_94.08-Deiyai_v1.xlsx"

# drive the real UI with Playwright; screenshots land in .context/
npx playwright install chromium --only-shell      # first time only
npx tsx --env-file=.env.local scripts/ui-smoke.ts "/path/to/file.xlsx"            # review only
npx tsx --env-file=.env.local scripts/ui-smoke.ts "/path/to/file.xlsx" --apply    # also writes
```

What an inject changed:

```bash
docker exec bitbybit-postgres psql -U postgres -d sippp_next -c \
  "select table_name, op, count(*) from inject.audit_log group by 1,2 order by 1,2"
```

Re-uploading a file that was already written should come back as `update · sudah sesuai` for every
row — that is the idempotency check.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `DATABASE_URL is not set` | `.env.local` missing, or a script was run without `--env-file=.env.local` (the `npm run` scripts add it). |
| `ECONNREFUSED 127.0.0.1:5432` | Container stopped: `docker start bitbybit-postgres`. |
| `relation "inject.batch" does not exist` | Run `npm run db:migrate`. |
| Login always fails | Run `npm run db:seed` — the user lives in `sippp_next` and disappears when the DB is recreated. |
| `SESSION_SECRET missing or too short` | Needs ≥ 32 characters. |
| Batch warning *"… belum punya data RKPD maupun usulan"* and every row `JADWAL_TIDAK_ADA` | That pemda was never pulled from SIPD (e.g. Kab. Sorong 96.01). Out of scope — see `docs/REMARKS.md` §6. |
| Red "1 Issue" bubble during the Playwright run | Next's dev overlay reacting to Playwright's injected `caret-color` style; not an app error. |

Pointing at another environment (e.g. SIPPP-DEV) only means changing `DATABASE_URL` and running
`npm run db:migrate` there — it adds the `inject` schema and nothing else. Do **not** run `db:seed`
there; log in with a real SIPPP account that has feature 5060 (*Update Pembahasan Usulan*).
