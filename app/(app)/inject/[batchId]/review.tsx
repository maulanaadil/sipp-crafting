"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import { fmtIDR, fmtNum } from "@/lib/format";
import type { RowRecord } from "@/lib/inject/store";
import type { Action, Issue, Method, Overrides, Resolution } from "@/lib/inject/types";
import { applyBatchAction, approveClean, decideRows, overrideRow, type ActionResult } from "../actions";

export type SerializedRow = Omit<RowRecord, "decidedAt" | "appliedAt"> & { decidedAt: string | null; appliedAt: string | null };
export type Opt<T = string | number> = { value: T; label: string; parent?: number };
export type Options = {
  skpd: Opt<string>[];
  satuan: Opt<number>[];
  misi: Opt<number>[];
  programPercepatan: Opt<number>[];
  subProgramPercepatan: Opt<number>[];
  kelompok: Opt<number>[];
  statusMusrenbang: Opt<number>[];
  dana: Opt<string>[];
};

const ACTION: Record<Action, { label: string; tone: "neutral" | "info" | "warn" | "error" | "success" | "accent" }> = {
  update: { label: "update", tone: "neutral" },
  insert: { label: "insert", tone: "info" },
  insert_with_rkpd: { label: "insert + RKPD", tone: "warn" },
  error: { label: "error", tone: "error" },
};
const METHOD: Record<Method, { label: string; tone: "neutral" | "info" | "warn" | "error" | "success" | "accent" }> = {
  exact: { label: "sama", tone: "success" },
  normalized: { label: "dinormalisasi", tone: "success" },
  alias: { label: "alias tersimpan", tone: "success" },
  derived: { label: "diturunkan", tone: "info" },
  fuzzy: { label: "mirip", tone: "accent" },
  manual: { label: "manual", tone: "info" },
  none: { label: "tidak ditemukan", tone: "error" },
};
const DECISION = {
  pending: { label: "belum", tone: "neutral" as const },
  approved: { label: "disetujui", tone: "success" as const },
  rejected: { label: "ditolak", tone: "error" as const },
};

type Filter = "all" | "review" | "update" | "insert" | "insert_with_rkpd" | "error" | "approved" | "rejected" | "pending";

export function Review({
  batchId,
  rows,
  options,
  canEdit,
  approvedPending,
}: {
  batchId: string;
  rows: SerializedRow[];
  options: Options;
  canEdit: boolean;
  approvedPending: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      try {
        setMsg(await fn());
      } catch (e) {
        setMsg({ ok: false, message: e instanceof Error ? e.message : String(e) });
      }
      setConfirmApply(false);
    });

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "review" && !(r.needsReview && r.decision === "pending" && r.action !== "error")) return false;
      if (["update", "insert", "insert_with_rkpd", "error"].includes(filter) && r.action !== filter) return false;
      if (["approved", "rejected", "pending"].includes(filter) && r.decision !== filter) return false;
      if (!needle) return true;
      const hay = [r.normalized.unitSkpd, r.normalized.kodeSubKegiatan, r.normalized.subKegiatan, r.sheet, String(r.rowNo), ...r.issues.map((i) => i.code)]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, filter, q]);

  const counts = useMemo(() => {
    const c = { review: 0, pending: 0 };
    for (const r of rows) {
      if (r.needsReview && r.decision === "pending" && r.action !== "error") c.review++;
      if (r.decision === "pending" && r.action !== "error") c.pending++;
    }
    return c;
  }, [rows]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: `Semua ${rows.length}` },
    { key: "review", label: `Perlu tinjau ${counts.review}` },
    { key: "update", label: "Update" },
    { key: "insert", label: "Insert" },
    { key: "insert_with_rkpd", label: "Insert + RKPD" },
    { key: "error", label: "Error" },
    { key: "approved", label: "Disetujui" },
    { key: "rejected", label: "Ditolak" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`pressable rounded-md px-2.5 py-1 text-xs font-medium ${
                filter === f.key ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari SKPD / kode / issue…"
            className="h-8 w-56 rounded-md border border-zinc-300 bg-white px-2.5 text-sm outline-none focus:border-zinc-500"
          />
          {canEdit && (
            <>
              <Button size="sm" onClick={() => run(() => approveClean(batchId))} disabled={pending}>
                Setujui baris bersih
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  run(() =>
                    decideRows(
                      batchId,
                      visible.filter((r) => r.action !== "error" && !r.appliedAt).map((r) => r.id),
                      "approved",
                    ),
                  )
                }
                disabled={pending || visible.length === 0}
              >
                Setujui yang tampil
              </Button>
              {!confirmApply ? (
                <Button size="sm" variant="primary" onClick={() => setConfirmApply(true)} disabled={pending || approvedPending === 0}>
                  Terapkan {approvedPending} baris
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 p-1 pl-2.5 text-xs text-white">
                  Tulis {approvedPending} baris ke SIPPP?
                  <Button size="sm" variant="success" onClick={() => run(() => applyBatchAction(batchId))} disabled={pending}>
                    {pending ? "Menulis…" : "Ya, terapkan"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-white hover:bg-zinc-800" onClick={() => setConfirmApply(false)}>
                    Batal
                  </Button>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {msg && (
        <div
          role="status"
          className={`rounded-md px-3 py-2 text-sm ring-1 ring-inset ${msg.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-red-800 ring-red-200"}`}
        >
          {msg.message}
        </div>
      )}

      <div className="overflow-clip rounded-lg border border-zinc-200 bg-white">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[4.5rem]" />
            <col className="w-[15rem]" />
            <col className="w-[17rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[8rem]" />
            <col className="w-[5.5rem]" />
            <col />
            <col className="w-[11.5rem]" />
          </colgroup>
          <thead className="sticky top-12 z-[1] bg-zinc-50 text-left text-xs text-zinc-500">
            <tr className="border-b border-zinc-200">
              <th className="px-3 py-2 font-medium">Baris</th>
              <th className="px-3 py-2 font-medium">Unit SKPD</th>
              <th className="px-3 py-2 font-medium">Sub kegiatan</th>
              <th className="px-3 py-2 text-right font-medium">Volume</th>
              <th className="px-3 py-2 text-right font-medium">Anggaran</th>
              <th className="px-3 py-2 font-medium">Aksi</th>
              <th className="px-3 py-2 font-medium">Catatan pemeriksaan</th>
              <th className="px-3 py-2 font-medium">Keputusan</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-zinc-500">
                  Tidak ada baris untuk filter ini.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <Row key={r.id} r={r} options={options} canEdit={canEdit && !r.appliedAt} pending={pending} run={run} batchId={batchId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  r,
  options,
  canEdit,
  pending,
  run,
  batchId,
}: {
  r: SerializedRow;
  options: Options;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
  batchId: string;
}) {
  const [open, setOpen] = useState(false);
  const warnings = r.issues.filter((i) => i.level === "warn");
  const errors = r.issues.filter((i) => i.level === "error");
  const infos = r.issues.filter((i) => i.level === "info" && i.code !== "SUDAH_SESUAI");
  const skpd = r.resolved.unitSkpdKode;

  return (
    <>
      <tr
        className={`scroll-mt-28 border-b border-zinc-100 align-top ${open ? "bg-zinc-50" : "hover:bg-zinc-50/70"} cursor-pointer`}
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-3 py-2 text-xs text-zinc-500">
          <span className="font-medium text-zinc-700">{r.rowNo}</span>
          <div>{r.sheetKind.replace("_", " ")}</div>
        </td>
        <td className="px-3 py-2">
          <div className="truncate" title={r.normalized.unitSkpd ?? ""}>
            {r.normalized.unitSkpd}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Badge tone={METHOD[skpd.method].tone}>{METHOD[skpd.method].label}</Badge>
            {skpd.value && <span className="font-mono text-[11px] text-zinc-500">{skpd.value}</span>}
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="font-mono text-xs">{r.normalized.kodeSubKegiatan ?? <span className="text-red-600">—</span>}</div>
          <div className="truncate text-xs text-zinc-600" title={r.normalized.subKegiatan ?? ""}>
            {r.normalized.subKegiatan}
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {fmtNum(r.normalized.volume)} <span className="text-xs text-zinc-500">{r.normalized.satuan}</span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtIDR(r.normalized.anggaran)}</td>
        <td className="px-3 py-2">
          <Badge tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Badge>
          {r.plan.noop && r.action === "update" && <div className="mt-0.5 text-[11px] text-zinc-500">sudah sesuai</div>}
          {r.action === "update" && !r.plan.noop && <div className="mt-0.5 text-[11px] text-zinc-500">{Object.keys(r.plan.changes).length} kolom</div>}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {errors.map((i, k) => (
              <Badge key={k} tone="error" title={i.message}>
                {i.code}
              </Badge>
            ))}
            {warnings.map((i, k) => (
              <Badge key={k} tone="warn" title={i.message}>
                {i.code}
              </Badge>
            ))}
            {infos.map((i, k) => (
              <Badge key={k} tone="info" title={i.message}>
                {i.code}
              </Badge>
            ))}
          </div>
        </td>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          {r.appliedAt ? (
            <Badge tone="success">diterapkan</Badge>
          ) : (
            <div className="flex items-center gap-1">
              <Badge tone={DECISION[r.decision].tone}>{DECISION[r.decision].label}</Badge>
              {canEdit && r.action !== "error" && r.decision !== "approved" && (
                <Button size="sm" variant="success" disabled={pending} onClick={() => run(() => decideRows(batchId, [r.id], "approved"))}>
                  Setuju
                </Button>
              )}
              {canEdit && r.decision !== "rejected" && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideRows(batchId, [r.id], "rejected"))}>
                  Tolak
                </Button>
              )}
            </div>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-zinc-200 bg-zinc-50">
          <td colSpan={8} className="px-4 pb-4 pt-1">
            <Detail r={r} options={options} canEdit={canEdit} pending={pending} run={run} batchId={batchId} />
          </td>
        </tr>
      )}
    </>
  );
}

function ResLine({ label, res, raw }: { label: string; res: Resolution<string | number>; raw: string | null }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-xs">
      <div className="text-zinc-500">{label}</div>
      <div>
        <div className="text-zinc-800">{raw ?? <span className="text-zinc-400">kosong</span>}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-zinc-400">→</span>
          <span className={res.value === null ? "text-red-600" : "font-medium"}>{res.label ?? "tidak ditemukan"}</span>
          <Badge tone={METHOD[res.method].tone}>
            {METHOD[res.method].label}
            {res.method === "fuzzy" ? ` ${Math.round(res.confidence * 100)}%` : ""}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function Detail({
  r,
  options,
  canEdit,
  pending,
  run,
  batchId,
}: {
  r: SerializedRow;
  options: Options;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
  batchId: string;
}) {
  const [ov, setOv] = useState<Overrides>({});
  const [remember, setRemember] = useState(true);
  const n = r.normalized;
  const res = r.resolved;
  const dirty = Object.keys(ov).length > 0;

  const pick = <K extends keyof Overrides>(key: K, value: Overrides[K] | "") =>
    setOv((o) => {
      const next = { ...o };
      if (value === "" || value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Pencocokan</h4>
        <ResLine label="Pemda" res={res.pemdaKode} raw={n.pemda} />
        <ResLine label="Unit SKPD" res={res.unitSkpdKode} raw={n.unitSkpd} />
        <ResLine label="Kode sub kegiatan" res={res.subkegiatanKode} raw={n.kodeSubKegiatan} />
        <ResLine label="Desk / kelompok" res={res.kelompokId} raw={n.desk} />
        <ResLine label="Misi" res={res.misiId} raw={n.misi} />
        <ResLine label="Program percepatan" res={res.programPercepatanId} raw={n.programPercepatan} />
        <ResLine label="Sub program" res={res.subProgramPercepatanId} raw={n.subProgramPercepatan} />
        <ResLine label="Status" res={res.statusMusrenbangId} raw={n.status} />
        <ResLine label="Satuan" res={res.satuanId} raw={n.satuan} />
        {n.sumberDana.map((d, i) => (
          <ResLine key={i} label={i === 0 ? "Sumber dana" : ""} res={res.dana[i] ?? { value: null, label: null, method: "none", confidence: 0, candidates: [] }} raw={d} />
        ))}
        <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-xs">
          <div className="text-zinc-500">Kategori · catatan</div>
          <div className="text-zinc-800">
            {n.kategoriUsulan ?? "—"}
            {n.catatan && <div className="mt-0.5 whitespace-pre-line text-zinc-600">{n.catatan}</div>}
          </div>
        </div>
      </section>

      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Rencana penulisan</h4>
        {r.action === "error" && <p className="text-xs text-red-700">Baris ini tidak akan ditulis sampai kesalahan di bawah diperbaiki.</p>}
        {r.action === "update" && r.plan.noop && <p className="text-xs text-zinc-600">Usulan {r.plan.usulanId} sudah sama dengan file; tidak ada perubahan.</p>}
        {r.action === "update" && !r.plan.noop && (
          <table className="w-full text-xs">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="py-1 font-medium">Kolom</th>
                <th className="py-1 font-medium">Sekarang</th>
                <th className="py-1 font-medium">Menjadi</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(r.plan.changes).map(([col, ch]) => (
                <tr key={col} className="border-t border-zinc-200 align-top">
                  <td className="py-1 pr-2 font-mono">{col}</td>
                  <td className="py-1 pr-2 text-zinc-500">{show(col, ch.from)}</td>
                  <td className="py-1 font-medium">{show(col, ch.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(r.action === "insert" || r.action === "insert_with_rkpd") && r.plan.insert && (
          <dl className="grid grid-cols-[13.5rem_1fr] gap-x-2 gap-y-0.5 text-xs">
            {Object.entries(r.plan.insert)
              .filter(([, v]) => v !== null && v !== undefined)
              .map(([k, v]) => (
                <Fragment2 key={k} k={k} v={v} />
              ))}
          </dl>
        )}
        {r.issues.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs">
            {r.issues.map((i, k) => (
              <IssueLine key={k} i={i} />
            ))}
          </ul>
        )}
        {r.result && (
          <p className="mt-3 rounded bg-emerald-50 px-2 py-1 font-mono text-[11px] text-emerald-800">{JSON.stringify(r.result)}</p>
        )}
      </section>

      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Perbaiki pencocokan</h4>
        {!canEdit && <p className="text-xs text-zinc-500">Baris ini tidak bisa diubah lagi.</p>}
        <div className="space-y-2">
          <label className="block text-xs">
            <span className="text-zinc-500">Unit SKPD</span>
            <div className="mt-0.5">
              <Pick ov={ov} canEdit={canEdit} pick={pick} field="unitSkpdKode" opts={options.skpd} res={res.unitSkpdKode} />
            </div>
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Desk / kelompok</span>
            <div className="mt-0.5">
              <Pick ov={ov} canEdit={canEdit} pick={pick} field="kelompokId" opts={options.kelompok} res={res.kelompokId} numeric />
            </div>
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Misi</span>
            <div className="mt-0.5">
              <Pick ov={ov} canEdit={canEdit} pick={pick} field="misiId" opts={options.misi} res={res.misiId} numeric />
            </div>
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Program percepatan</span>
            <div className="mt-0.5">
              <Pick ov={ov} canEdit={canEdit} pick={pick}
                field="programPercepatanId"
                opts={options.programPercepatan.filter((o) => !((ov.misiId ?? res.misiId.value) ?? null) || o.parent === (ov.misiId ?? res.misiId.value))}
                res={res.programPercepatanId}
                numeric
              />
            </div>
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Sub program percepatan</span>
            <div className="mt-0.5">
              <Pick ov={ov} canEdit={canEdit} pick={pick}
                field="subProgramPercepatanId"
                opts={options.subProgramPercepatan.filter(
                  (o) => !((ov.programPercepatanId ?? res.programPercepatanId.value) ?? null) || o.parent === (ov.programPercepatanId ?? res.programPercepatanId.value),
                )}
                res={res.subProgramPercepatanId}
                numeric
              />
            </div>
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Status musrenbang</span>
            <div className="mt-0.5">
              <Pick ov={ov} canEdit={canEdit} pick={pick} field="statusMusrenbangId" opts={options.statusMusrenbang} res={res.statusMusrenbangId} numeric />
            </div>
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">Satuan</span>
            <div className="mt-0.5">
              <Pick ov={ov} canEdit={canEdit} pick={pick} field="satuanId" opts={options.satuan} res={res.satuanId} numeric />
            </div>
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="block">
              <span className="text-zinc-500">Volume</span>
              <input
                type="number"
                step="any"
                disabled={!canEdit}
                defaultValue={n.volume ?? ""}
                onChange={(e) => pick("volume", e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-0.5 h-7 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs tabular-nums disabled:bg-zinc-100"
              />
            </label>
            <label className="block">
              <span className="text-zinc-500">Anggaran (Rp)</span>
              <input
                type="number"
                step="1"
                disabled={!canEdit}
                defaultValue={n.anggaran ?? ""}
                onChange={(e) => pick("anggaran", e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-0.5 h-7 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs tabular-nums disabled:bg-zinc-100"
              />
            </label>
          </div>
          {n.sumberDana.length > 0 && (
            <div className="text-xs">
              <span className="text-zinc-500">Sumber dana</span>
              {n.sumberDana.map((raw, i) => (
                <div key={i} className="mt-0.5">
                  <select
                    disabled={!canEdit}
                    value={String((ov.dana ?? res.dana.map((d) => d.value ?? ""))[i] ?? "")}
                    onChange={(e) => {
                      const base = ov.dana ?? res.dana.map((d) => d.value ?? "");
                      const next = [...base];
                      next[i] = e.target.value;
                      pick("dana", next.every((x) => x) ? (next as string[]) : (next as string[]));
                    }}
                    className="h-7 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs disabled:bg-zinc-100"
                    title={raw}
                  >
                    <option value="">— {raw} —</option>
                    {options.dana.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" variant="primary" disabled={pending || !dirty} onClick={() => run(() => overrideRow(batchId, r.id, ov, remember))}>
                Hitung ulang baris
              </Button>
              <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                ingat pemetaan ini untuk file berikutnya
              </label>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Fragment2({ k, v }: { k: string; v: unknown }) {
  return (
    <>
      <dt className="font-mono text-zinc-500">{k}</dt>
      <dd className="truncate" title={String(v)}>
        {show(k, v)}
      </dd>
    </>
  );
}

function IssueLine({ i }: { i: Issue }) {
  const tone = i.level === "error" ? "text-red-700" : i.level === "warn" ? "text-amber-800" : "text-zinc-600";
  return (
    <li className={`flex gap-1.5 ${tone}`}>
      <span className="shrink-0 font-mono text-[11px] opacity-70">{i.code}</span>
      <span>{i.message}</span>
    </li>
  );
}

function show(col: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (/pagu|anggaran/.test(col)) return fmtIDR(v);
  if (/volume/.test(col)) return fmtNum(v);
  if (col === "hasil_musrenbang") return String(v).replace(/<[^>]+>/g, " ").trim();
  return String(v);
}

function Pick<T extends string | number>({
  field,
  opts,
  res,
  numeric,
  ov,
  canEdit,
  pick,
}: {
  field: keyof Overrides;
  opts: Opt<T>[];
  res: Resolution<T>;
  numeric?: boolean;
  ov: Overrides;
  canEdit: boolean;
  pick: (key: keyof Overrides, value: never) => void;
}) {
  const current = (ov[field] as T | undefined) ?? res.value ?? "";
  const cands = res.candidates.filter((c) => c.value !== res.value);
  return (
    <select
      value={String(current)}
      disabled={!canEdit}
      onChange={(e) => pick(field, (e.target.value === "" ? "" : numeric ? Number(e.target.value) : e.target.value) as never)}
      className="h-7 max-w-full rounded-md border border-zinc-300 bg-white px-2 text-xs disabled:bg-zinc-100"
    >
      <option value="">— pilih —</option>
      {cands.length > 0 && (
        <optgroup label="Kandidat mirip">
          {cands.map((c) => (
            <option key={`c-${c.value}`} value={String(c.value)}>
              {c.label} ({Math.round(c.score * 100)}%)
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Semua">
        {opts.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
