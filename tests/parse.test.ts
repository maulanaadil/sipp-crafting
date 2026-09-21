import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseWorkbook, sheetKindFromName } from "@/lib/inject/parse";

const HEADER = ["No", "Status", "Desk/ Kelompok", "Misi", "Program Percepatan", "Sub Program Percepatan", "Pemda", "Unit SKPD", "Program", "Kegiatan", "Kode Sub Kegiatan", "Sub Kegiatan", "Kesepakatan Sumber Dana", "Kesepakatan Volume", "Satuan", "Kesepakatan Anggaran", "Kategori Usulan", "Catatan Pembahasan"];

async function workbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet("Data Musrenbang Otsus Selaras");
  a.addRow(HEADER);
  a.addRow([399, "DIREKOMENDASIKAN", "PAPUA SEHAT", "Papua Sehat", "PP", "SPP", "Kab. Deiyai", "DINAS KESEHATAN", "PROGRAM", "Kegiatan", "1.02.02.2.01.0023 ", { richText: [{ text: "Pengadaan " }, { text: "Obat" }] }, "Dana Otonomi Khusus 1,25%-Papua-Kesehatan", 1, "Paket", "3.000.000.000", "Rancangan RKPD", "ok"]);
  a.addRow([]); // blank
  a.addRow(HEADER); // repeated header
  a.addRow([2]); // drag-fill leftover
  a.addRow([400, "DIREKOMENDASIKAN", "PAPUA SEHAT", "Papua Sehat", "PP", "SPP", "Kab. Deiyai", "DINAS KESEHATAN", "PROGRAM", "Kegiatan", "1.02.02.2.01.0006", "Puskesmas", "Dana", { formula: "1+1", result: 2 }, "Unit", 5000000000, "Usulan baru", null]);

  const b = wb.addWorksheet("Data Hasil Pendampingan");
  b.addRow(["No", "Status", "Desk/Kelompok", "Misi", "Program Percepatan", "Sub Program Percepatan", "Pemda", "Unit SKPD", "Program", "Kegiatan", "Kode Sub Kegiatan", "Sub Kegiatan", "Kesepakatan Sumber Dana", "Kesepakatan Volume", "Satuan", "Kesepakatan Anggaran", "Kategori Usulan", "Catatan Pembahasan", null, null, "OK"]);
  b.addRow([1, "DIREKOMENDASIKAN", "PAPUA CERDAS", "Papua Cerdas", "PP", "SPP", "KAB. DEIYAI", "DINAS PENDIDIKAN", "PROGRAM", "Kegiatan", "1.01.02.2.01.0047", "RKB", "Dana", 2, "Ruang", 3000000000, "Usulan Perbaikan dan Selaras", "Direkomendasikan\nHasil Perbaikan"]);

  const c = wb.addWorksheet("Usulan Daerah Tidak Selaras");
  c.addRow(["catatan bebas tanpa header"]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parseWorkbook", () => {
  it("classifies sheets by name", () => {
    expect(sheetKindFromName("Data Musrenbang Otsus Selaras")).toBe("selaras");
    expect(sheetKindFromName("Data Hasil Pendampingan Selaras")).toBe("pendampingan");
    expect(sheetKindFromName("Data Hasil Pendampingan")).toBe("pendampingan");
    expect(sheetKindFromName("Usulan Daerah Tidak Selaras")).toBe("tidak_selaras");
    expect(sheetKindFromName("Sheet1")).toBe("unknown");
  });

  it("reads data rows, skips blanks/repeated headers, flattens rich text and formulas", async () => {
    const res = await parseWorkbook(await workbook());
    expect(res.rows).toHaveLength(3);
    expect(res.sheets.map((s) => s.dataRows)).toEqual([2, 1, 0]);
    expect(res.warnings.some((w) => w.includes("Usulan Daerah Tidak Selaras"))).toBe(true);

    const [r1, r2, r3] = res.rows;
    expect(r1).toMatchObject({ sheetKind: "selaras", rowNo: 2 });
    expect(r1.cells.kodeSubKegiatan).toBe("1.02.02.2.01.0023");
    expect(r1.cells.subKegiatan).toBe("Pengadaan Obat");
    expect(r1.cells.anggaran).toBe("3.000.000.000");
    expect(r2.cells.volume).toBe(2);
    expect(r2.cells.catatan).toBeNull();
    expect(r3).toMatchObject({ sheetKind: "pendampingan", rowNo: 2 });
    expect(r3.cells.desk).toBe("PAPUA CERDAS");
    expect(r3.cells.catatan).toBe("Direkomendasikan Hasil Perbaikan");
  });
});
