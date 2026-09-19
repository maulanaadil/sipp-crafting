"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TAHUN, sql } from "@/lib/db";
import { canAccessPemda, FITUR, requireUser } from "@/lib/auth/session";
import { applyBatch } from "@/lib/inject/apply";
import { reclassifyRow, runPipeline } from "@/lib/inject/pipeline";
import { getBatch, getRow, listRows, rememberAlias, setDecision, type Decision } from "@/lib/inject/store";
import { norm } from "@/lib/inject/text";
import type { Overrides } from "@/lib/inject/types";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const MAX_UPLOAD = 15 * 1024 * 1024;

export type UploadState = { error?: string } | undefined;

export async function uploadBatch(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await requireUser(FITUR.UPDATE_PEMBAHASAN);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih file .xlsx terlebih dahulu." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "Hanya file .xlsx yang didukung." };
  if (file.size > MAX_UPLOAD) return { error: "File terlalu besar (maks 15 MB)." };
  const tahun = Number(formData.get("tahun") || TAHUN);

  const res = await runPipeline({
    buffer: Buffer.from(await file.arrayBuffer()),
    fileName: file.name,
    tahun,
    user: user.username,
  });
  if (!canAccessPemda(user, res.pemda.kode)) {
    await sql`update inject.batch set status = 'failed', notes = 'Pengguna tidak berhak atas pemda ini' where id = ${res.batchId}`;
    return { error: `File ini untuk ${res.pemda.nama ?? "pemda lain"}; akun Anda tidak berhak menginject pemda tersebut.` };
  }
  revalidatePath("/inject");
  redirect(`/inject/${res.batchId}`);
}

async function guardBatch(batchId: string) {
  const user = await requireUser(FITUR.UPDATE_PEMBAHASAN);
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch tidak ditemukan");
  if (!canAccessPemda(user, batch.pemdaKode)) throw new Error("Tidak berhak atas pemda ini");
  return { user, batch };
}

export async function decideRows(batchId: string, rowIds: number[], decision: Decision): Promise<ActionResult> {
  const { user } = await guardBatch(batchId);
  const n = await setDecision(rowIds, decision, user.username);
  revalidatePath(`/inject/${batchId}`);
  return { ok: true, message: `${n} baris ${decision === "approved" ? "disetujui" : decision === "rejected" ? "ditolak" : "dikembalikan"}.` };
}

/** Approve every row that has a plan, no warnings and no fuzzy match. */
export async function approveClean(batchId: string): Promise<ActionResult> {
  const { user } = await guardBatch(batchId);
  const rows = await listRows(batchId);
  const ids = rows.filter((r) => r.action !== "error" && !r.needsReview && r.decision === "pending" && !r.appliedAt).map((r) => r.id);
  const n = await setDecision(ids, "approved", user.username);
  revalidatePath(`/inject/${batchId}`);
  return { ok: true, message: `${n} baris bersih disetujui.` };
}

type AliasKey = "unitSkpdKode" | "satuanId" | "misiId" | "programPercepatanId" | "subProgramPercepatanId" | "kelompokId";
const ALIAS_FIELDS: { key: AliasKey; kind: string; scoped: boolean; source: "unitSkpd" | "satuan" | "misi" | "programPercepatan" | "subProgramPercepatan" | "desk" }[] = [
  { key: "unitSkpdKode", kind: "skpd", scoped: true, source: "unitSkpd" },
  { key: "satuanId", kind: "satuan", scoped: false, source: "satuan" },
  { key: "misiId", kind: "misi", scoped: false, source: "misi" },
  { key: "programPercepatanId", kind: "pp", scoped: false, source: "programPercepatan" },
  { key: "subProgramPercepatanId", kind: "spp", scoped: false, source: "subProgramPercepatan" },
  { key: "kelompokId", kind: "kelompok", scoped: false, source: "desk" },
];

/** Operator picked values for a row: re-run the pipeline for it and optionally remember the mapping. */
export async function overrideRow(batchId: string, rowId: number, overrides: Overrides, remember: boolean): Promise<ActionResult> {
  const { user, batch } = await guardBatch(batchId);
  const row = await getRow(rowId);
  if (!row || row.batchId !== batchId) return { ok: false, message: "Baris tidak ditemukan" };
  if (row.appliedAt) return { ok: false, message: "Baris sudah diterapkan" };

  const c = await reclassifyRow(rowId, overrides, batch.tahun, batch.pemdaKode!);

  if (remember) {
    for (const f of ALIAS_FIELDS) {
      const picked = overrides[f.key];
      const source = c.normalized[f.source];
      if (picked === undefined || picked === null || !source) continue;
      const res = c.resolved[f.key];
      await rememberAlias({
        kind: f.kind,
        scope: f.scoped ? batch.pemdaKode! : "",
        alias: norm(source),
        targetKey: String(picked),
        targetLabel: res.label,
        by: user.username,
      });
    }
    if (overrides.dana && c.normalized.sumberDana.length === overrides.dana.length) {
      for (const [i, kode] of overrides.dana.entries()) {
        await rememberAlias({ kind: "dana", scope: "", alias: norm(c.normalized.sumberDana[i]), targetKey: kode, targetLabel: c.resolved.dana[i]?.label ?? null, by: user.username });
      }
    }
  }
  revalidatePath(`/inject/${batchId}`);
  return { ok: true, message: c.action === "error" ? "Masih ada kesalahan pada baris ini." : `Baris dihitung ulang: ${c.action}.` };
}

export async function applyBatchAction(batchId: string): Promise<ActionResult> {
  const { user } = await guardBatch(batchId);
  const res = await applyBatch(batchId, user.username);
  revalidatePath(`/inject/${batchId}`);
  revalidatePath("/inject");
  if (res.error) return { ok: false, message: `Gagal, tidak ada yang ditulis: ${res.error}` };
  return { ok: true, message: `${res.applied} baris diterapkan ke database.` };
}
