import { sql } from "@/lib/db";
import type { Action, ClassifiedRow, Issue, Normalized, Overrides, Plan, RawRow, Resolved } from "./types";

/** Persistence for inject.batch / inject.row and the shapes the UI reads. */

export type BatchStatus = "parsed" | "reviewing" | "applying" | "applied" | "failed";
export type Decision = "pending" | "approved" | "rejected";

export interface BatchSummary {
  rows: number;
  byAction: Record<Action, number>;
  needsReview: number;
  byDecision: Record<Decision, number>;
  applied: number;
  issueCodes: Record<string, number>;
  sheets: { name: string; kind: string; dataRows: number }[];
}

export interface BatchRecord {
  id: string;
  tahun: number;
  pemdaKode: string | null;
  pemdaNama: string | null;
  fileName: string;
  fileSha256: string;
  status: BatchStatus;
  summary: BatchSummary;
  warnings: string[];
  uploadedBy: string;
  uploadedAt: Date;
  appliedBy: string | null;
  appliedAt: Date | null;
  notes: string | null;
}

export interface RowRecord {
  id: number;
  batchId: string;
  sheet: string;
  sheetKind: string;
  rowNo: number;
  raw: RawRow;
  normalized: Normalized;
  resolved: Resolved;
  action: Action;
  issues: Issue[];
  plan: Plan;
  needsReview: boolean;
  decision: Decision;
  decidedBy: string | null;
  decidedAt: Date | null;
  overrides: Overrides;
  appliedAt: Date | null;
  result: Record<string, unknown> | null;
}

export function emptySummary(): BatchSummary {
  return {
    rows: 0,
    byAction: { update: 0, insert: 0, insert_with_rkpd: 0, error: 0 },
    needsReview: 0,
    byDecision: { pending: 0, approved: 0, rejected: 0 },
    applied: 0,
    issueCodes: {},
    sheets: [],
  };
}

export function summarize(rows: Pick<RowRecord, "action" | "needsReview" | "decision" | "issues" | "appliedAt">[]): Omit<BatchSummary, "sheets"> {
  const s = emptySummary();
  for (const r of rows) {
    s.rows++;
    s.byAction[r.action]++;
    if (r.needsReview) s.needsReview++;
    s.byDecision[r.decision]++;
    if (r.appliedAt) s.applied++;
    for (const i of r.issues) if (i.level !== "info") s.issueCodes[i.code] = (s.issueCodes[i.code] ?? 0) + 1;
  }
  return s;
}

function mapBatch(r: Record<string, unknown>): BatchRecord {
  return {
    id: r.id as string,
    tahun: Number(r.tahun),
    pemdaKode: (r.pemda_kode as string) ?? null,
    pemdaNama: (r.pemda_nama as string) ?? null,
    fileName: r.file_name as string,
    fileSha256: r.file_sha256 as string,
    status: r.status as BatchStatus,
    summary: { ...emptySummary(), ...(r.summary as Partial<BatchSummary>) },
    warnings: (r.warnings as string[]) ?? [],
    uploadedBy: r.uploaded_by as string,
    uploadedAt: r.uploaded_at as Date,
    appliedBy: (r.applied_by as string) ?? null,
    appliedAt: (r.applied_at as Date) ?? null,
    notes: (r.notes as string) ?? null,
  };
}

function mapRow(r: Record<string, unknown>): RowRecord {
  return {
    id: Number(r.id),
    batchId: r.batch_id as string,
    sheet: r.sheet as string,
    sheetKind: r.sheet_kind as string,
    rowNo: Number(r.row_no),
    raw: r.raw as RawRow,
    normalized: r.normalized as Normalized,
    resolved: r.resolved as Resolved,
    action: r.action as Action,
    issues: (r.issues as Issue[]) ?? [],
    plan: r.plan as Plan,
    needsReview: Boolean(r.needs_review),
    decision: r.decision as Decision,
    decidedBy: (r.decided_by as string) ?? null,
    decidedAt: (r.decided_at as Date) ?? null,
    overrides: (r.overrides as Overrides) ?? {},
    appliedAt: (r.applied_at as Date) ?? null,
    result: (r.result as Record<string, unknown>) ?? null,
  };
}

export async function listBatches(limit = 50): Promise<BatchRecord[]> {
  const rows = await sql<Record<string, unknown>[]>`select * from inject.batch order by uploaded_at desc limit ${limit}`;
  return rows.map(mapBatch);
}

export async function getBatch(id: string): Promise<BatchRecord | null> {
  const rows = await sql<Record<string, unknown>[]>`select * from inject.batch where id = ${id}`;
  return rows[0] ? mapBatch(rows[0]) : null;
}

export async function listRows(batchId: string): Promise<RowRecord[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select * from inject.row where batch_id = ${batchId} order by sheet_kind, row_no`;
  return rows.map(mapRow);
}

export async function getRow(id: number): Promise<RowRecord | null> {
  const rows = await sql<Record<string, unknown>[]>`select * from inject.row where id = ${id}`;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createBatch(input: {
  tahun: number;
  pemdaKode: string | null;
  pemdaNama: string | null;
  fileName: string;
  fileSha256: string;
  warnings: string[];
  uploadedBy: string;
  rows: ClassifiedRow[];
  sheets: BatchSummary["sheets"];
}): Promise<string> {
  return sql.begin(async (tx) => {
    const summary: BatchSummary = {
      ...summarize(input.rows.map((r) => ({ ...r, decision: "pending" as Decision, appliedAt: null }))),
      sheets: input.sheets,
    };
    const [b] = await tx<{ id: string }[]>`
      insert into inject.batch (tahun, pemda_kode, pemda_nama, file_name, file_sha256, status, summary, warnings, uploaded_by)
      values (${input.tahun}, ${input.pemdaKode}, ${input.pemdaNama}, ${input.fileName}, ${input.fileSha256},
              ${input.rows.length ? "reviewing" : "failed"}, ${tx.json(summary as never)}, ${tx.json(input.warnings as never)}, ${input.uploadedBy})
      returning id`;
    for (const r of input.rows) {
      await tx`
        insert into inject.row (batch_id, sheet, sheet_kind, row_no, raw, normalized, resolved, action, issues, plan, needs_review)
        values (${b.id}, ${r.raw.sheet}, ${r.raw.sheetKind}, ${r.raw.rowNo}, ${tx.json(r.raw as never)}, ${tx.json(r.normalized as never)},
                ${tx.json(r.resolved as never)}, ${r.action}, ${tx.json(r.issues as never)}, ${tx.json(r.plan as never)}, ${r.needsReview})`;
    }
    return b.id;
  });
}

export async function refreshSummary(batchId: string): Promise<BatchSummary> {
  const [batch, rows] = await Promise.all([getBatch(batchId), listRows(batchId)]);
  const summary: BatchSummary = { ...summarize(rows), sheets: batch?.summary.sheets ?? [] };
  await sql`update inject.batch set summary = ${sql.json(summary as never)} where id = ${batchId}`;
  return summary;
}

export async function saveRowReclassification(rowId: number, c: ClassifiedRow, overrides: Overrides): Promise<void> {
  await sql`
    update inject.row set
      normalized = ${sql.json(c.normalized as never)}, resolved = ${sql.json(c.resolved as never)}, action = ${c.action},
      issues = ${sql.json(c.issues as never)}, plan = ${sql.json(c.plan as never)}, needs_review = ${c.needsReview},
      overrides = ${sql.json(overrides as never)}, decision = 'pending', decided_by = null, decided_at = null
    where id = ${rowId} and applied_at is null`;
}

export async function setDecision(rowIds: number[], decision: Decision, by: string): Promise<number> {
  if (!rowIds.length) return 0;
  const res = await sql`
    update inject.row set decision = ${decision}, decided_by = ${by}, decided_at = now()
    where id in ${sql(rowIds)} and applied_at is null and action <> 'error'`;
  return res.count;
}

export async function rememberAlias(input: {
  kind: string;
  scope: string;
  alias: string;
  targetKey: string;
  targetLabel: string | null;
  by: string;
}): Promise<void> {
  await sql`
    insert into inject.alias (kind, scope, alias_norm, target_key, target_label, created_by)
    values (${input.kind}, ${input.scope}, ${input.alias}, ${input.targetKey}, ${input.targetLabel}, ${input.by})
    on conflict (kind, scope, alias_norm) do update set target_key = excluded.target_key, target_label = excluded.target_label,
      created_by = excluded.created_by, created_at = now()`;
}
