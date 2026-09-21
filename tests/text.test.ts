import { describe, expect, it } from "vitest";
import {
  clean,
  htmlToText,
  kodeJenisPemda,
  norm,
  normKode,
  parseIdNumber,
  rank,
  similarity,
} from "@/lib/inject/text";

describe("clean / norm", () => {
  it("collapses whitespace and nbsp", () => {
    expect(clean("  Kab.  Biak   Numfor ")).toBe("Kab. Biak Numfor");
    expect(clean("   ")).toBeNull();
    expect(clean(null)).toBeNull();
  });
  it("norm strips punctuation and case", () => {
    expect(norm("Infrastruktur Dasar dan Konektivitas)")).toBe("infrastruktur dasar dan konektivitas");
    expect(norm("KAB. TELUK BINTUNI")).toBe("kab teluk bintuni");
    expect(norm("Desk/ Kelompok")).toBe("desk kelompok");
  });
});

describe("kode sub kegiatan", () => {
  it("trims whitespace inside/around codes", () => {
    expect(normKode("1.02.02.1.02.0014  ")).toBe("1.02.02.1.02.0014");
    expect(normKode(" x.xx.01.2.15.0001")).toBe("X.XX.01.2.15.0001");
  });
  it("derives jenis pemda from the 4th segment", () => {
    expect(kodeJenisPemda("1.02.02.1.01.0006")).toBe("PROV");
    expect(kodeJenisPemda("1.02.02.2.01.0023")).toBe("KAB/KOTA");
    expect(kodeJenisPemda("X.XX.01.2.15.0001")).toBe("KAB/KOTA");
    expect(kodeJenisPemda("Kode Sub Kegiatan")).toBeNull();
    expect(kodeJenisPemda("1.02.02.3.01.0006")).toBeNull();
  });
});

describe("parseIdNumber", () => {
  it("keeps real numbers", () => {
    expect(parseIdNumber(2000000000)).toBe(2000000000);
    expect(parseIdNumber(1.5)).toBe(1.5);
  });
  it("parses Indonesian thousands and decimal marks", () => {
    expect(parseIdNumber("5.132.781.183  ")).toBe(5132781183);
    expect(parseIdNumber("217.494.985,00 ")).toBe(217494985);
    expect(parseIdNumber("28.596.558.522")).toBe(28596558522);
    expect(parseIdNumber("1,5 ")).toBe(1.5);
    expect(parseIdNumber("Rp 3.000.000")).toBe(3000000);
  });
  it("parses Excel float-as-text", () => {
    expect(parseIdNumber("75.0")).toBe(75);
    expect(parseIdNumber("600000000.0")).toBe(600000000);
    expect(parseIdNumber("'10000000'".replace(/'/g, ""))).toBe(10000000);
  });
  it("rejects non-numeric text", () => {
    expect(parseIdNumber("Paket")).toBeNull();
    expect(parseIdNumber("")).toBeNull();
    expect(parseIdNumber("1 Paket")).toBeNull();
  });
});

describe("trigram similarity", () => {
  it("is 1 for identical and high for typos", () => {
    expect(similarity("Papua Sehat", "papua sehat")).toBe(1);
    expect(similarity("Tanah Adat/Ulayat, Kebudayaan, dan Harmoni Sosial1", "Tanah Adat/Ulayat, Kebudayaan, dan Harmoni Sosial")).toBeGreaterThan(0.9);
    expect(similarity("Kab. Fak Fak", "Kab. Fakfak")).toBeGreaterThan(0.5);
  });
  it("is low for unrelated names", () => {
    expect(similarity("Dinas Kesehatan", "Dinas Pendidikan")).toBeLessThan(0.5);
  });
  it("rank returns exact match first with score 1", () => {
    const cands = [
      { value: 1, label: "Dinas Kesehatan" },
      { value: 2, label: "Dinas Pendidikan" },
      { value: 3, label: "RSUD Mimika" },
    ];
    const r = rank("DINAS KESEHATAN", cands);
    expect(r[0]).toMatchObject({ value: 1, score: 1 });
    expect(rank("Dinas Perikanan", cands, 0.9)).toEqual([]);
  });
});

describe("html helpers", () => {
  it("round-trips catatan", () => {
    expect(htmlToText("<p>Direkomendasikan &amp; dicatat</p>")).toBe("Direkomendasikan & dicatat");
  });
});
