/** Column order of the pendampingan spreadsheet template (18 columns). */
export const COLUMNS = [
  "no",
  "status",
  "desk",
  "misi",
  "programPercepatan",
  "subProgramPercepatan",
  "pemda",
  "unitSkpd",
  "program",
  "kegiatan",
  "kodeSubKegiatan",
  "subKegiatan",
  "sumberDana",
  "volume",
  "satuan",
  "anggaran",
  "kategoriUsulan",
  "catatan",
] as const;
export type Col = (typeof COLUMNS)[number];

export type Scalar = string | number | null;

/** Which of the three template sheets a row came from. */
export type SheetKind = "selaras" | "pendampingan" | "tidak_selaras" | "unknown";

export interface RawRow {
  sheet: string;
  sheetKind: SheetKind;
  /** 1-based Excel row number, for messages that operators can find in the file. */
  rowNo: number;
  cells: Record<Col, Scalar>;
}

export interface ParseResult {
  rows: RawRow[];
  sheets: { name: string; kind: SheetKind; dataRows: number; headerRow: number | null }[];
  warnings: string[];
}

export interface Normalized {
  status: string | null;
  desk: string | null;
  misi: string | null;
  programPercepatan: string | null;
  subProgramPercepatan: string | null;
  pemda: string | null;
  unitSkpd: string | null;
  kodeSubKegiatan: string | null;
  subKegiatan: string | null;
  /** Split on `|` / `;`, each trimmed. */
  sumberDana: string[];
  volume: number | null;
  satuan: string | null;
  anggaran: number | null;
  kategoriUsulan: string | null;
  catatan: string | null;
}

export type Method = "exact" | "normalized" | "alias" | "fuzzy" | "derived" | "manual" | "none";

export interface Candidate<T = string> {
  value: T;
  label: string;
  score: number;
}

export interface Resolution<T = string> {
  value: T | null;
  label: string | null;
  method: Method;
  /** 0..1; 1 for exact/alias/manual, trigram similarity for fuzzy. */
  confidence: number;
  candidates: Candidate<T>[];
}

export interface Resolved {
  pemdaKode: Resolution<string>;
  unitSkpdKode: Resolution<string>;
  subkegiatanKode: Resolution<string>;
  misiId: Resolution<number>;
  programPercepatanId: Resolution<number>;
  subProgramPercepatanId: Resolution<number>;
  kelompokId: Resolution<number>;
  statusMusrenbangId: Resolution<number>;
  satuanId: Resolution<number>;
  /** One resolution per sumber dana string; value = kode_subdana / sipd kode. */
  dana: Resolution<string>[];
}

export type Action = "update" | "insert" | "insert_with_rkpd" | "error";

export type IssueLevel = "error" | "warn" | "info";

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  field?: Col;
}

export interface FieldChange {
  from: unknown;
  to: unknown;
}

export interface Plan {
  action: Action;
  /** Existing usulan id for `update`. */
  usulanId?: string;
  /** Existing trx_rkpd_<tahun>.sippp_rkpd_id for `update` / `insert`. */
  rkpdId?: number;
  /** For `update`: only the columns whose value differs. */
  changes: Record<string, FieldChange>;
  /** Full row to write for inserts. */
  insert?: Record<string, unknown>;
  /** Sumber dana child rows to end up with. */
  dana: { kode: string; nama: string }[];
  noop: boolean;
}

export interface ClassifiedRow {
  raw: RawRow;
  normalized: Normalized;
  resolved: Resolved;
  action: Action;
  issues: Issue[];
  plan: Plan;
  needsReview: boolean;
}

/** Manual picks from the review UI; keys mirror `Resolved`. */
export interface Overrides {
  unitSkpdKode?: string;
  subkegiatanKode?: string;
  misiId?: number;
  programPercepatanId?: number;
  subProgramPercepatanId?: number;
  kelompokId?: number;
  statusMusrenbangId?: number;
  satuanId?: number;
  dana?: string[];
  volume?: number;
  anggaran?: number;
}
