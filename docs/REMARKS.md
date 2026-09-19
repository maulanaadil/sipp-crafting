# Remarks — decisions, gaps and things to confirm

Status as of 2026-09-19. Scope: **inject module only** (Phase 1), per the WhatsApp discussion —
"main goalnya, bisa di inject ke dev tanpa ada error".

## Decisions taken (with the reason)

| # | Topic | Decision | Why |
|---|-------|----------|-----|
| 1 | Scope | Inject module first; the rest of SIPPP is not rebuilt yet. | Matches the stakeholder goal; the rest can follow on the same codebase. |
| 2 | Database | New DB `sippp_next` on the existing Postgres (`bitbybit-postgres`), cloned from the 4 Aug 2026 prod dump. Legacy tables are **not altered**; everything new lives in schema `inject`. | Output must stay injectable into SIPPP-DEV, which uses the legacy schema. |
| 3 | Previous inject script | **Not available** — no GitLab access. The contract was reverse-engineered from the data (Mimika/Deiyai rows vs. `trx_musrenbang_usulan`) and from `app/Libraries/SIPPP/Musrenbang/Usulan.php` (`saveUsulan`, `prosesMapingOtomatis`). If the original script surfaces, diff it against `docs/INJECT-CONTRACT.md`. | |
| 4 | "Usulan Daerah Tidak Selaras" | Stays `ref_status_musrenbang_id = 3` (DIREKOMENDASIKAN). Non-standard status texts ("USULAN PERBAIKAN", "USULAN BARU") also map to 3 with a `STATUS_TIDAK_BAKU` warning. | User decision. |
| 5 | Rows whose sub-kegiatan is not in the pemda's RKPD (806 of 5,864 across all files) | If the code is valid for the pemda type → action `insert_with_rkpd`: a `trx_rkpd_<tahun>` row is created (`namaaplikasi='SIPPP'`, `id_unik_sub_kegiatan=0`, `id_jadwal` copied from the pemda's SIPD rows) and then the usulan — exactly what legacy `saveUsulan()` does for "kegiatan baru". It is **never auto-approved**: the row is flagged `RKPD_BARU` and needs an explicit click. If the code is not valid for the pemda type (e.g. a provinsi-only code used by a kabupaten) → `error KODE_HANYA_UNTUK_PROVINSI`. | Same behaviour as the legacy form, but visible and confirmable. This is the source of the "unit skpd tidak bisa menggunakan kode sub" notes in *Rekap Status.xlsx*. |
| 6 | Kab. Sorong (96.01) and any pemda with no SIPD data | **Out of scope.** The dump has zero RKPD/usulan rows for 96.01, so all 197 rows would fail. Needs a SIPD pull (`/api/sipd/*` in the legacy app) with credentials we don't have. The tool reports this as a batch warning and `JADWAL_TIDAK_ADA` errors. | |
| 7 | AI / LLM | **No data leaves the machine.** Fuzzy matching is local trigram similarity (same maths as `pg_trgm`), behind the `Suggester` interface in `lib/inject/suggest.ts`. `INJECT_SUGGESTER=rules` (default) or `none`. An LLM backend can be added later once the stakeholder approves a provider; the review UI already shows method + confidence per field so the human stays in the loop. | Stakeholder restriction; the main PIC is "anti-AI". |
| 8 | Users/auth | Legacy `mst_users` + `ref_userrole.fitur_allowed` are reused (bcrypt `$2y$` verified with bcryptjs). Inject needs fitur **5060** (Update Pembahasan Usulan) or role 10. Provinsi/kabupaten users only see their own pemda. `npm run db:seed` creates a local super-admin because no legacy password is known. | User decision. |
| 9 | First dataset | Kab. Deiyai (94.08, 35 rows) — smallest file that still has update / insert / insert+RKPD rows. Mimika (94.04, 38 rows) is the second check. | "lowest scale of data". |

## Rules discovered in the data (not documented anywhere in the legacy app)

- Spreadsheets say "Tahun 2026" but every DB row is `tahun = 2027`; the tool defaults to `INJECT_TAHUN=2027`.
- `Kesepakatan Volume/Anggaran` == `volume_final / pagu_anggaran_final` (verified on Mimika: 30/30 matched rows).
- `ref_satuan_id` is NULL on **all** 11,925 legacy usulan rows; legacy never writes it on update, so the tool only sets it on inserts.
- `hasil_musrenbang` is stored as HTML (`<p>…</p>`); the tool compares on text and writes `Catatan Pembahasan` only when it differs / is empty.
- Sub-kegiatan code segment 4 encodes the pemda type: `x.xx.xx.1.xx.xxxx` provinsi, `x.xx.xx.2.xx.xxxx` kab/kota (`sipd_subkegiatan.jns_pemda`).
- Sub-program names are **not unique** (e.g. "Pengembangan Ekonomi Lokal di Daerah Tertinggal" exists under PP 7 and PP 8); the resolver picks the one under the resolved Program Percepatan.
- `Desk/Kelompok` vs `Misi`: Sehat → desk 1, Cerdas → desk 2, everything else is discussed at the Produktif desk. Mismatches are warned (`DESK_MISI_TIDAK_KONSISTEN`), not blocked.

## Known gaps / to confirm with the team

1. **Multi-source sumber dana** ("A|B", "A; B"): the spreadsheet has one Kesepakatan Anggaran per row and no split. The tool records the total on the first sumber dana and leaves the others with `keterangan = "Pembagian anggaran per sumber dana belum ditentukan (inject)"`, and warns `DANA_GANDA`. Confirm whether the pendampingan team wants an explicit split column in the template.
2. **`trx_jadwal_pemda`** progress flag (legacy `Jadwal::addJadwalPemda(... ref_jadwal_id 7)`) is not written by the inject — it only matters for the dashboard's "tahapan" indicator. Easy to add if wanted.
3. **`ref_status_usulan_id` for new rows** is set to 3 (Usulan disetujui) because they come out of pendampingan already agreed; legacy auto-mapping uses 4 for "not yet proposed". Confirm.
4. **Kategori Usulan** is free text (11 variants incl. "Melaksanakan Lomba Menu B2SA…"); it is shown but not stored anywhere in the legacy schema.
5. **Suspicious numbers** (e.g. Deiyai row "Operasional Pelayanan Puskesmas", anggaran = 1) are warned (`ANGGARAN_MENCURIGAKAN`) and left for the operator; they are never auto-corrected.
6. The raw (non `CHEK-OK`) files were not used; `CHEK-OK/` is treated as the canonical input. The tool handles the differences seen in raw files (extra blank columns, "Desk/Kelompok" header variant, trailing spaces, Indonesian number formats, sheet name "Data Hasil Pendampingan" without "Selaras").
7. No SIPD API integration, no Berita Acara, no export of a "CHEK-OK"-style workbook (yet).
