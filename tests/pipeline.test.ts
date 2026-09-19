import { describe, expect, it } from "vitest";
import { classifyRow } from "@/lib/inject/classify";
import { normalizeRow, resolvePemda, resolveRow, splitPemda } from "@/lib/inject/resolve";
import { rulesSuggester } from "@/lib/inject/suggest";
import type { Overrides, RawRow } from "@/lib/inject/types";
import { makeRef, makeRow } from "./fixtures/ref";

const ref = makeRef();
const run = (raw: RawRow, overrides: Overrides = {}) => {
  const n = normalizeRow(raw);
  const { resolved, issues } = resolveRow(n, ref, overrides, rulesSuggester);
  return classifyRow(raw, n, resolved, issues, ref, overrides);
};
const codes = (r: ReturnType<typeof run>) => r.issues.map((i) => i.code);

describe("pemda resolution", () => {
  it("splits prefixes and types", () => {
    expect(splitPemda("KAB. FAKFAK")).toEqual({ jns: 2, name: "fakfak" });
    expect(splitPemda("Kabupaten Sorong")).toEqual({ jns: 2, name: "sorong" });
    expect(splitPemda("Kota Sorong")).toEqual({ jns: 3, name: "sorong" });
    expect(splitPemda("PAPUA BARAT")).toEqual({ jns: null, name: "papuabarat" });
  });
  it("keeps Kota and Kab apart, and bare names are provinces", () => {
    expect(resolvePemda("Kota Jayapura", ref.daerah, rulesSuggester).value).toBe("91.71");
    expect(resolvePemda("KAB. JAYAPURA", ref.daerah, rulesSuggester).value).toBe("91.03");
    expect(resolvePemda("PAPUA BARAT", ref.daerah, rulesSuggester).value).toBe("92");
    expect(resolvePemda("Provinsi Papua Barat Daya", ref.daerah, rulesSuggester).value).toBe("96");
    expect(resolvePemda("KAB. FAKFAK", ref.daerah, rulesSuggester).value).toBe("92.03");
    expect(resolvePemda("Kabupaten Sorong", ref.daerah, rulesSuggester).value).toBe("96.01");
  });
});

describe("normalizeRow", () => {
  it("cleans codes, numbers and splits sumber dana", () => {
    const n = normalizeRow(
      makeRow({ kodeSubKegiatan: "1.02.02.2.01.0006 ", anggaran: "5.132.781.183 ", volume: "1,5", sumberDana: "DAU|Dana Otonomi Khusus 1,25%-Papua-Kesehatan; DBH," }),
    );
    expect(n.kodeSubKegiatan).toBe("1.02.02.2.01.0006");
    expect(n.anggaran).toBe(5132781183);
    expect(n.volume).toBe(1.5);
    expect(n.sumberDana).toEqual(["DAU", "Dana Otonomi Khusus 1,25%-Papua-Kesehatan", "DBH"]);
  });
});

describe("classification", () => {
  it("existing usulan with identical values → update noop", () => {
    const r = run(makeRow());
    expect(r.action).toBe("update");
    expect(r.plan.noop).toBe(true);
    expect(r.plan.usulanId).toBe("aaaa000000000001");
    expect(r.needsReview).toBe(false);
    expect(codes(r)).toContain("SUDAH_SESUAI");
  });

  it("changed kesepakatan → update with final and akhir columns", () => {
    const r = run(makeRow({ volume: 7, anggaran: "9.000.000.000", catatan: "Direkomendasikan dengan catatan" }));
    expect(r.action).toBe("update");
    expect(r.plan.noop).toBe(false);
    expect(Object.keys(r.plan.changes).sort()).toEqual(
      ["hasil_musrenbang", "pagu_anggaran_akhir", "pagu_anggaran_final", "volume_akhir", "volume_final"].sort(),
    );
    expect(r.plan.changes.pagu_anggaran_final).toEqual({ from: 8000000000, to: 9000000000 });
    expect(r.plan.changes.hasil_musrenbang.to).toBe("<p>Direkomendasikan dengan catatan</p>");
  });

  it("no usulan but RKPD has the sub-kegiatan → insert linked to RKPD", () => {
    const r = run(makeRow({ kodeSubKegiatan: "1.02.02.2.01.0006", subKegiatan: "Pengembangan Puskesmas", volume: 10, anggaran: 10000000000, satuan: "Unit" }, "pendampingan"));
    expect(r.action).toBe("insert");
    expect(r.plan.rkpdId).toBe(502);
    expect(r.plan.insert).toMatchObject({ pemda_kode: "94.08", subkegiatan_kode: "1.02.02.2.01.0006", ref_status_usulan_id: 3, ref_status_musrenbang_id: 3, volume_final: 10, pagu_anggaran_final: 10000000000, trx_rkpd_id: 502 });
    expect(r.needsReview).toBe(true);
  });

  it("valid kab code missing from RKPD → insert_with_rkpd, flagged for confirmation", () => {
    const r = run(
      makeRow({ unitSkpd: "DINAS PENDIDIKAN", kodeSubKegiatan: "1.01.02.2.01.0047", subKegiatan: "Pembangunan Ruang Kelas Baru", desk: "PAPUA CERDAS", misi: "Papua Cerdas", programPercepatan: "Pengembangan Sekolah Sepanjang Hari", subProgramPercepatan: "Pengembangan Sekolah Sepanjang Hari", sumberDana: "Dana Otonomi Khusus 1,25%-Papua-Pendidikan", volume: 2, satuan: "Ruang", anggaran: 3000000000 }),
    );
    expect(r.action).toBe("insert_with_rkpd");
    expect(codes(r)).toContain("RKPD_BARU");
    expect(r.plan.insert).toMatchObject({ unitskpd_kode: "1.01.0.00.0.00.01.0000", mst_misi_id: 2, mst_program_percepatan_id: 4, mst_subprogram_percepatan_id: 9, ref_kelompok_id: 2, ref_satuan_id: 2 });
  });

  it("provinsi-only code used by a kabupaten → error", () => {
    const r = run(makeRow({ kodeSubKegiatan: "2.07.03.1.01.0001" }));
    expect(r.action).toBe("error");
    expect(codes(r)).toContain("KODE_HANYA_UNTUK_PROVINSI");
  });

  it("unknown code and malformed code → distinct errors", () => {
    expect(codes(run(makeRow({ kodeSubKegiatan: "9.99.99.2.99.9999" })))).toContain("KODE_TIDAK_DIKENAL");
    expect(codes(run(makeRow({ kodeSubKegiatan: "Kode Sub Kegiatan" })))).toContain("KODE_FORMAT_SALAH");
  });

  it("unknown SKPD → error with fuzzy candidates offered", () => {
    const r = run(makeRow({ unitSkpd: "Dinas Kesehtan" }));
    expect(r.action).toBe("error");
    expect(codes(r)).toContain("SKPD_TIDAK_DIKENAL");
    expect(r.resolved.unitSkpdKode.candidates[0]).toMatchObject({ value: "1.02.0.00.0.00.01.0000" });
  });

  it("manual override of SKPD turns the error into a plan", () => {
    const r = run(makeRow({ unitSkpd: "RSUD PRATAMA", kodeSubKegiatan: "1.02.02.2.01.0006", volume: 1, anggaran: 1000000000 }), { unitSkpdKode: "1.02.0.00.0.00.02.0000" });
    expect(r.resolved.unitSkpdKode.method).toBe("manual");
    expect(r.action).toBe("insert_with_rkpd");
  });

  it("row for another pemda is rejected", () => {
    const r = run(makeRow({ pemda: "Kab. Jayapura" }));
    expect(codes(r)).toContain("PEMDA_BEDA");
    expect(r.action).toBe("error");
  });

  it("misi with stray punctuation resolves by normalisation; desk/misi mismatch warns", () => {
    const r = run(makeRow({ misi: "Infrastruktur Dasar dan Konektivitas)", programPercepatan: "Peningkatan Infrastruktur Wilayah", subProgramPercepatan: "Peningkatan Jalan dan Jembatan yang Terintegrasi", desk: "PAPUA SEHAT" }));
    expect(r.resolved.misiId).toMatchObject({ value: 4, method: "normalized" });
    expect(codes(r)).toContain("DESK_MISI_TIDAK_KONSISTEN");
  });

  it("non-standard status defaults to DIREKOMENDASIKAN with a warning", () => {
    const r = run(makeRow({ status: "USULAN PERBAIKAN" }), {});
    expect(r.resolved.statusMusrenbangId).toMatchObject({ value: 3, method: "derived" });
    expect(codes(r)).toContain("STATUS_TIDAK_BAKU");
  });

  it("duplicate SPP names pick the one under the resolved PP", () => {
    const r = run(
      makeRow({ desk: "PAPUA PRODUKTIF", misi: "Papua Produktif", programPercepatan: "Pengembangan Pariwisata Rintisan dan Ekonomi Kreatif", subProgramPercepatan: "Pengembangan Ekonomi Lokal di Daerah Tertinggal", unitSkpd: "Dinas Penanaman Modal, Perijinan dan Koperasi", kodeSubKegiatan: "2.17.06.2.01.0009", sumberDana: "Dana Otonomi Khusus 1,25%-Papua-Pemberdayaan Ekonomi Masyarakat", volume: 1, anggaran: 750000000, satuan: "Unit Usaha" }),
    );
    expect(r.resolved.subProgramPercepatanId.value).toBe(25);
    expect(codes(r)).toContain("SATUAN_TIDAK_DIKENAL");
  });

  it("flags suspicious numbers and multi-source dana", () => {
    const r = run(makeRow({ anggaran: 1, volume: 0, sumberDana: "Dana Alokasi Umum (DAU)|Dana Otonomi Khusus 1,25%-Papua-Kesehatan" }));
    expect(codes(r)).toEqual(expect.arrayContaining(["ANGGARAN_MENCURIGAKAN", "VOLUME_NOL", "DANA_GANDA"]));
    expect(r.plan.dana.map((d) => d.kode)).toEqual(["1.2.01.01", "2.2.01.03.011.00002"]);
    expect(r.plan.changes.kodesumberdana.to).toBe("1.2.01.01|2.2.01.03.011.00002");
  });

  it("derives misi/pp from SPP when the misi column is blank (tidak selaras sheets)", () => {
    const r = run(makeRow({ misi: "", programPercepatan: "", subProgramPercepatan: "Pemenuhan Standar Pelayanan Minimal (SPM) Kesehatan" }, "tidak_selaras"));
    expect(r.resolved.misiId).toMatchObject({ value: 1, method: "derived" });
    expect(r.resolved.programPercepatanId).toMatchObject({ value: 2, method: "derived" });
  });
});
