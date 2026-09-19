import Link from "next/link";
import { TAHUN } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { listBatches } from "@/lib/inject/store";
import { fmtDate } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { UploadForm } from "./upload-form";

const STATUS_TONE = { parsed: "neutral", reviewing: "info", applying: "warn", applied: "success", failed: "error" } as const;
const STATUS_LABEL = { parsed: "terbaca", reviewing: "ditinjau", applying: "menerapkan", applied: "diterapkan", failed: "gagal" } as const;

export default async function InjectPage() {
  await requireUser();
  const batches = await listBatches();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Batch inject</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Satu file = satu pemda. Baris dicocokkan ke <code className="font-mono text-xs">trx_musrenbang_usulan</code> dan RKPD, lalu Anda meninjau
          sebelum apa pun ditulis.
        </p>
      </div>

      <Card className="p-4">
        <UploadForm tahun={TAHUN} />
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr className="border-b border-zinc-200">
              <th className="px-4 py-2 font-medium">Pemda</th>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium text-right">Baris</th>
              <th className="px-4 py-2 font-medium text-right">Update</th>
              <th className="px-4 py-2 font-medium text-right">Insert</th>
              <th className="px-4 py-2 font-medium text-right">Error</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Diunggah</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  Belum ada batch. Unggah file pendampingan untuk mulai.
                </td>
              </tr>
            )}
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-2.5">
                  <Link href={`/inject/${b.id}`} className="font-medium hover:underline">
                    {b.pemdaNama ?? <span className="text-zinc-400">tidak terdeteksi</span>}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-zinc-500">{b.pemdaKode}</span>
                </td>
                <td className="max-w-xs truncate px-4 py-2.5 text-zinc-600" title={b.fileName}>
                  {b.fileName}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{b.summary.rows}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{b.summary.byAction.update}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{b.summary.byAction.insert + b.summary.byAction.insert_with_rkpd}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{b.summary.byAction.error || <span className="text-zinc-400">0</span>}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                  {b.summary.applied > 0 && <span className="ml-2 text-xs text-zinc-500">{b.summary.applied} diterapkan</span>}
                </td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {fmtDate(b.uploadedAt)} <span className="text-zinc-400">· {b.uploadedBy}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
