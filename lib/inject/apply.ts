import { randomBytes } from "node:crypto";
import { sql, type Tx } from "@/lib/db";
import type { RefData } from "./reference";
import { loadRefData } from "./reference-db";
import { getBatch, listRows, refreshSummary, type RowRecord } from "./store";

/**
 * Write approved rows into the legacy tables, all-or-nothing per batch.
 *
 * Mirrors what Usulan::saveUsulan() does in the PHP app, minus the bits that need a logged-in
 * SIPPP session (trx_jadwal_pemda progress flag) — see docs/REMARKS.md.
 */

export interface ApplyResult {
  batchId: string;
  applied: number;
  skipped: number;
  error?: string;
}

/** Columns of trx_musrenbang_usulan an update plan may touch. Anything else is refused. */
const UPDATABLE = new Set([
  "mst_misi_id",
  "mst_program_percepatan_id",
  "mst_subprogram_percepatan_id",
  "ref_kelompok_id",
  "ref_status_musrenbang_id",
  "volume_final",
  "pagu_anggaran_final",
  "volume_akhir",
  "pagu_anggaran_akhir",
  "ref_satuan_id",
  "kodesumberdana",
  "namasumberdana",
  "hasil_musrenbang",
]);

export async function applyBatch(batchId: string, user: string): Promise<ApplyResult> {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("Batch tidak ditemukan");
  if (!batch.pemdaKode) throw new Error("Batch tanpa pemda tidak bisa diterapkan");
  if (batch.status === "applying") throw new Error("Batch sedang diterapkan");

  const rows = (await listRows(batchId)).filter((r) => r.decision === "approved" && !r.appliedAt && r.action !== "error");
  if (!rows.length) return { batchId, applied: 0, skipped: 0 };

  const ref = await loadRefData(batch.tahun, batch.pemdaKode);
  const by = `inject:${user}`.slice(0, 50);
  await sql`update inject.batch set status = 'applying' where id = ${batchId}`;

  try {
    await sql.begin(async (tx) => {
      for (const row of rows) {
        const result = await applyRow(tx, row, ref, by, batchId);
        await tx`update inject.row set applied_at = now(), result = ${tx.json(result as never)} where id = ${row.id}`;
      }
      // multi-round review: stay in 'reviewing' while non-error rows are still undecided or approved-but-unapplied
      const [left] = await tx<{ n: number }[]>`
        select count(*)::int n from inject.row
        where batch_id = ${batchId} and applied_at is null and action <> 'error' and decision <> 'rejected'`;
      await tx`update inject.batch set status = ${left.n > 0 ? "reviewing" : "applied"}, applied_by = ${user}, applied_at = now() where id = ${batchId}`;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`update inject.batch set status = 'reviewing', notes = ${`Gagal diterapkan ${new Date().toISOString()}: ${msg}`} where id = ${batchId}`;
    await refreshSummary(batchId);
    return { batchId, applied: 0, skipped: rows.length, error: msg };
  }
  await refreshSummary(batchId);
  return { batchId, applied: rows.length, skipped: 0 };
}

async function audit(tx: Tx, batchId: string, rowId: number, table: string, pk: string, op: "insert" | "update" | "delete", before: unknown, after: unknown, by: string) {
  await tx`insert into inject.audit_log (batch_id, row_id, table_name, pk, op, before, after, by)
           values (${batchId}, ${rowId}, ${table}, ${pk}, ${op}, ${before === null ? null : tx.json(before as never)}, ${after === null ? null : tx.json(after as never)}, ${by})`;
}

async function applyRow(tx: Tx, row: RowRecord, ref: RefData, by: string, batchId: string): Promise<Record<string, unknown>> {
  const { plan } = row;
  const rkpdTable = tx(`trx_rkpd_${ref.tahun}`);
  const misi = {
    sipppmisikode: row.resolved.misiId.value,
    sipppprogramkode: row.resolved.programPercepatanId.value,
    sipppsubprogramkode: row.resolved.subProgramPercepatanId.value,
  };

  if (plan.action === "update") {
    if (plan.noop) return { op: "noop", usulanId: plan.usulanId };
    const [before] = await tx<Record<string, unknown>[]>`select * from trx_musrenbang_usulan where id = ${plan.usulanId!} for update`;
    if (!before) throw new Error(`Usulan ${plan.usulanId} hilang saat diterapkan (baris ${row.rowNo})`);

    const set: Record<string, unknown> = {};
    for (const [col, ch] of Object.entries(plan.changes)) {
      if (!UPDATABLE.has(col)) throw new Error(`Kolom ${col} tidak boleh diubah oleh inject`);
      set[col] = ch.to;
    }
    set.last_update_by = by;
    set.last_update_date = new Date();
    await tx`update trx_musrenbang_usulan set ${tx(set)} where id = ${plan.usulanId!}`;
    const [after] = await tx<Record<string, unknown>[]>`select * from trx_musrenbang_usulan where id = ${plan.usulanId!}`;
    await audit(tx, batchId, row.id, "trx_musrenbang_usulan", plan.usulanId!, "update", before, after, by);

    if ("kodesumberdana" in plan.changes) await syncSumberDana(tx, row, ref, by, batchId, plan.usulanId!, Number(after.volume_final), Number(after.pagu_anggaran_final));
    if (plan.rkpdId && misi.sipppmisikode) {
      await tx`update ${rkpdTable} set ${tx(misi)} where sippp_rkpd_id = ${plan.rkpdId}`;
    }
    return { op: "update", usulanId: plan.usulanId, columns: Object.keys(plan.changes) };
  }

  /* insert (optionally creating the RKPD row first) */
  let rkpdId = plan.rkpdId ?? null;
  if (plan.action === "insert_with_rkpd") {
    rkpdId = await insertRkpd(tx, row, ref, by, batchId);
  }
  const usulanId = randomBytes(8).toString("hex");
  const insert: Record<string, unknown> = { ...plan.insert!, id: usulanId, trx_rkpd_id: rkpdId, last_update_by: by, last_update_date: new Date() };
  await tx`insert into trx_musrenbang_usulan ${tx(insert)}`;
  const [after] = await tx<Record<string, unknown>[]>`select * from trx_musrenbang_usulan where id = ${usulanId}`;
  await audit(tx, batchId, row.id, "trx_musrenbang_usulan", usulanId, "insert", null, after, by);
  await syncSumberDana(tx, row, ref, by, batchId, usulanId, Number(insert.volume_final), Number(insert.pagu_anggaran_final));
  if (rkpdId && misi.sipppmisikode) await tx`update ${rkpdTable} set ${tx(misi)} where sippp_rkpd_id = ${rkpdId}`;
  return { op: plan.action, usulanId, rkpdId };
}

/**
 * Bring trx_musrenbang_usulan_sumberdana in line with the agreed sumber dana.
 * Existing child rows for codes that stay are kept (their SIPD `anggaran` is history we
 * don't have in the spreadsheet); rows for dropped codes are deleted; new codes are added.
 * The agreed total is recorded on the first (Otsus) sumber dana — the spreadsheet does not
 * split it, and the review UI warns about this (DANA_GANDA).
 */
async function syncSumberDana(tx: Tx, row: RowRecord, ref: RefData, by: string, batchId: string, usulanId: string, volumeFinal: number, anggaranFinal: number) {
  const wanted = row.plan.dana;
  if (!wanted.length) return;
  const existing = await tx<Record<string, unknown>[]>`
    select * from trx_musrenbang_usulan_sumberdana where trx_musrenbang_usulan_id = ${usulanId}`;
  const keep = new Set(wanted.map((d) => d.kode));

  for (const e of existing) {
    if (!keep.has(String(e.kode_sumberdana))) {
      await tx`delete from trx_musrenbang_usulan_sumberdana where trx_musrenbang_usulan_id = ${usulanId} and kode_sumberdana = ${String(e.kode_sumberdana)}`;
      await audit(tx, batchId, row.id, "trx_musrenbang_usulan_sumberdana", `${usulanId}/${e.kode_sumberdana}`, "delete", e, null, by);
    }
  }
  for (const [i, d] of wanted.entries()) {
    const first = i === 0;
    const e = existing.find((x) => String(x.kode_sumberdana) === d.kode);
    const finals = { volume_final: first ? volumeFinal : null, anggaran_final: first ? anggaranFinal : null };
    if (e) {
      await tx`update trx_musrenbang_usulan_sumberdana set ${tx({ ...finals, update_oleh: by, update_date: new Date() })}
               where trx_musrenbang_usulan_id = ${usulanId} and kode_sumberdana = ${d.kode}`;
      await audit(tx, batchId, row.id, "trx_musrenbang_usulan_sumberdana", `${usulanId}/${d.kode}`, "update", e, { ...e, ...finals }, by);
    } else {
      const ins = {
        trx_musrenbang_usulan_id: usulanId,
        kode_pemda: ref.pemda.kode,
        kode_subkegiatan: row.resolved.subkegiatanKode.value,
        tahun: ref.tahun,
        kode_sumberdana: d.kode,
        nama_sumberdana: d.nama,
        inserted_type: 2,
        volume: first ? volumeFinal : null,
        anggaran: first ? anggaranFinal : null,
        ...finals,
        keterangan: first ? null : "Pembagian anggaran per sumber dana belum ditentukan (inject)",
        update_oleh: by,
        update_date: new Date(),
      };
      await tx`insert into trx_musrenbang_usulan_sumberdana ${tx(ins)}`;
      await audit(tx, batchId, row.id, "trx_musrenbang_usulan_sumberdana", `${usulanId}/${d.kode}`, "insert", null, ins, by);
    }
  }
}

/** Legacy Usulan::saveUsulan(): a sub-kegiatan the SIPD draft doesn't have gets its own RKPD row tagged namaaplikasi='SIPPP'. */
async function insertRkpd(tx: Tx, row: RowRecord, ref: RefData, by: string, batchId: string): Promise<number> {
  const unit = row.resolved.unitSkpdKode.value!;
  const kode = row.resolved.subkegiatanKode.value!;
  const skpd = ref.skpd.find((s) => s.kodeUnit === unit);
  const sub = ref.subkegiatan.get(kode)?.find((s) => s.jnsPemda === (ref.pemda.jns === 1 ? "PROV" : "KAB/KOTA"));
  const tpl = ref.rkpdTemplate;
  if (!skpd || !sub || !tpl?.idJadwal) throw new Error(`Data referensi RKPD tidak lengkap untuk baris ${row.rowNo}`);
  const rkpdTable = tx(`trx_rkpd_${ref.tahun}`);

  const [dup] = await tx<{ n: number }[]>`
    select count(*)::int n from ${rkpdTable} where kodepemda = ${ref.pemda.kode} and kodeunitskpd = ${unit} and kodesubkegiatan = ${kode}`;
  if (dup.n > 0) throw new Error(`Kode ${kode} pada unit ${unit} sudah ada di RKPD (baris ${row.rowNo})`);

  const insert = row.plan.insert!;
  const rk = {
    tahun: ref.tahun,
    kodepemda: ref.pemda.kode,
    namapemda: tpl.namapemda,
    kodeprovinsi: tpl.kodeprovinsi,
    namaprovinsi: tpl.namaprovinsi,
    kodeskpd: skpd.kodeSkpd,
    namaskpd: skpd.namaSkpd,
    kodeunitskpd: skpd.kodeUnit,
    namaunitskpd: skpd.namaUnit,
    kodeurusanprogram: sub.kodeUrusan,
    namaurusanprogram: sub.namaUrusan,
    kodeprogram: sub.kodeProgram,
    namaprogram: sub.namaProgram,
    kodekegiatan: sub.kodeKegiatan,
    namakegiatan: sub.namaKegiatan,
    kodesubkegiatan: sub.kode,
    namasubkegiatan: sub.nama,
    kodesumberdana: (insert.kodesumberdana as string | null) ?? null,
    namasumberdana: (insert.namasumberdana as string | null) ?? null,
    targetsubkegiatan: String(insert.volume_final),
    satuanindikatorsubkegiatan: sub.satuan,
    nilaipagu: insert.pagu_anggaran_final as number,
    sipppmisikode: row.resolved.misiId.value,
    sipppprogramkode: row.resolved.programPercepatanId.value,
    sipppsubprogramkode: row.resolved.subProgramPercepatanId.value,
    namaaplikasi: "SIPPP",
    // legacy comment: "sesuai diskusi di WA id_unik_sub_kegiatan dari SIPPP di 0 kan"
    id_unik_sub_kegiatan: 0,
    id_jadwal: tpl.idJadwal,
    get_data_time: new Date().toISOString().slice(0, 19).replace("T", " "),
    update_tanggal: new Date(),
    update_oleh: by,
  };
  const [ins] = await tx<{ sippp_rkpd_id: number }[]>`insert into ${rkpdTable} ${tx(rk)} returning sippp_rkpd_id`;
  await audit(tx, batchId, row.id, `trx_rkpd_${ref.tahun}`, String(ins.sippp_rkpd_id), "insert", null, rk, by);
  return ins.sippp_rkpd_id;
}
