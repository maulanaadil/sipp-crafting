import ExcelJS from "exceljs";
import { COLUMNS, type Col, type ParseResult, type Scalar, type SheetKind } from "./types";
import { clean, norm } from "./text";

/**
 * Header text → column. Keys are `norm()`ed so "Desk/ Kelompok" and "Desk/Kelompok" both match.
 * Order matters for nothing; matching is exact on the normalised header.
 */
const HEADER_ALIASES: Record<string, Col> = {
  no: "no",
  status: "status",
  "desk kelompok": "desk",
  desk: "desk",
  kelompok: "desk",
  misi: "misi",
  "program percepatan": "programPercepatan",
  "sub program percepatan": "subProgramPercepatan",
  "subprogram percepatan": "subProgramPercepatan",
  pemda: "pemda",
  "unit skpd": "unitSkpd",
  skpd: "unitSkpd",
  "unit opd": "unitSkpd",
  program: "program",
  kegiatan: "kegiatan",
  "kode sub kegiatan": "kodeSubKegiatan",
  "kode subkegiatan": "kodeSubKegiatan",
  "sub kegiatan": "subKegiatan",
  subkegiatan: "subKegiatan",
  "kesepakatan sumber dana": "sumberDana",
  "sumber dana": "sumberDana",
  "kesepakatan volume": "volume",
  volume: "volume",
  satuan: "satuan",
  "kesepakatan anggaran": "anggaran",
  anggaran: "anggaran",
  "kategori usulan": "kategoriUsulan",
  kategori: "kategoriUsulan",
  "catatan pembahasan": "catatan",
  catatan: "catatan",
};

/** A row is accepted as the header when at least this many template columns are recognised. */
const MIN_HEADER_HITS = 10;

export function sheetKindFromName(name: string): SheetKind {
  const n = norm(name);
  if (n.includes("tidak selaras")) return "tidak_selaras";
  if (n.includes("pendampingan")) return "pendampingan";
  if (n.includes("musrenbang")) return "selaras";
  return "unknown";
}

/** exceljs cell values can be rich text, formulas, hyperlinks, dates… flatten to a scalar. */
export function cellToScalar(v: ExcelJS.CellValue): Scalar {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellToScalar(v.result as ExcelJS.CellValue);
    if ("text" in v) return typeof v.text === "string" ? v.text : cellToScalar(v.text as ExcelJS.CellValue);
    if ("error" in v) return null;
  }
  return String(v);
}

function detectHeader(ws: ExcelJS.Worksheet): { rowNo: number; map: Map<number, Col> } | null {
  const maxScan = Math.min(ws.rowCount, 15);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    const map = new Map<number, Col>();
    const seen = new Set<Col>();
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = norm(cellToScalar(cell.value));
      const col = HEADER_ALIASES[key];
      if (col && !seen.has(col)) {
        map.set(colNumber, col);
        seen.add(col);
      }
    });
    if (seen.size >= MIN_HEADER_HITS) return { rowNo: r, map };
  }
  return null;
}

function emptyCells(): Record<Col, Scalar> {
  return Object.fromEntries(COLUMNS.map((c) => [c, null])) as Record<Col, Scalar>;
}

/**
 * Read every recognisable sheet of a pendampingan workbook into flat rows.
 * Blank rows, repeated header rows and sheets without a header are skipped with a warning.
 */
export async function parseWorkbook(buffer: Buffer | ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);

  const result: ParseResult = { rows: [], sheets: [], warnings: [] };

  for (const ws of wb.worksheets) {
    const kind = sheetKindFromName(ws.name);
    const header = detectHeader(ws);
    if (!header) {
      result.sheets.push({ name: ws.name, kind, dataRows: 0, headerRow: null });
      result.warnings.push(`Sheet "${ws.name}": header template tidak ditemukan, sheet dilewati.`);
      continue;
    }
    if (kind === "unknown") {
      result.warnings.push(`Sheet "${ws.name}": nama sheet tidak dikenal, diproses sebagai data tanpa kategori.`);
    }
    const missing = COLUMNS.filter((c) => ![...header.map.values()].includes(c));
    if (missing.length) {
      result.warnings.push(`Sheet "${ws.name}": kolom tidak ada: ${missing.join(", ")}.`);
    }

    let dataRows = 0;
    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      if (rowNo <= header.rowNo) return;
      const cells = emptyCells();
      let nonEmpty = 0;
      for (const [colNumber, col] of header.map) {
        const v = cellToScalar(row.getCell(colNumber).value);
        const s = clean(v);
        cells[col] = typeof v === "number" ? v : s;
        if (s !== null) nonEmpty++;
      }
      if (nonEmpty === 0) return;
      // repeated header inside the data area
      if (norm(cells.no) === "no" && norm(cells.status) === "status") return;
      // rows that only carry a running number (Excel drag-fill leftovers)
      if (nonEmpty === 1 && cells.no !== null) return;

      result.rows.push({ sheet: ws.name, sheetKind: kind, rowNo, cells });
      dataRows++;
    });
    result.sheets.push({ name: ws.name, kind, dataRows, headerRow: header.rowNo });
  }

  if (result.rows.length === 0) result.warnings.push("Tidak ada baris data yang terbaca dari file ini.");
  return result;
}
