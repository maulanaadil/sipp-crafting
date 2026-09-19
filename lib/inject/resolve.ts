import type { Daerah, RefData } from "./reference";
import { requiredJenis } from "./reference";
import { getSuggester, type Suggester } from "./suggest";
import { clean, kodeJenisPemda, norm, normKode, parseIdNumber } from "./text";
import type { Candidate, Issue, Normalized, Overrides, RawRow, Resolution, Resolved } from "./types";

/** Fuzzy score at/above which a match is taken without asking (still shown as "fuzzy"). */
export const AUTO_ACCEPT = 0.92;
/** Below this we don't even offer a candidate. */
export const SUGGEST_MIN = 0.55;

const none = <T>(candidates: Candidate<T>[] = []): Resolution<T> => ({
  value: null,
  label: null,
  method: "none",
  confidence: 0,
  candidates,
});
const hit = <T>(value: T, label: string, method: Resolution<T>["method"], confidence = 1, candidates: Candidate<T>[] = []): Resolution<T> => ({
  value,
  label,
  method,
  confidence,
  candidates,
});

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

export function normalizeRow(raw: RawRow): Normalized {
  const c = raw.cells;
  const danaRaw = clean(c.sumberDana);
  return {
    status: clean(c.status)?.toUpperCase() ?? null,
    desk: clean(c.desk)?.toUpperCase() ?? null,
    misi: clean(c.misi),
    programPercepatan: clean(c.programPercepatan),
    subProgramPercepatan: clean(c.subProgramPercepatan),
    pemda: clean(c.pemda),
    unitSkpd: clean(c.unitSkpd),
    kodeSubKegiatan: normKode(c.kodeSubKegiatan),
    subKegiatan: clean(c.subKegiatan),
    sumberDana: danaRaw
      ? danaRaw
          .split(/\s*[|;]\s*/)
          .map((s) => s.replace(/[,\s]+$/, "").trim())
          .filter(Boolean)
      : [],
    volume: parseIdNumber(c.volume),
    satuan: clean(c.satuan),
    anggaran: parseIdNumber(c.anggaran),
    kategoriUsulan: clean(c.kategoriUsulan),
    catatan: clean(c.catatan),
  };
}

/* ------------------------------------------------------------------ */
/* Generic name → id resolution: exact → alias → fuzzy                 */
/* ------------------------------------------------------------------ */

function resolveNamed<T extends string | number>(
  query: string | null,
  candidates: { value: T; label: string }[],
  opts: { aliases?: Map<string, T>; suggester: Suggester; autoAccept?: number },
): Resolution<T> {
  if (!query) return none();
  const q = norm(query);
  const exact = candidates.find((c) => norm(c.label) === q);
  if (exact) return hit(exact.value, exact.label, norm(query) === query.toLowerCase().trim() ? "exact" : "normalized");

  const aliased = opts.aliases?.get(q);
  if (aliased !== undefined) {
    const c = candidates.find((x) => String(x.value) === String(aliased));
    if (c) return hit(c.value, c.label, "alias");
  }

  const ranked = opts.suggester.suggest(query, candidates, SUGGEST_MIN);
  if (ranked.length && ranked[0].score >= (opts.autoAccept ?? AUTO_ACCEPT)) {
    return hit(ranked[0].value, ranked[0].label, "fuzzy", ranked[0].score, ranked);
  }
  return none(ranked);
}

function aliasMap<T extends string | number>(ref: RefData, kind: string, cast: (s: string) => T): Map<string, T> {
  const m = new Map<string, T>();
  // pemda-scoped aliases win over global ones
  for (const a of ref.aliases.filter((a) => a.kind === kind).sort((a, b) => a.scope.length - b.scope.length)) {
    m.set(a.aliasNorm, cast(a.targetKey));
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Pemda                                                               */
/* ------------------------------------------------------------------ */

const PEMDA_PREFIX = /^(kabupaten|kab|kota|provinsi|prov)\b\s*/;

/** "KAB. FAKFAK" → { jns: 2, name: "fakfak" }; "PAPUA BARAT" → { jns: null, name: "papua barat" } */
export function splitPemda(name: string): { jns: number | null; name: string } {
  const n = norm(name);
  const m = PEMDA_PREFIX.exec(n);
  if (!m) return { jns: null, name: n.replace(/\s+/g, "") };
  const prefix = m[1];
  const jns = prefix === "kota" ? 3 : prefix.startsWith("prov") ? 1 : 2;
  return { jns, name: n.slice(m[0].length).replace(/\s+/g, "") };
}

export function resolvePemda(
  name: string | null,
  daerah: Daerah[],
  suggester: Suggester = getSuggester(),
  aliases?: Map<string, string>,
): Resolution<string> {
  if (!name) return none();
  const aliased = aliases?.get(norm(name));
  if (aliased) {
    const d = daerah.find((x) => x.kode === aliased);
    if (d) return hit(d.kode, d.nama, "alias");
  }
  const q = splitPemda(name);
  const pool = q.jns ? daerah.filter((d) => d.jns === q.jns) : daerah;
  // bare names ("PAPUA BARAT") are provinces unless nothing matches there
  const ordered = q.jns ? pool : [...pool.filter((d) => d.jns === 1), ...pool.filter((d) => d.jns !== 1)];
  const exact = ordered.find((d) => splitPemda(d.nama).name === q.name);
  if (exact) return hit(exact.kode, exact.nama, "normalized");

  const ranked = suggester.suggest(
    q.name,
    ordered.map((d) => ({ value: d.kode, label: splitPemda(d.nama).name })),
    SUGGEST_MIN,
  );
  const labelled = ranked.map((r) => ({ ...r, label: daerah.find((d) => d.kode === r.value)?.nama ?? r.label }));
  if (labelled.length && labelled[0].score >= AUTO_ACCEPT) {
    return hit(labelled[0].value, labelled[0].label, "fuzzy", labelled[0].score, labelled);
  }
  return none(labelled);
}

/* ------------------------------------------------------------------ */
/* Whole row                                                           */
/* ------------------------------------------------------------------ */

export function resolveRow(
  n: Normalized,
  ref: RefData,
  overrides: Overrides = {},
  suggester: Suggester = getSuggester(),
): { resolved: Resolved; issues: Issue[] } {
  const issues: Issue[] = [];
  const manual = <T>(v: T, label: string): Resolution<T> => hit(v, label, "manual");

  /* pemda: the batch is already pinned to one pemda; a row naming another pemda is an error */
  const pemdaKode = resolvePemda(n.pemda, ref.daerah, suggester, aliasMap(ref, "pemda", String));
  if (!n.pemda) {
    issues.push({ level: "warn", code: "PEMDA_KOSONG", message: "Kolom Pemda kosong, dianggap pemda batch.", field: "pemda" });
    pemdaKode.value = ref.pemda.kode;
    pemdaKode.label = ref.pemda.nama;
    pemdaKode.method = "derived";
    pemdaKode.confidence = 1;
  } else if (pemdaKode.value && pemdaKode.value !== ref.pemda.kode) {
    issues.push({
      level: "error",
      code: "PEMDA_BEDA",
      message: `Baris ini untuk ${pemdaKode.label}, bukan ${ref.pemda.nama}.`,
      field: "pemda",
    });
  } else if (!pemdaKode.value) {
    issues.push({ level: "error", code: "PEMDA_TIDAK_DIKENAL", message: `Pemda "${n.pemda}" tidak dikenal.`, field: "pemda" });
  }

  /* unit SKPD */
  let unitSkpdKode: Resolution<string>;
  if (overrides.unitSkpdKode) {
    const s = ref.skpd.find((x) => x.kodeUnit === overrides.unitSkpdKode);
    unitSkpdKode = manual(overrides.unitSkpdKode, s?.namaUnit ?? overrides.unitSkpdKode);
  } else {
    unitSkpdKode = resolveNamed(
      n.unitSkpd,
      ref.skpd.map((s) => ({ value: s.kodeUnit, label: s.namaUnit })),
      { aliases: aliasMap(ref, "skpd", String), suggester },
    );
    if (!n.unitSkpd) issues.push({ level: "error", code: "SKPD_KOSONG", message: "Unit SKPD kosong.", field: "unitSkpd" });
    else if (!unitSkpdKode.value)
      issues.push({
        level: "error",
        code: "SKPD_TIDAK_DIKENAL",
        message: `Unit SKPD "${n.unitSkpd}" tidak ada di daftar SKPD ${ref.pemda.nama} (${ref.tahun}).`,
        field: "unitSkpd",
      });
  }

  /* sub-kegiatan code */
  let subkegiatanKode: Resolution<string>;
  const kode = overrides.subkegiatanKode ?? n.kodeSubKegiatan;
  if (!kode) {
    subkegiatanKode = none();
    issues.push({ level: "error", code: "KODE_KOSONG", message: "Kode Sub Kegiatan kosong.", field: "kodeSubKegiatan" });
  } else {
    const entries = ref.subkegiatan.get(kode) ?? [];
    const need = requiredJenis(ref.pemda);
    const jenisOfCode = kodeJenisPemda(kode);
    const usable = entries.find((e) => e.jnsPemda === need);
    if (usable) {
      subkegiatanKode = hit(kode, usable.nama, overrides.subkegiatanKode ? "manual" : "exact");
      if (n.subKegiatan && norm(n.subKegiatan) !== norm(usable.nama)) {
        const sim = suggester.suggest(n.subKegiatan, [{ value: kode, label: usable.nama }], 0)[0]?.score ?? 0;
        if (sim < 0.6)
          issues.push({
            level: "warn",
            code: "NAMA_SUBKEGIATAN_BEDA",
            message: `Nama sub kegiatan di file ("${n.subKegiatan}") berbeda dengan nomenklatur ("${usable.nama}").`,
            field: "subKegiatan",
          });
      }
    } else if (entries.length) {
      subkegiatanKode = none();
      issues.push({
        level: "error",
        code: "KODE_HANYA_UNTUK_" + (entries[0].jnsPemda === "PROV" ? "PROVINSI" : "KABKOTA"),
        message: `Kode ${kode} hanya berlaku untuk ${entries[0].jnsPemda === "PROV" ? "provinsi" : "kabupaten/kota"}; ${ref.pemda.nama} adalah ${need === "PROV" ? "provinsi" : "kabupaten/kota"}.`,
        field: "kodeSubKegiatan",
      });
    } else {
      subkegiatanKode = none();
      issues.push({
        level: "error",
        code: jenisOfCode ? "KODE_TIDAK_DIKENAL" : "KODE_FORMAT_SALAH",
        message: jenisOfCode
          ? `Kode ${kode} tidak ada di nomenklatur sub kegiatan ${ref.tahun}.`
          : `Kode "${kode}" bukan format kode sub kegiatan (U.BB.PP.J.KK.SSSS).`,
        field: "kodeSubKegiatan",
      });
    }
    if (n.kodeSubKegiatan && clean(n.kodeSubKegiatan) !== kode && !overrides.subkegiatanKode) {
      issues.push({ level: "info", code: "KODE_DIBERSIHKAN", message: "Spasi pada kode dibersihkan.", field: "kodeSubKegiatan" });
    }
  }

  /* RIPPP hierarchy: misi → program percepatan → sub program percepatan */
  const sppPool = ref.subProgramPercepatan.map((s) => ({ value: s.id, label: s.nama }));
  const ppPool = ref.programPercepatan.map((p) => ({ value: p.id, label: p.nama }));
  const misiPool = ref.misi.map((m) => ({ value: m.id, label: m.nama }));

  let subProgramPercepatanId = overrides.subProgramPercepatanId
    ? manual(overrides.subProgramPercepatanId, sppPool.find((s) => s.value === overrides.subProgramPercepatanId)?.label ?? "")
    : resolveNamed(n.subProgramPercepatan, sppPool, { aliases: aliasMap(ref, "spp", Number), suggester });
  let programPercepatanId = overrides.programPercepatanId
    ? manual(overrides.programPercepatanId, ppPool.find((s) => s.value === overrides.programPercepatanId)?.label ?? "")
    : resolveNamed(n.programPercepatan, ppPool, { aliases: aliasMap(ref, "pp", Number), suggester });
  let misiId = overrides.misiId
    ? manual(overrides.misiId, misiPool.find((s) => s.value === overrides.misiId)?.label ?? "")
    : resolveNamed(n.misi, misiPool, { aliases: aliasMap(ref, "misi", Number), suggester });

  // SPP names are not unique across PP (e.g. "Pengembangan Ekonomi Lokal di Daerah Tertinggal" under PP 7 and 8):
  // prefer the one that belongs to the resolved PP.
  if (subProgramPercepatanId.value !== null && programPercepatanId.value !== null) {
    const sameName = ref.subProgramPercepatan.filter((s) => norm(s.nama) === norm(subProgramPercepatanId.label ?? ""));
    const underPp = sameName.find((s) => s.ppId === programPercepatanId.value);
    if (underPp && underPp.id !== subProgramPercepatanId.value) {
      subProgramPercepatanId = hit(underPp.id, underPp.nama, subProgramPercepatanId.method, subProgramPercepatanId.confidence, subProgramPercepatanId.candidates);
    }
  }
  // derive parents from the most specific level that resolved
  const spp = ref.subProgramPercepatan.find((s) => s.id === subProgramPercepatanId.value);
  if (spp && programPercepatanId.value === null) {
    const pp = ref.programPercepatan.find((p) => p.id === spp.ppId);
    if (pp) programPercepatanId = hit(pp.id, pp.nama, "derived");
  }
  const pp = ref.programPercepatan.find((p) => p.id === programPercepatanId.value);
  if (pp && misiId.value === null) {
    const m = ref.misi.find((x) => x.id === pp.misiId);
    if (m) misiId = hit(m.id, m.nama, "derived");
  }
  // consistency
  if (spp && pp && spp.ppId !== pp.id)
    issues.push({ level: "warn", code: "SPP_BUKAN_ANAK_PP", message: `Sub program "${spp.nama}" bukan bagian dari program "${pp.nama}".`, field: "subProgramPercepatan" });
  if (pp && misiId.value !== null && pp.misiId !== misiId.value)
    issues.push({ level: "warn", code: "PP_BUKAN_ANAK_MISI", message: `Program "${pp.nama}" bukan bagian dari misi "${misiId.label}".`, field: "programPercepatan" });
  for (const [label, res, field] of [
    ["Misi", misiId, "misi"],
    ["Program Percepatan", programPercepatanId, "programPercepatan"],
    ["Sub Program Percepatan", subProgramPercepatanId, "subProgramPercepatan"],
  ] as const) {
    const raw = n[field];
    if (raw && res.value === null)
      issues.push({ level: "warn", code: "RIPPP_TIDAK_DIKENAL", message: `${label} "${raw}" tidak dikenal.`, field });
  }

  /* desk / kelompok */
  const kelompokPool = ref.kelompok.map((k) => ({ value: k.id, label: k.nama }));
  const kelompokId = overrides.kelompokId
    ? manual(overrides.kelompokId, kelompokPool.find((k) => k.value === overrides.kelompokId)?.label ?? "")
    : resolveNamed(n.desk, kelompokPool, { aliases: aliasMap(ref, "kelompok", Number), suggester, autoAccept: 0.8 });
  if (kelompokId.value === null)
    issues.push({ level: "error", code: "DESK_TIDAK_DIKENAL", message: `Desk/Kelompok "${n.desk ?? ""}" tidak dikenal (PAPUA SEHAT / CERDAS / PRODUKTIF).`, field: "desk" });
  else if (misiId.value !== null) {
    // misi 1 Sehat → desk 1, misi 2 Cerdas → desk 2, everything else is discussed at the Produktif desk
    const expected = misiId.value === 1 ? 1 : misiId.value === 2 ? 2 : 3;
    if (kelompokId.value !== expected)
      issues.push({ level: "warn", code: "DESK_MISI_TIDAK_KONSISTEN", message: `Desk ${kelompokId.label} tidak lazim untuk misi ${misiId.label}.`, field: "desk" });
  }

  /* status musrenbang */
  const statusPool = ref.statusMusrenbang.map((s) => ({ value: s.id, label: s.nama }));
  let statusMusrenbangId: Resolution<number>;
  if (overrides.statusMusrenbangId) {
    statusMusrenbangId = manual(overrides.statusMusrenbangId, statusPool.find((s) => s.value === overrides.statusMusrenbangId)?.label ?? "");
  } else {
    statusMusrenbangId = resolveNamed(n.status, statusPool, { suggester, autoAccept: 0.85 });
    if (statusMusrenbangId.value === null) {
      // Decision (2026-09-19): anything that reached a pendampingan sheet is treated as DIREKOMENDASIKAN,
      // including "Usulan Daerah Tidak Selaras" and free-text statuses like "USULAN PERBAIKAN".
      const direkom = statusPool.find((s) => s.value === 3)!;
      statusMusrenbangId = hit(direkom.value, direkom.label, "derived", 0.7);
      if (n.status)
        issues.push({ level: "warn", code: "STATUS_TIDAK_BAKU", message: `Status "${n.status}" tidak baku, dianggap DIREKOMENDASIKAN.`, field: "status" });
    }
  }

  /* satuan */
  const satuanPool = ref.satuan.map((s) => ({ value: s.id, label: s.nama }));
  const satuanId = overrides.satuanId
    ? manual(overrides.satuanId, satuanPool.find((s) => s.value === overrides.satuanId)?.label ?? "")
    : resolveNamed(n.satuan, satuanPool, { aliases: aliasMap(ref, "satuan", Number), suggester, autoAccept: 0.9 });
  if (n.satuan && satuanId.value === null)
    issues.push({ level: "warn", code: "SATUAN_TIDAK_DIKENAL", message: `Satuan "${n.satuan}" tidak ada di ref_satuan; satuan lama dipertahankan.`, field: "satuan" });

  /* sumber dana (one or many) */
  const danaPool = ref.dana.map((d) => ({ value: d.kode, label: d.nama }));
  const danaAliases = aliasMap(ref, "dana", String);
  let dana: Resolution<string>[];
  if (overrides.dana) {
    dana = overrides.dana.map((k) => manual(k, ref.dana.find((d) => d.kode === k)?.nama ?? k));
  } else {
    dana = n.sumberDana.map((s) => resolveNamed(s, danaPool, { aliases: danaAliases, suggester, autoAccept: 0.9 }));
    dana.forEach((d, i) => {
      if (d.value === null)
        issues.push({ level: "warn", code: "DANA_TIDAK_DIKENAL", message: `Sumber dana "${n.sumberDana[i]}" tidak dikenal.`, field: "sumberDana" });
    });
  }
  if (n.sumberDana.length === 0) issues.push({ level: "warn", code: "DANA_KOSONG", message: "Kesepakatan Sumber Dana kosong.", field: "sumberDana" });
  else if (!dana.some((d) => d.value && ref.dana.find((x) => x.kode === d.value)?.otsus))
    issues.push({ level: "warn", code: "BUKAN_DANA_OTSUS", message: "Tidak ada sumber dana Otsus/DBH/DTI pada baris ini.", field: "sumberDana" });
  if (n.sumberDana.length > 1)
    issues.push({ level: "warn", code: "DANA_GANDA", message: `${n.sumberDana.length} sumber dana; anggaran kesepakatan dicatat pada sumber dana pertama.`, field: "sumberDana" });

  /* numbers */
  const anggaran = overrides.anggaran ?? n.anggaran;
  const volume = overrides.volume ?? n.volume;
  if (anggaran === null) issues.push({ level: "error", code: "ANGGARAN_KOSONG", message: "Kesepakatan Anggaran kosong / bukan angka.", field: "anggaran" });
  else if (anggaran < 1_000_000)
    issues.push({ level: "warn", code: "ANGGARAN_MENCURIGAKAN", message: `Anggaran ${anggaran.toLocaleString("id-ID")} terlalu kecil, kemungkinan salah input.`, field: "anggaran" });
  if (volume === null) issues.push({ level: "error", code: "VOLUME_KOSONG", message: "Kesepakatan Volume kosong / bukan angka.", field: "volume" });
  else if (volume <= 0) issues.push({ level: "warn", code: "VOLUME_NOL", message: "Kesepakatan Volume 0.", field: "volume" });

  /* fuzzy hits are accepted but always flagged so the operator sees them */
  for (const [field, res] of [
    ["unitSkpd", unitSkpdKode],
    ["misi", misiId],
    ["programPercepatan", programPercepatanId],
    ["subProgramPercepatan", subProgramPercepatanId],
    ["satuan", satuanId],
    ["pemda", pemdaKode],
  ] as const) {
    if (res.method === "fuzzy")
      issues.push({ level: "info", code: "FUZZY", message: `"${n[field] ?? ""}" dicocokkan ke "${res.label}" (${Math.round(res.confidence * 100)}%).`, field });
  }
  dana.forEach((d, i) => {
    if (d.method === "fuzzy")
      issues.push({ level: "info", code: "FUZZY", message: `"${n.sumberDana[i]}" dicocokkan ke "${d.label}" (${Math.round(d.confidence * 100)}%).`, field: "sumberDana" });
  });

  return {
    resolved: { pemdaKode, unitSkpdKode, subkegiatanKode, misiId, programPercepatanId, subProgramPercepatanId, kelompokId, statusMusrenbangId, satuanId, dana },
    issues,
  };
}
