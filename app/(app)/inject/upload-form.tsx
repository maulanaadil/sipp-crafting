"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { uploadBatch, type UploadState } from "./actions";

export function UploadForm({ tahun }: { tahun: number }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadBatch, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="text-xs font-medium text-zinc-600">File hasil pendampingan (.xlsx)</span>
        <input
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="mt-1 block h-9 w-80 rounded-md border border-zinc-300 bg-white text-sm file:mr-3 file:h-full file:border-0 file:bg-zinc-100 file:px-3 file:text-sm file:font-medium file:text-zinc-700"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-zinc-600">Tahun RKPD</span>
        <input
          type="number"
          name="tahun"
          defaultValue={tahun}
          className="mt-1 h-9 w-24 rounded-md border border-zinc-300 bg-white px-3 text-sm tabular-nums"
        />
      </label>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Memproses…" : "Unggah & periksa"}
      </Button>
      {state?.error && <p className="basis-full text-sm text-red-700">{state.error}</p>}
      <p className="basis-full text-xs text-zinc-500">
        Pemda dideteksi dari kolom Pemda. Tidak ada yang ditulis ke tabel SIPPP sampai Anda menekan “Terapkan”.
      </p>
    </form>
  );
}
