import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessPemda, canUse, FITUR, requireUser } from "@/lib/auth/session";
import { loadRefData } from "@/lib/inject/reference-db";
import { getBatch, listRows } from "@/lib/inject/store";
import { fmtDate } from "@/lib/format";
import { Code, Mark, Stat } from "@/components/ui";
import { Review, type Options, type SerializedRow } from "./review";

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const user = await requireUser();
  const batch = await getBatch(batchId);
  if (!batch) notFound();
  if (!canAccessPemda(user, batch.pemdaKode)) throw new Error("Tidak berhak atas pemda ini");

  const rows = await listRows(batchId);
  const canEdit = canUse(user, FITUR.UPDATE_PEMBAHASAN);

  let options: Options = { skpd: [], satuan: [], misi: [], programPercepatan: [], subProgramPercepatan: [], kelompok: [], statusMusrenbang: [], dana: [] };
  if (batch.pemdaKode) {
    const ref = await loadRefData(batch.tahun, batch.pemdaKode);
    options = {
      skpd: ref.skpd.map((s) => ({ value: s.kodeUnit, label: s.namaUnit })).sort((a, b) => a.label.localeCompare(b.label)),
      satuan: ref.satuan.map((s) => ({ value: s.id, label: s.nama })).sort((a, b) => a.label.localeCompare(b.label)),
      misi: ref.misi.map((m) => ({ value: m.id, label: m.nama })),
      programPercepatan: ref.programPercepatan.map((p) => ({ value: p.id, label: p.nama, parent: p.misiId })),
      subProgramPercepatan: ref.subProgramPercepatan.map((s) => ({ value: s.id, label: s.nama, parent: s.ppId })),
      kelompok: ref.kelompok.map((k) => ({ value: k.id, label: k.nama })),
      statusMusrenbang: ref.statusMusrenbang.map((s) => ({ value: s.id, label: s.nama })),
      dana: ref.dana.filter((d) => d.otsus || /alokasi umum|bagi hasil|DAK|DAU|DBH/i.test(d.nama)).map((d) => ({ value: d.kode, label: d.nama })),
    };
  }

  const s = batch.summary;
  const approvedPending = rows.filter((r) => r.decision === "approved" && !r.appliedAt).length;
  const remaining = rows.filter((r) => !r.appliedAt && r.action !== "error" && r.decision !== "rejected").length;

  return (
    <div>
      <nav aria-label="Lokasi" className="text-xs text-muted">
        <Link href="/inject" className="hover:text-ink">
          Batch inject
        </Link>
        <span className="mx-1.5 text-neutral">/</span>
        <span className="text-ink">{batch.pemdaNama ?? "Pemda tidak terdeteksi"}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-rule pb-5">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.025em]">
            {batch.pemdaNama ?? "Pemda tidak terdeteksi"}
            {batch.pemdaKode && <Code className="ml-2 align-baseline text-[1rem] font-normal text-neutral">{batch.pemdaKode}</Code>}
          </h1>
          <p className="mt-2 truncate text-sm text-muted" title={batch.fileName}>
            {batch.fileName}
          </p>
          <p className="mt-0.5 text-xs text-neutral">
            Tahun RKPD {batch.tahun} · diunggah {fmtDate(batch.uploadedAt)} oleh {batch.uploadedBy} · batch <Code>{batch.id.slice(0, 8)}</Code>
          </p>
        </div>
        <div className="text-sm">
          {batch.status === "applied" ? (
            <Mark tone="ok">Semua baris ditulis{batch.appliedAt && ` · ${fmtDate(batch.appliedAt)}`}</Mark>
          ) : s.applied > 0 ? (
            <Mark tone="accent">
              {s.applied} ditulis · {remaining} masih ditinjau
            </Mark>
          ) : (
            <Mark tone="accent">Tahap tinjau · {remaining} baris</Mark>
          )}
        </div>
      </div>

      {(batch.warnings.length > 0 || batch.notes) && (
        <ul className="my-5 space-y-1 border-l-2 border-warn pl-3 text-sm text-ink-2">
          {batch.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
          {batch.notes && <li className="text-danger">{batch.notes}</li>}
        </ul>
      )}

      <dl className="grid grid-cols-2 border-b border-rule sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-rule [&>div]:lg:pl-6 [&>div:first-child]:lg:pl-0">
        <Stat label="Baris" value={s.rows} hint={s.sheets.map((x) => `${x.dataRows} ${x.kind.replace("_", " ")}`).join(" · ")} />
        <Stat label="Update" value={s.byAction.update} hint="usulan sudah ada" />
        <Stat label="Insert" value={s.byAction.insert} hint="dari baris RKPD" />
        <Stat label="Insert + RKPD baru" value={s.byAction.insert_with_rkpd} hint="perlu konfirmasi" tone={s.byAction.insert_with_rkpd ? "warn" : "neutral"} />
        <Stat label="Error" value={s.byAction.error} hint="tidak bisa ditulis" tone={s.byAction.error ? "danger" : "neutral"} />
        <Stat label="Ditulis" value={s.applied} hint={`${s.byDecision.approved - s.applied} siap ditulis · ${s.byDecision.pending} menunggu · ${s.byDecision.rejected} ditolak`} tone={s.applied ? "ok" : "neutral"} />
      </dl>

      <div className="mt-8">
        <Review batchId={batch.id} rows={JSON.parse(JSON.stringify(rows)) as SerializedRow[]} options={options} canEdit={canEdit} approvedPending={approvedPending} />
      </div>
    </div>
  );
}
