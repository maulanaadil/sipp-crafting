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
      <nav className="font-mono text-xs text-muted">
        <Link href="/inject" className="hover:text-ink">
          Batch inject
        </Link>{" "}
        <span className="text-neutral">/</span> {batch.id.slice(0, 8)}
      </nav>

      <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.025em]">
            {batch.pemdaNama ?? "Pemda tidak terdeteksi"} <Code className="ml-1 font-normal text-neutral">{batch.pemdaKode}</Code>
          </h1>
          <p className="mt-2 text-sm text-muted">
            {batch.fileName} · tahun {batch.tahun} · diunggah {fmtDate(batch.uploadedAt)} oleh {batch.uploadedBy}
          </p>
        </div>
        <div className="text-sm lg:text-right">
          {batch.status === "applied" ? (
            <Mark tone="ok">Semua baris sudah ditulis {batch.appliedAt && `· ${fmtDate(batch.appliedAt)}`}</Mark>
          ) : s.applied > 0 ? (
            <Mark tone="accent">
              {s.applied} baris ditulis · {remaining} masih ditinjau
            </Mark>
          ) : (
            <Mark tone="accent">Tahap tinjau · {remaining} baris</Mark>
          )}
        </div>
      </div>

      {(batch.warnings.length > 0 || batch.notes) && (
        <ul className="mt-6 space-y-1 border-l-2 border-warn pl-3 text-sm text-ink-2">
          {batch.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
          {batch.notes && <li className="text-danger">{batch.notes}</li>}
        </ul>
      )}

      <dl className="mt-8 grid grid-cols-2 border-y border-rule sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-rule [&>div]:lg:pl-6 [&>div:first-child]:lg:pl-0">
        <Stat label="Baris" value={s.rows} hint={s.sheets.map((x) => `${x.dataRows} ${x.kind.replace("_", " ")}`).join(" · ")} />
        <Stat label="Update" value={s.byAction.update} hint="usulan sudah ada" />
        <Stat label="Insert" value={s.byAction.insert} hint="dari baris RKPD" />
        <Stat label="Insert + RKPD baru" value={s.byAction.insert_with_rkpd} hint="perlu konfirmasi" tone={s.byAction.insert_with_rkpd ? "warn" : "neutral"} />
        <Stat label="Error" value={s.byAction.error} hint="tidak bisa ditulis" tone={s.byAction.error ? "danger" : "neutral"} />
        <Stat label="Ditulis" value={s.applied} hint={`${s.byDecision.approved - s.applied} disetujui menunggu · ${s.byDecision.rejected} ditolak`} tone={s.applied ? "ok" : "neutral"} />
      </dl>

      <div className="mt-8">
        <Review batchId={batch.id} rows={JSON.parse(JSON.stringify(rows)) as SerializedRow[]} options={options} canEdit={canEdit} approvedPending={approvedPending} />
      </div>
    </div>
  );
}
