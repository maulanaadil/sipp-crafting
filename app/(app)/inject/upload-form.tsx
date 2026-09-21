"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui";
import { uploadBatch, type UploadState } from "./actions";

export function UploadForm({ tahun }: { tahun: number }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadBatch, undefined);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileId = useId();
  const tahunId = useId();

  return (
    <form action={action} className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="min-w-0">
        <span className="block text-xs font-medium text-muted">File hasil pendampingan</span>
        <div className="mt-1.5 flex items-center gap-3">
          <label htmlFor={fileId} className="press inline-flex h-9 cursor-pointer items-center rounded-md border border-rule-2 bg-paper px-3.5 text-sm font-medium hover:bg-paper-2">
            Pilih .xlsx
          </label>
          <input
            id={fileId}
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <span className={`max-w-[24rem] truncate text-sm ${fileName ? "text-ink" : "text-neutral"}`}>{fileName ?? "Belum ada file dipilih"}</span>
        </div>
      </div>
      <div>
        <label htmlFor={tahunId} className="block text-xs font-medium text-muted">
          Tahun RKPD
        </label>
        <input id={tahunId} type="number" name="tahun" defaultValue={tahun} className="control tnum mt-1.5 w-24" />
      </div>
      <Button type="submit" variant="primary" busy={pending} disabled={!fileName}>
        {pending ? "Memeriksa baris" : "Unggah dan periksa"}
      </Button>
      {state?.error && (
        <p role="alert" className="basis-full border-l-2 border-danger pl-3 text-sm text-ink-2">
          {state.error}
        </p>
      )}
      <p className="basis-full text-xs text-neutral">Pemda dibaca dari kolom Pemda. Tabel SIPPP tidak disentuh sampai Anda menekan Terapkan.</p>
    </form>
  );
}
