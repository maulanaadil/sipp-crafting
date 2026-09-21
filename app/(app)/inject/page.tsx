import Link from "next/link";
import { TAHUN } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { listBatches } from "@/lib/inject/store";
import { fmtDate } from "@/lib/format";
import { Code, Mark, type Tone } from "@/components/ui";
import { UploadForm } from "./upload-form";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  parsed: { label: "terbaca", tone: "neutral" },
  reviewing: { label: "ditinjau", tone: "accent" },
  applying: { label: "menerapkan", tone: "warn" },
  applied: { label: "diterapkan", tone: "ok" },
  failed: { label: "gagal", tone: "danger" },
};

export default async function InjectPage() {
  await requireUser();
  const batches = await listBatches();

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.025em]">Batch inject</h1>
          <p className="mt-3 max-w-[40ch] text-sm leading-6 text-muted">
            Satu file, satu pemda. Setiap baris dicocokkan ke <Code>trx_musrenbang_usulan</Code> dan RKPD, lalu ditinjau sebelum ditulis.
          </p>
        </div>
        <div className="border-t border-rule pt-5 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-1">
          <UploadForm tahun={TAHUN} />
        </div>
      </div>

      <section className="mt-12">
        <div className="flex items-baseline justify-between border-b border-rule pb-2">
          <h2 className="text-sm font-medium">Riwayat</h2>
          <span className="tnum font-mono text-xs text-neutral">{batches.length} batch</span>
        </div>
        {batches.length === 0 ? (
          <div className="py-12 text-sm text-muted">
            <p>Belum ada batch.</p>
            <p className="mt-1 text-neutral">Unggah satu file pendampingan untuk melihat hasil pencocokannya.</p>
          </div>
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[15rem]" />
              <col />
              <col className="w-[4.5rem]" />
              <col className="w-[4.5rem]" />
              <col className="w-[4.5rem]" />
              <col className="w-[4.5rem]" />
              <col className="w-[11rem]" />
              <col className="w-[13rem]" />
            </colgroup>
            <thead className="text-left text-muted small-caps-label">
              <tr className="border-b border-rule">
                <th className="py-2 pr-4 font-normal">Pemda</th>
                <th className="py-2 pr-4 font-normal">File</th>
                <th className="py-2 pr-4 text-right font-normal">Baris</th>
                <th className="py-2 pr-4 text-right font-normal">Update</th>
                <th className="py-2 pr-4 text-right font-normal">Insert</th>
                <th className="py-2 pr-4 text-right font-normal">Error</th>
                <th className="py-2 pr-4 font-normal">Status</th>
                <th className="py-2 font-normal">Diunggah</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {batches.map((b) => {
                const st = STATUS[b.status] ?? STATUS.parsed;
                return (
                  <tr key={b.id} className="border-b border-rule transition-colors duration-[var(--dur-short)] hover:bg-paper-2">
                    <td className="py-2.5 pr-4">
                      <Link href={`/inject/${b.id}`} className="font-medium text-ink underline-offset-2 hover:underline">
                        {b.pemdaNama ?? <span className="text-neutral">Pemda tidak terdeteksi</span>}
                      </Link>{" "}
                      <Code className="text-neutral">{b.pemdaKode}</Code>
                    </td>
                    <td className="truncate py-2.5 pr-4 text-muted" title={b.fileName}>
                      {b.fileName}
                    </td>
                    <td className="py-2.5 pr-4 text-right">{b.summary.rows}</td>
                    <td className="py-2.5 pr-4 text-right">{b.summary.byAction.update}</td>
                    <td className="py-2.5 pr-4 text-right">{b.summary.byAction.insert + b.summary.byAction.insert_with_rkpd}</td>
                    <td className={`py-2.5 pr-4 text-right ${b.summary.byAction.error ? "text-danger" : "text-neutral"}`}>{b.summary.byAction.error}</td>
                    <td className="py-2.5 pr-4">
                      <Mark tone={st.tone}>
                        {st.label}
                        {b.summary.applied > 0 && <span className="text-neutral">· {b.summary.applied} ditulis</span>}
                      </Mark>
                    </td>
                    <td className="py-2.5 text-muted">
                      {fmtDate(b.uploadedAt)} <span className="text-neutral">· {b.uploadedBy}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
