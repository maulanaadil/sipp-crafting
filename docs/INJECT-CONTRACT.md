# Inject contract — spreadsheet row → SIPPP tables

Source: `Pendampingan Perbaikan Hasil Evaluasi Pelaksanaan Musrenbang Otsus` workbooks
(3 sheets: `Data Musrenbang Otsus Selaras`, `Data Hasil Pendampingan Selaras`, `Usulan Daerah Tidak Selaras`).
Target: legacy SIPPP Postgres, `tahun = 2027`.

## Pipeline

```
xlsx ─parse─▶ RawRow ─normalize─▶ Normalized ─resolve─▶ Resolved ─classify─▶ Plan ─(review)─▶ apply
```

| Stage | File | Notes |
|---|---|---|
| parse | `lib/inject/parse.ts` | header detected by normalised names (≥10 hits), rich text / formulas flattened, blank & repeated-header rows skipped |
| normalize | `lib/inject/resolve.ts#normalizeRow` | trim/collapse, `1.02.02.2.01.0006 ` → code, `5.132.781.183,00` → 5132781183, `1,5` → 1.5, sumber dana split on `|` / `;` |
| resolve | `lib/inject/resolve.ts#resolveRow` | exact → normalised → saved alias → fuzzy (trigram ≥ 0.92 auto, ≥ 0.55 suggested) |
| classify | `lib/inject/classify.ts` | update / insert / insert_with_rkpd / error + field diff |
| apply | `lib/inject/apply.ts` | one transaction per batch, audit before/after in `inject.audit_log` |

## Column mapping

| Spreadsheet column | Resolved against | Written to |
|---|---|---|
| Pemda | `mst_daerah` (prefix-aware: Kab./Kota/Provinsi, bare name = provinsi) | `pemda_kode` — one pemda per batch |
| Unit SKPD | `sipd_skpd` (`kode_daerah`, `tahun`) by `nama_unit_skpd` | `unitskpd_kode`, `sipd_skpd_id` |
| Kode Sub Kegiatan | `sipd_subkegiatan` (`tahun`, `jns_pemda` must match pemda type) | `subkegiatan_kode` |
| Desk/ Kelompok | `ref_kelompok` | `ref_kelompok_id` |
| Misi / Program Percepatan / Sub Program Percepatan | `mst_misi`, `mst_program_percepatan`, `mst_subprogram_percepatan` (parents derived from children) | `mst_misi_id`, `mst_program_percepatan_id`, `mst_subprogram_percepatan_id` (+ `sippp*kode` on the RKPD row) |
| Status | `ref_status_musrenbang` (default 3) | `ref_status_musrenbang_id` |
| Kesepakatan Sumber Dana | `ref_dana_otsus.nama_subdana`, then `sipd_sumber_dana.nama` | `kodesumberdana` / `namasumberdana` (pipe-joined) + `trx_musrenbang_usulan_sumberdana` rows |
| Kesepakatan Volume | number | `volume_final`, `volume_akhir` (insert: also `volume`, `volume_usulan`) |
| Satuan | `ref_satuan` | `ref_satuan_id` — **inserts only** |
| Kesepakatan Anggaran | number | `pagu_anggaran_final`, `pagu_anggaran_akhir` (insert: also `pagu_anggaran`, `pagu_anggaran_usulan`) |
| Catatan Pembahasan | text | `hasil_musrenbang` as `<p>…</p>` when it differs |
| No, Program, Kegiatan, Sub Kegiatan (name), Kategori Usulan | display / consistency warnings only | — |

## Classification

Match key: `(pemda_kode, unitskpd_kode, subkegiatan_kode)` for `tahun`.

| Situation | Action | Auto-approvable? |
|---|---|---|
| existing `trx_musrenbang_usulan` row | `update` (only changed columns; `noop` when identical) | yes, if no warning and no fuzzy match |
| no usulan, `(unit, kode)` exists in `trx_rkpd_<tahun>` | `insert` with `trx_rkpd_id` link, `id = 16 hex`, `ref_status_usulan_id = 3` | no — flagged `USULAN_BARU` |
| not in RKPD, code valid for pemda type, SIPD `id_jadwal` known | `insert_with_rkpd` (RKPD row `namaaplikasi='SIPPP'` first) | no — flagged `RKPD_BARU` |
| anything blocking | `error` | never written |

`volume_akhir / pagu_anggaran_akhir` follow legacy: status 1 (BELUM TERBAHAS) → copy of usulan values, status 2/3 → copy of final values.

## Issue codes

| Level | Code | Meaning |
|---|---|---|
| error | `PEMDA_TIDAK_DIKENAL`, `PEMDA_BEDA` | Pemda unknown / row belongs to another pemda than the batch |
| error | `SKPD_KOSONG`, `SKPD_TIDAK_DIKENAL` | Unit SKPD missing / not in `sipd_skpd` for this pemda (candidates offered) |
| error | `KODE_KOSONG`, `KODE_FORMAT_SALAH`, `KODE_TIDAK_DIKENAL` | Sub-kegiatan code missing / malformed / not in nomenklatur |
| error | `KODE_HANYA_UNTUK_PROVINSI`, `KODE_HANYA_UNTUK_KABKOTA` | Code exists but for the other pemda type |
| error | `DESK_TIDAK_DIKENAL` | Desk/Kelompok not one of the three desks |
| error | `ANGGARAN_KOSONG`, `VOLUME_KOSONG` | Not numeric |
| error | `USULAN_GANDA` | More than one existing usulan matches — manual pick needed |
| error | `JADWAL_TIDAK_ADA` | Pemda has no SIPD RKPD rows at all; RKPD row cannot be created |
| warn | `RKPD_BARU`, `RKPD_GANDA` | New RKPD row will be created / several RKPD rows matched |
| warn | `STATUS_TIDAK_BAKU`, `RIPPP_TIDAK_DIKENAL`, `SPP_BUKAN_ANAK_PP`, `PP_BUKAN_ANAK_MISI`, `DESK_MISI_TIDAK_KONSISTEN` | Text/consistency issues in the RIPPP columns |
| warn | `SATUAN_TIDAK_DIKENAL`, `NAMA_SUBKEGIATAN_BEDA` | Reference mismatches that don't block |
| warn | `DANA_KOSONG`, `DANA_TIDAK_DIKENAL`, `DANA_GANDA`, `BUKAN_DANA_OTSUS` | Sumber dana issues |
| warn | `ANGGARAN_MENCURIGAKAN` (< Rp 1.000.000), `VOLUME_NOL` | Suspicious numbers |
| info | `FUZZY`, `KODE_DIBERSIHKAN`, `SUDAH_SESUAI`, `USULAN_BARU`, `PEMDA_KOSONG` | Informational |

Any `warn` or fuzzy match sets `needs_review = true`; those rows are excluded from "Setujui baris bersih".

## Learning

When an operator overrides a field and leaves "ingat pemetaan ini" ticked, the pair
`(kind, scope, normalised source text) → target` is stored in `inject.alias` and used as an exact
match (`method = alias`) for every later batch. SKPD aliases are scoped per pemda; the rest are global.

## Measured on the 34 `CHEK-OK` files (2026-09-19, before any inject)

5,864 rows → 4,817 update · 241 insert · 806 insert_with_rkpd/error · 40 unresolvable SKPD names ·
Kab. Sorong 96.01 has no DB data (197 rows blocked).
