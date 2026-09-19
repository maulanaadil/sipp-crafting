import type { RefData, Usulan } from "./reference";
import { htmlToText, textToHtml } from "./text";
import type { Action, ClassifiedRow, FieldChange, Issue, Normalized, Overrides, Plan, RawRow, Resolved } from "./types";

/**
 * Decide what a resolved row means for the legacy tables and produce the exact write plan.
 *
 *   update            – (unit SKPD, kode) already exists in trx_musrenbang_usulan for this pemda/tahun
 *   insert            – not an usulan yet, but the sub-kegiatan is in the pemda's trx_rkpd_<tahun>
 *   insert_with_rkpd  – not in RKPD either; code is valid for this pemda type → create RKPD row + usulan
 *                       (mirrors legacy Usulan::saveUsulan "jika kegiatan baru belum ada di rancangan awal")
 *   error             – anything blocking above
 */
export function classifyRow(
  raw: RawRow,
  normalized: Normalized,
  resolved: Resolved,
  issues: Issue[],
  ref: RefData,
  overrides: Overrides = {},
): ClassifiedRow {
  const errors = issues.filter((i) => i.level === "error");
  const anggaran = overrides.anggaran ?? normalized.anggaran;
  const volume = overrides.volume ?? normalized.volume;

  const dana = resolved.dana
    .filter((d) => d.value)
    .map((d) => ({ kode: d.value as string, nama: ref.dana.find((x) => x.kode === d.value)?.nama ?? d.label ?? d.value! }));

  const base: Omit<Plan, "action" | "noop"> = { changes: {}, dana };
  const fail = (extra: Issue[] = []): ClassifiedRow => ({
    raw,
    normalized,
    resolved,
    action: "error",
    issues: [...issues, ...extra],
    plan: { ...base, action: "error", noop: true },
    needsReview: true,
  });

  if (errors.length) return fail();
  const unit = resolved.unitSkpdKode.value!;
  const kode = resolved.subkegiatanKode.value!;

  /* 1. existing usulan? */
  const matches = ref.usulan.filter((u) => u.unitskpdKode === unit && u.subkegiatanKode === kode);
  if (matches.length > 1) {
    return fail([
      {
        level: "error",
        code: "USULAN_GANDA",
        message: `Ada ${matches.length} usulan dengan unit SKPD dan kode yang sama (${matches.map((m) => m.id).join(", ")}); perlu dipilih manual.`,
      },
    ]);
  }
  const catatanHtml = normalized.catatan ? textToHtml(normalized.catatan) : null;

  if (matches.length === 1) {
    const u = matches[0];
    const changes = diffUsulan(u, resolved, anggaran!, volume!, dana, catatanHtml);
    const noop = Object.keys(changes).length === 0;
    return finish("update", {
      ...base,
      usulanId: u.id,
      rkpdId: u.rkpdId ?? undefined,
      changes,
    }, noop, [...issues, ...(noop ? [{ level: "info", code: "SUDAH_SESUAI", message: "Data di database sudah sama dengan file." } as Issue] : [])]);
  }

  /* 2. RKPD row to attach to? */
  const rkpd = ref.rkpd.filter((r) => r.kodeUnitSkpd === unit && r.kodeSubkegiatan === kode);
  const insertRow = buildInsert(resolved, anggaran!, volume!, dana, catatanHtml, ref);

  if (rkpd.length >= 1) {
    if (rkpd.length > 1)
      issues = [...issues, { level: "warn", code: "RKPD_GANDA", message: `${rkpd.length} baris RKPD cocok; dipakai id ${rkpd[0].id}.` }];
    return finish("insert", { ...base, rkpdId: rkpd[0].id, insert: { ...insertRow, trx_rkpd_id: rkpd[0].id } }, false, [
      ...issues,
      { level: "info", code: "USULAN_BARU", message: "Belum ada usulan; akan dibuat usulan baru dari baris RKPD yang ada." },
    ]);
  }

  /* 3. valid code but not in this pemda's RKPD → create the RKPD row first (needs SIPD jadwal) */
  if (!ref.rkpdTemplate?.idJadwal) {
    return fail([
      {
        level: "error",
        code: "JADWAL_TIDAK_ADA",
        message: `Sub kegiatan ${kode} belum ada di RKPD ${ref.pemda.nama} dan RKPD pemda ini belum pernah ditarik dari SIPD, sehingga baris RKPD baru tidak bisa dibuat.`,
      },
    ]);
  }
  return finish("insert_with_rkpd", { ...base, insert: insertRow }, false, [
    ...issues,
    {
      level: "warn",
      code: "RKPD_BARU",
      message: `Unit SKPD ini belum punya sub kegiatan ${kode} di RKPD ${ref.tahun}; baris RKPD baru (namaaplikasi=SIPPP) akan dibuat lalu usulan dibuat. Perlu konfirmasi.`,
    },
  ]);

  function finish(action: Action, plan: Omit<Plan, "action" | "noop">, noop: boolean, all: Issue[]): ClassifiedRow {
    const needsReview =
      action !== "update" ||
      all.some((i) => i.level === "warn") ||
      all.some((i) => i.code === "FUZZY") ||
      Object.values(resolved).some((r) => Array.isArray(r) ? r.some((x) => x.method === "fuzzy") : r.method === "fuzzy");
    return { raw, normalized, resolved, action, issues: all, plan: { ...plan, action, noop }, needsReview };
  }
}

/** Columns of trx_musrenbang_usulan an inject is allowed to change on an existing row. */
function diffUsulan(
  u: Usulan,
  r: Resolved,
  anggaran: number,
  volume: number,
  dana: { kode: string; nama: string }[],
  catatanHtml: string | null,
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  const set = (col: string, from: unknown, to: unknown) => {
    if (to === undefined) return;
    if (numEq(from, to) || from === to) return;
    changes[col] = { from, to };
  };
  const status = r.statusMusrenbangId.value ?? 3;

  set("mst_misi_id", u.misiId, r.misiId.value ?? u.misiId);
  set("mst_program_percepatan_id", u.ppId, r.programPercepatanId.value ?? u.ppId);
  set("mst_subprogram_percepatan_id", u.sppId, r.subProgramPercepatanId.value ?? u.sppId);
  set("ref_kelompok_id", u.kelompokId, r.kelompokId.value ?? u.kelompokId);
  set("ref_status_musrenbang_id", u.statusMusrenbangId, status);
  set("volume_final", u.volumeFinal, volume);
  set("pagu_anggaran_final", u.paguAnggaranFinal, anggaran);
  // legacy rule: DIREKOMENDASIKAN / TIDAK → akhir = final; BELUM TERBAHAS → akhir = usulan
  if (status === 1) {
    set("volume_akhir", u.volumeAkhir, u.volume ?? volume);
    set("pagu_anggaran_akhir", u.paguAnggaranAkhir, u.paguAnggaran ?? anggaran);
  } else {
    set("volume_akhir", u.volumeAkhir, volume);
    set("pagu_anggaran_akhir", u.paguAnggaranAkhir, anggaran);
  }
  // ref_satuan_id is deliberately NOT updated: legacy never writes it on existing rows (NULL on all 11,925
  // prod rows; satuan lives on trx_rkpd.satuanindikatorsubkegiatan). It is only set on inserts.
  if (dana.length) {
    set("kodesumberdana", u.kodesumberdana, dana.map((d) => d.kode).join("|"));
    set("namasumberdana", u.namasumberdana, dana.map((d) => d.nama).join("|"));
  }
  if (catatanHtml && htmlToText(u.hasilMusrenbang) !== htmlToText(catatanHtml)) {
    changes.hasil_musrenbang = { from: u.hasilMusrenbang, to: catatanHtml };
  }
  return changes;
}

function buildInsert(
  r: Resolved,
  anggaran: number,
  volume: number,
  dana: { kode: string; nama: string }[],
  catatanHtml: string | null,
  ref: RefData,
): Record<string, unknown> {
  const status = r.statusMusrenbangId.value ?? 3;
  const sub = ref.subkegiatan.get(r.subkegiatanKode.value!)?.[0];
  return {
    tahun: ref.tahun,
    pemda_kode: ref.pemda.kode,
    subkegiatan_kode: r.subkegiatanKode.value,
    unitskpd_kode: r.unitSkpdKode.value,
    mst_misi_id: r.misiId.value,
    mst_program_percepatan_id: r.programPercepatanId.value,
    mst_subprogram_percepatan_id: r.subProgramPercepatanId.value,
    // 3 = "Usulan disetujui": the row comes out of pendampingan already agreed
    ref_status_usulan_id: 3,
    ref_status_musrenbang_id: status,
    ref_kelompok_id: r.kelompokId.value,
    volume,
    ref_satuan_id: r.satuanId.value ?? sub?.refSatuanId ?? null,
    pagu_anggaran: anggaran,
    volume_usulan: volume,
    pagu_anggaran_usulan: anggaran,
    volume_final: volume,
    pagu_anggaran_final: anggaran,
    volume_akhir: volume,
    pagu_anggaran_akhir: anggaran,
    kodesumberdana: dana.map((d) => d.kode).join("|") || null,
    namasumberdana: dana.map((d) => d.nama).join("|") || null,
    hasil_musrenbang: catatanHtml,
    sipd_skpd_id: ref.skpd.find((s) => s.kodeUnit === r.unitSkpdKode.value)?.idSkpd ?? null,
  };
}

function numEq(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number" || (typeof a === "string" && typeof b === "string" && a !== "" && !isNaN(Number(a)) && !isNaN(Number(b)))) {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isNaN(na) || Number.isNaN(nb)) return false;
    // float4 columns (volume) lose precision; compare loosely
    return Math.abs(na - nb) <= Math.max(1e-6, Math.abs(na) * 1e-6);
  }
  return false;
}
