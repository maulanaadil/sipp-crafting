"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Button, Code, Mark, type Tone } from "@/components/ui";
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

const ACTION: Record<Action, { label: string; tone: Tone }> = {
  update: { label: "update", tone: "neutral" },
  insert: { label: "insert", tone: "accent" },
  insert_with_rkpd: { label: "insert + RKPD", tone: "warn" },
  error: { label: "error", tone: "danger" },
};
const METHOD: Record<Method, { label: string; tone: Tone }> = {
  exact: { label: "sama", tone: "ok" },
  normalized: { label: "dinormalisasi", tone: "ok" },
  alias: { label: "alias tersimpan", tone: "ok" },
  derived: { label: "diturunkan", tone: "accent" },
  fuzzy: { label: "mirip", tone: "warn" },
  manual: { label: "manual", tone: "accent" },
  none: { label: "tidak ditemukan", tone: "danger" },
};
const DECISION: Record<SerializedRow["decision"], { label: string; tone: Tone }> = {
  pending: { label: "menunggu", tone: "neutral" },
  approved: { label: "disetujui", tone: "ok" },
  rejected: { label: "ditolak", tone: "danger" },
};

type Filter = "all" | "review" | "update" | "insert" | "insert_with_rkpd" | "error" | "approved" | "rejected";

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
      if (["approved", "rejected"].includes(filter) && r.decision !== filter) return false;
      if (!needle) return true;
      const hay = [r.normalized.unitSkpd, r.normalized.kodeSubKegiatan, r.normalized.subKegiatan, r.sheet, String(r.rowNo), ...r.issues.map((i) => i.code)]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, filter, q]);

  const count = (f: Filter) =>
    rows.filter((r) => {
      if (f === "all") return true;
      if (f === "review") return r.needsReview && r.decision === "pending" && r.action !== "error";
      if (f === "approved" || f === "rejected") return r.decision === f;
      return r.action === f;
    }).length;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "Semua" },
    { key: "review", label: "Perlu tinjau" },
    { key: "update", label: "Update" },
    { key: "insert", label: "Insert" },
    { key: "insert_with_rkpd", label: "Insert + RKPD" },
    { key: "error", label: "Error" },
    { key: "approved", label: "Disetujui" },
    { key: "rejected", label: "Ditolak" },
  ];

  const visibleApprovable = visible.filter((r) => r.action !== "error" && !r.appliedAt && r.decision !== "approved").map((r) => r.id);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule">
        <div role="tablist" aria-label="Filter baris" className="-mb-px flex flex-wrap gap-x-5">
          {FILTERS.map((f) => {
            const n = count(f.key);
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.key)}
                className={`press -mb-px border-b-2 pb-2 pt-1 text-sm whitespace-nowrap ${
                  active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {f.label} <span className={`tnum ml-1 font-mono text-xs ${active ? "text-accent-ink" : "text-neutral"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari SKPD, kode, issue"
            aria-label="Cari baris"
            className="control h-8 w-52"
          />
          {canEdit && (
            <>
              <Button size="sm" onClick={() => run(() => approveClean(batchId))} disabled={pending}>
                Setujui baris bersih
              </Button>
              <Button size="sm" onClick={() => run(() => decideRows(batchId, visibleApprovable, "approved"))} disabled={pending || visibleApprovable.length === 0}>
                Setujui {visibleApprovable.length} yang tampil
              </Button>
              {!confirmApply ? (
                <Button size="sm" variant="primary" onClick={() => setConfirmApply(true)} disabled={pending || approvedPending === 0}>
                  Tulis {approvedPending} baris ke SIPPP
                </Button>
              ) : (
                <span className="inline-flex items-center gap-2 text-xs text-ink-2">
                  Tulis {approvedPending} baris ke database?
                  <Button size="sm" variant="primary" busy={pending} onClick={() => run(() => applyBatchAction(batchId))}>
                    Ya, tulis sekarang
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmApply(false)} disabled={pending}>
                    Batal
                  </Button>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {msg && (
        <p role="status" className={`mt-3 border-l-2 pl-3 text-sm text-ink-2 ${msg.ok ? "border-ok" : "border-danger"}`}>
          {msg.message}
        </p>
      )}

      <table className="mt-2 w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[6.5rem]" />
          <col className="w-[14rem]" />
          <col className="w-[16rem]" />
          <col className="w-[6.5rem]" />
          <col className="w-[8rem]" />
          <col className="w-[7rem]" />
          <col />
          <col className="w-[12.5rem]" />
        </colgroup>
        <thead className="text-left text-muted small-caps-label">
          <tr className="border-b border-rule">
            <th className="py-2 pr-3 font-normal">Baris</th>
            <th className="py-2 pr-3 font-normal">Unit SKPD</th>
            <th className="py-2 pr-3 font-normal">Sub kegiatan</th>
            <th className="py-2 pr-3 text-right font-normal">Volume</th>
            <th className="py-2 pr-3 text-right font-normal">Anggaran</th>
            <th className="py-2 pr-3 font-normal">Aksi</th>
            <th className="py-2 pr-3 font-normal">Pemeriksaan</th>
            <th className="py-2 font-normal">Keputusan</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={8} className="py-10 text-muted">
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
  // stay mounted while collapsing so the panel leaves along the path it arrived on
  const [mounted, setMounted] = useState(false);
  const panelId = useId();
  const errors = r.issues.filter((i) => i.level === "error");
  const warnings = r.issues.filter((i) => i.level === "warn");
  const infos = r.issues.filter((i) => i.level === "info" && i.code !== "SUDAH_SESUAI");
  const skpd = r.resolved.unitSkpdKode;
  const toggle = () => {
    if (!open) setMounted(true); // mount first; @starting-style animates the panel in
    setOpen((o) => !o);
  };

  return (
    <>
      <tr
        className={`cursor-pointer border-b align-top transition-colors duration-[var(--dur-short)] ${
          open ? "border-transparent bg-paper-2" : "border-rule hover:bg-paper-2"
        }`}
        onClick={toggle}
      >
        <td className="py-2.5 pr-3 text-xs text-muted">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={mounted ? panelId : undefined}
            aria-label={`${open ? "Tutup" : "Buka"} rincian baris ${r.rowNo}`}
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            className="press -m-1 inline-flex items-center gap-1 rounded-sm p-1 text-ink"
          >
            <span aria-hidden className={`inline-block text-neutral transition-transform duration-[var(--dur-med)] ${open ? "rotate-90" : ""}`}>
              ›
            </span>
            <span className="tnum font-mono">{r.rowNo}</span>
          </button>
          <div className="mt-0.5 text-neutral">{r.sheetKind.replace("_", " ")}</div>
        </td>
        <td className="py-2.5 pr-3">
          <div className="truncate" title={r.normalized.unitSkpd ?? ""}>
            {r.normalized.unitSkpd}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <Mark tone={METHOD[skpd.method].tone}>{METHOD[skpd.method].label}</Mark>
            {skpd.value && <Code className="text-neutral">{skpd.value}</Code>}
          </div>
        </td>
        <td className="py-2.5 pr-3">
          <Code className={r.normalized.kodeSubKegiatan ? "" : "text-danger"}>{r.normalized.kodeSubKegiatan ?? "—"}</Code>
          <div className="truncate text-xs text-muted" title={r.normalized.subKegiatan ?? ""}>
            {r.normalized.subKegiatan}
          </div>
        </td>
        <td className="tnum py-2.5 pr-3 text-right">
          {fmtNum(r.normalized.volume)} <span className="text-xs text-muted">{r.normalized.satuan}</span>
        </td>
        <td className="tnum py-2.5 pr-3 text-right">{fmtIDR(r.normalized.anggaran)}</td>
        <td className="py-2.5 pr-3">
          <Mark tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Mark>
          {r.action === "update" && (
            <div className="mt-0.5 text-xs text-neutral">{r.plan.noop ? "sudah sesuai" : `${Object.keys(r.plan.changes).length} kolom`}</div>
          )}
        </td>
        <td className="py-2.5 pr-3">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {errors.map((i, k) => (
              <Mark key={`e${k}`} tone="danger" mono title={i.message}>
                {i.code}
              </Mark>
            ))}
            {warnings.map((i, k) => (
              <Mark key={`w${k}`} tone="warn" mono title={i.message}>
                {i.code}
              </Mark>
            ))}
            {infos.map((i, k) => (
              <Mark key={`i${k}`} tone="neutral" mono title={i.message}>
                {i.code}
              </Mark>
            ))}
          </div>
        </td>
        <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
          {r.appliedAt ? (
            <Mark tone="ok">ditulis</Mark>
          ) : (
            <div className="flex items-center gap-2">
              <Mark tone={DECISION[r.decision].tone}>{DECISION[r.decision].label}</Mark>
              {canEdit && r.action !== "error" && r.decision === "pending" && (
                <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => decideRows(batchId, [r.id], "approved"))}>
                  Setujui
                </Button>
              )}
              {canEdit && r.decision === "pending" && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideRows(batchId, [r.id], "rejected"))}>
                  Tolak
                </Button>
              )}
              {canEdit && r.decision !== "pending" && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideRows(batchId, [r.id], "pending"))}>
                  Batalkan
                </Button>
              )}
            </div>
          )}
        </td>
      </tr>
      {mounted && (
        <tr className={`border-b bg-paper-2 ${open ? "border-rule" : "border-transparent"}`}>
          <td colSpan={8} className="p-0">
            <div
              id={panelId}
              className="disclosure"
              data-open={open}
              onTransitionEnd={(e) => {
                if (!open && e.propertyName === "grid-template-rows") setMounted(false);
              }}
            >
              <div>
                <div className="px-3 pb-6 pt-2">
                  <Detail r={r} options={options} canEdit={canEdit} pending={pending} run={run} batchId={batchId} />
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ResLine({ label, res, raw }: { label: string; res: Resolution<string | number>; raw: string | null }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 border-b border-rule py-2 text-xs last:border-0">
      <div className="text-muted">{label}</div>
      <div className="min-w-0">
        <div className="text-ink-2">{raw ?? <span className="text-neutral">kosong</span>}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={res.value === null ? "text-danger" : "font-medium text-ink"}>{res.label ?? "tidak ditemukan"}</span>
          <Mark tone={METHOD[res.method].tone}>
            {METHOD[res.method].label}
            {res.method === "fuzzy" ? ` ${Math.round(res.confidence * 100)} %` : ""}
          </Mark>
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

  const misiSel = ov.misiId ?? res.misiId.value;
  const ppSel = ov.programPercepatanId ?? res.programPercepatanId.value;

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <section>
        <h4 className="text-xs font-medium text-ink">Pencocokan</h4>
        <div className="mt-1">
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
          <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-2 text-xs">
            <div className="text-muted">Kategori · catatan</div>
            <div className="text-ink-2">
              {n.kategoriUsulan ?? "—"}
              {n.catatan && <p className="mt-1 whitespace-pre-line text-muted">{n.catatan}</p>}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h4 className="text-xs font-medium text-ink">Rencana penulisan</h4>
        <div className="mt-1 text-xs">
          {r.action === "error" && <p className="py-2 text-danger">Baris ini tidak ditulis sampai kesalahan di bawah diperbaiki.</p>}
          {r.action === "update" && r.plan.noop && (
            <p className="py-2 text-muted">
              Usulan <Code>{r.plan.usulanId}</Code> sudah sama dengan file. Tidak ada perubahan.
            </p>
          )}
          {r.action === "update" && !r.plan.noop && (
            <table className="w-full">
              <thead className="text-left text-muted">
                <tr className="border-b border-rule">
                  <th className="py-1.5 font-normal">Kolom</th>
                  <th className="py-1.5 font-normal">Sekarang</th>
                  <th className="py-1.5 font-normal">Menjadi</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {Object.entries(r.plan.changes).map(([col, ch]) => (
                  <tr key={col} className="border-b border-rule align-top last:border-0">
                    <td className="py-1.5 pr-2">
                      <Code>{col}</Code>
                    </td>
                    <td className="py-1.5 pr-2 text-muted">{show(col, ch.from)}</td>
                    <td className="py-1.5 font-medium text-ink">{show(col, ch.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(r.action === "insert" || r.action === "insert_with_rkpd") && r.plan.insert && (
            <dl className="tnum grid grid-cols-[13rem_minmax(0,1fr)] gap-x-3 gap-y-1">
              {Object.entries(r.plan.insert)
                .filter(([, v]) => v !== null && v !== undefined)
                .map(([k, v]) => (
                  <KV key={k} k={k} v={v} />
                ))}
            </dl>
          )}
          {r.issues.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-rule pt-3">
              {r.issues.map((i, k) => (
                <IssueLine key={k} i={i} />
              ))}
            </ul>
          )}
          {r.result && <p className="mt-4 font-mono text-[11px] text-ok">{JSON.stringify(r.result)}</p>}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-medium text-ink">Perbaiki pencocokan</h4>
        {!canEdit && <p className="mt-1 text-xs text-muted">Baris ini sudah ditulis; tidak bisa diubah lagi.</p>}
        <div className="mt-2 space-y-3">
          <Field label="Unit SKPD">
            <Pick ov={ov} canEdit={canEdit} pick={pick} field="unitSkpdKode" opts={options.skpd} res={res.unitSkpdKode} />
          </Field>
          <Field label="Desk / kelompok">
            <Pick ov={ov} canEdit={canEdit} pick={pick} field="kelompokId" opts={options.kelompok} res={res.kelompokId} numeric />
          </Field>
          <Field label="Misi">
            <Pick ov={ov} canEdit={canEdit} pick={pick} field="misiId" opts={options.misi} res={res.misiId} numeric />
          </Field>
          <Field label="Program percepatan">
            <Pick
              ov={ov}
              canEdit={canEdit}
              pick={pick}
              field="programPercepatanId"
              opts={options.programPercepatan.filter((o) => misiSel === null || misiSel === undefined || o.parent === misiSel)}
              res={res.programPercepatanId}
              numeric
            />
          </Field>
          <Field label="Sub program percepatan">
            <Pick
              ov={ov}
              canEdit={canEdit}
              pick={pick}
              field="subProgramPercepatanId"
              opts={options.subProgramPercepatan.filter((o) => ppSel === null || ppSel === undefined || o.parent === ppSel)}
              res={res.subProgramPercepatanId}
              numeric
            />
          </Field>
          <Field label="Status musrenbang">
            <Pick ov={ov} canEdit={canEdit} pick={pick} field="statusMusrenbangId" opts={options.statusMusrenbang} res={res.statusMusrenbangId} numeric />
          </Field>
          <Field label="Satuan">
            <Pick ov={ov} canEdit={canEdit} pick={pick} field="satuanId" opts={options.satuan} res={res.satuanId} numeric />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Volume">
              <input
                type="number"
                step="any"
                disabled={!canEdit}
                defaultValue={n.volume ?? ""}
                onChange={(e) => pick("volume", e.target.value === "" ? "" : Number(e.target.value))}
                className="control tnum h-8 w-full text-xs"
              />
            </Field>
            <Field label="Anggaran (Rp)">
              <input
                type="number"
                step="1"
                disabled={!canEdit}
                defaultValue={n.anggaran ?? ""}
                onChange={(e) => pick("anggaran", e.target.value === "" ? "" : Number(e.target.value))}
                className="control tnum h-8 w-full text-xs"
              />
            </Field>
          </div>
          {n.sumberDana.length > 0 && (
            <Field label="Sumber dana">
              <div className="space-y-1.5">
                {n.sumberDana.map((raw, i) => (
                  <select
                    key={i}
                    disabled={!canEdit}
                    value={String((ov.dana ?? res.dana.map((d) => d.value ?? ""))[i] ?? "")}
                    onChange={(e) => {
                      const next = [...(ov.dana ?? res.dana.map((d) => d.value ?? ""))];
                      next[i] = e.target.value;
                      pick("dana", next as string[]);
                    }}
                    className="control h-8 w-full text-xs"
                    title={raw}
                  >
                    <option value="">— {raw} —</option>
                    {options.dana.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            </Field>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button size="sm" variant="primary" disabled={!dirty} busy={pending && dirty} onClick={() => run(() => overrideRow(batchId, r.id, ov, remember))}>
                Hitung ulang baris
              </Button>
              <label className="inline-flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-[var(--color-accent)]" />
                ingat pemetaan ini untuk file berikutnya
              </label>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function KV({ k, v }: { k: string; v: unknown }) {
  return (
    <>
      <dt className="truncate">
        <Code className="text-muted">{k}</Code>
      </dt>
      <dd className="truncate text-ink-2" title={String(v)}>
        {show(k, v)}
      </dd>
    </>
  );
}

function IssueLine({ i }: { i: Issue }) {
  const tone: Tone = i.level === "error" ? "danger" : i.level === "warn" ? "warn" : "neutral";
  return (
    <li className="flex gap-2 text-xs text-ink-2">
      <Mark tone={tone} mono>
        {i.code}
      </Mark>
      <span className="text-muted">{i.message}</span>
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
      className="control h-8 w-full text-xs"
    >
      <option value="">— pilih —</option>
      {cands.length > 0 && (
        <optgroup label="Kandidat mirip">
          {cands.map((c) => (
            <option key={`c-${c.value}`} value={String(c.value)}>
              {c.label} ({Math.round(c.score * 100)} %)
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
