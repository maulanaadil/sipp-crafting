import { createHash } from "node:crypto";
import { classifyRow } from "./classify";
import { parseWorkbook } from "./parse";
import type { Daerah, RefData } from "./reference";
import { loadDaerah, loadRefData } from "./reference-db";
import { normalizeRow, resolvePemda, resolveRow } from "./resolve";
import { createBatch, getRow, refreshSummary, saveRowReclassification } from "./store";
import type { ClassifiedRow, Overrides, RawRow } from "./types";

/**
 * parse → detect pemda → load reference data → normalise → resolve → classify → persist.
 * Pure functions do the work; this file only wires them and talks to the store.
 */

export interface PemdaDetection {
  kode: string | null;
  nama: string | null;
  votes: Record<string, number>;
  unresolved: string[];
}

/** A batch is for exactly one pemda: majority vote over the Pemda column. */
export function detectPemda(rows: RawRow[], daerah: Daerah[]): PemdaDetection {
  const votes: Record<string, number> = {};
  const unresolved = new Set<string>();
  for (const r of rows) {
    const name = r.cells.pemda === null ? null : String(r.cells.pemda);
    if (!name) continue;
    const res = resolvePemda(name, daerah);
    if (res.value) votes[res.value] = (votes[res.value] ?? 0) + 1;
    else unresolved.add(name);
  }
  const [best] = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const d = best ? daerah.find((x) => x.kode === best[0]) : undefined;
  return { kode: d?.kode ?? null, nama: d?.nama ?? null, votes, unresolved: [...unresolved] };
}

export function processRow(raw: RawRow, ref: RefData, overrides: Overrides = {}): ClassifiedRow {
  const normalized = normalizeRow(raw);
  const { resolved, issues } = resolveRow(normalized, ref, overrides);
  return classifyRow(raw, normalized, resolved, issues, ref, overrides);
}

export interface RunResult {
  batchId: string;
  pemda: PemdaDetection;
  rows: ClassifiedRow[];
  warnings: string[];
}

export async function runPipeline(input: {
  buffer: Buffer;
  fileName: string;
  tahun: number;
  user: string;
  /** Force the pemda instead of detecting it from the file. */
  pemdaKode?: string;
}): Promise<RunResult> {
  const parsed = await parseWorkbook(input.buffer);
  const daerah = await loadDaerah();
  const detected = detectPemda(parsed.rows, daerah);
  const pemdaKode = input.pemdaKode ?? detected.kode;
  const warnings = [...parsed.warnings];
  if (detected.unresolved.length) warnings.push(`Nama pemda tidak dikenal: ${detected.unresolved.join(", ")}.`);
  if (Object.keys(detected.votes).length > 1)
    warnings.push(
      `File menyebut lebih dari satu pemda: ${Object.entries(detected.votes)
        .map(([k, v]) => `${daerah.find((d) => d.kode === k)?.nama ?? k} (${v})`)
        .join(", ")}. Batch dipakai untuk ${daerah.find((d) => d.kode === pemdaKode)?.nama ?? "?"}.`,
    );

  let rows: ClassifiedRow[] = [];
  if (pemdaKode) {
    const ref = await loadRefData(input.tahun, pemdaKode);
    if (ref.usulan.length === 0 && ref.rkpd.length === 0)
      warnings.push(`${ref.pemda.nama} belum punya data RKPD maupun usulan ${input.tahun} di database (belum ditarik dari SIPD).`);
    rows = parsed.rows.map((r) => processRow(r, ref));
  } else {
    warnings.push("Pemda tidak bisa ditentukan dari file; tidak ada baris yang diproses.");
  }

  const batchId = await createBatch({
    tahun: input.tahun,
    pemdaKode,
    pemdaNama: daerah.find((d) => d.kode === pemdaKode)?.nama ?? null,
    fileName: input.fileName,
    fileSha256: createHash("sha256").update(input.buffer).digest("hex"),
    warnings,
    uploadedBy: input.user,
    rows,
    sheets: parsed.sheets.map((s) => ({ name: s.name, kind: s.kind, dataRows: s.dataRows })),
  });
  return { batchId, pemda: { ...detected, kode: pemdaKode }, rows, warnings };
}

/** Re-run resolve+classify for one stored row with operator overrides (review UI). */
export async function reclassifyRow(rowId: number, overrides: Overrides, tahun: number, pemdaKode: string): Promise<ClassifiedRow> {
  const row = await getRow(rowId);
  if (!row) throw new Error("Baris tidak ditemukan");
  const ref = await loadRefData(tahun, pemdaKode);
  const merged: Overrides = { ...row.overrides, ...overrides };
  const c = processRow(row.raw, ref, merged);
  await saveRowReclassification(rowId, c, merged);
  await refreshSummary(row.batchId);
  return c;
}
