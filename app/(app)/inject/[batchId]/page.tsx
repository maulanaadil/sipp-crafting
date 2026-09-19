import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessPemda, canUse, FITUR, requireUser } from "@/lib/auth/session";
import { loadRefData } from "@/lib/inject/reference-db";
import { getBatch, listRows } from "@/lib/inject/store";
import { fmtDate } from "@/lib/format";
import { Badge, Card, Tile } from "@/components/ui";
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-zinc-500">
            <Link href="/inject" className="hover:underline">
              Batch inject
            </Link>{" "}
            / {batch.id.slice(0, 8)}
          </div>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
            {batch.pemdaNama ?? "Pemda tidak terdeteksi"} <span className="font-mono text-base font-normal text-zinc-500">{batch.pemdaKode}</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {batch.fileName} · tahun {batch.tahun} · diunggah {fmtDate(batch.uploadedAt)} oleh {batch.uploadedBy}
            {batch.appliedAt && (
              <>
                {" "}
                · <span className="text-emerald-700">diterapkan {fmtDate(batch.appliedAt)} oleh {batch.appliedBy}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {batch.status === "applied" ? (
            <Badge tone="success">Semua diterapkan</Badge>
          ) : s.applied > 0 ? (
            <Badge tone="info">Sebagian diterapkan · {s.applied} baris</Badge>
          ) : (
            <Badge tone="info">Tahap tinjau</Badge>
          )}
        </div>
      </div>

      {(batch.warnings.length > 0 || batch.notes) && (
        <Card className="border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
          <ul className="list-disc space-y-0.5 pl-5">
            {batch.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {batch.notes && <li className="text-red-800">{batch.notes}</li>}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Tile label="Baris" value={s.rows} hint={s.sheets.map((x) => `${x.dataRows} ${x.kind}`).join(" · ")} />
        <Tile label="Update" value={s.byAction.update} hint="usulan sudah ada" />
        <Tile label="Insert" value={s.byAction.insert} hint="dari baris RKPD" tone="info" />
        <Tile label="Insert + RKPD baru" value={s.byAction.insert_with_rkpd} hint="perlu konfirmasi" tone="warn" />
        <Tile label="Error" value={s.byAction.error} hint="tidak bisa ditulis" tone={s.byAction.error ? "error" : "neutral"} />
        <Tile
          label="Disetujui"
          value={`${s.byDecision.approved}`}
          hint={`${s.applied} diterapkan · ${s.byDecision.pending} belum diputuskan · ${s.byDecision.rejected} ditolak`}
          tone="success"
        />
      </div>

      <Review
        batchId={batch.id}
        rows={JSON.parse(JSON.stringify(rows)) as SerializedRow[]}
        options={options}
        canEdit={canEdit}
        approvedPending={approvedPending}
      />
    </div>
  );
}
