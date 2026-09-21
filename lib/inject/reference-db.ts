import { sql } from "@/lib/db";
import type { Alias, Daerah, Dana, RefData, SubKegiatan } from "./reference";

/** Load everything the resolver/classifier needs for one (tahun, pemda) from the legacy tables. */

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export async function loadDaerah(): Promise<Daerah[]> {
  const rows = await sql<{ kode_daerah: string; nama_daerah: string; jns_pemda: number }[]>`
    select kode_daerah, nama_daerah, jns_pemda from mst_daerah where kode_daerah is not null order by kode_daerah`;
  return rows.map((r) => ({ kode: r.kode_daerah, nama: r.nama_daerah, jns: Number(r.jns_pemda) }));
}

export async function loadAliases(pemdaKode: string): Promise<Alias[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select kind, scope, alias_norm, target_key, target_label from inject.alias where scope in ('', ${pemdaKode})`;
  return rows.map((r) => ({
    kind: String(r.kind),
    scope: String(r.scope),
    aliasNorm: String(r.alias_norm),
    targetKey: String(r.target_key),
    targetLabel: str(r.target_label),
  }));
}

export async function loadRefData(tahun: number, pemdaKode: string): Promise<RefData> {
  const daerah = await loadDaerah();
  const pemda = daerah.find((d) => d.kode === pemdaKode);
  if (!pemda) throw new Error(`Pemda ${pemdaKode} tidak ada di mst_daerah`);
  const rkpdTable = sql(`trx_rkpd_${tahun}`);

  const [skpd, subkeg, misi, pp, spp, kelompok, statusMusrenbang, satuan, danaOtsus, sipdDana, usulan, rkpd, aliases, template] =
    await Promise.all([
      sql<Record<string, unknown>[]>`
        select id_skpd, kode_skpd, kode_unit_skpd, nama_skpd, nama_unit_skpd, is_skpd
        from sipd_skpd where kode_daerah = ${pemdaKode} and tahun = ${tahun} and kode_unit_skpd is not null`,
      sql<Record<string, unknown>[]>`
        select kode_subkegiatan, nama_subkegiatan, jns_pemda, daerah_khusus, kode_urusan, nama_urusan,
               kode_bidang_urusan, nama_bidang_urusan, kode_program, nama_program, kode_kegiatan, nama_kegiatan,
               satuan, ref_satuan_id
        from sipd_subkegiatan where tahun = ${tahun}`,
      sql<Record<string, unknown>[]>`select id, nama from mst_misi order by id`,
      sql<Record<string, unknown>[]>`select id, mst_misi_id, nama from mst_program_percepatan order by id`,
      sql<Record<string, unknown>[]>`select id, mst_misi_id, mst_program_percepatan_id, nama from mst_subprogram_percepatan order by id`,
      sql<Record<string, unknown>[]>`select id, nama from ref_kelompok order by id`,
      sql<Record<string, unknown>[]>`select id, nama from ref_status_musrenbang order by id`,
      sql<Record<string, unknown>[]>`select id, nama from ref_satuan order by id`,
      sql<Record<string, unknown>[]>`select kode_subdana, nama_subdana from ref_dana_otsus`,
      sql<Record<string, unknown>[]>`select kode, nama from sipd_sumber_dana where tahun = ${tahun}`,
      sql<Record<string, unknown>[]>`
        select id, subkegiatan_kode, unitskpd_kode, mst_misi_id, mst_program_percepatan_id, mst_subprogram_percepatan_id,
               ref_kelompok_id, ref_status_musrenbang_id, ref_status_usulan_id, volume, pagu_anggaran,
               volume_final, pagu_anggaran_final, volume_akhir, pagu_anggaran_akhir, ref_satuan_id,
               kodesumberdana, namasumberdana, hasil_musrenbang, trx_rkpd_id
        from trx_musrenbang_usulan where tahun = ${tahun} and pemda_kode = ${pemdaKode}`,
      sql<Record<string, unknown>[]>`
        select sippp_rkpd_id, kodesubkegiatan, kodeunitskpd, namaunitskpd, kodeskpd, namaskpd, nilaipagu,
               targetsubkegiatan, kodesumberdana, namasumberdana, id_jadwal, namaaplikasi
        from ${rkpdTable} where kodepemda = ${pemdaKode}`,
      loadAliases(pemdaKode),
      sql<Record<string, unknown>[]>`
        select kodeprovinsi, namaprovinsi, namapemda, max(id_jadwal) as id_jadwal
        from ${rkpdTable} where kodepemda = ${pemdaKode} and coalesce(namaaplikasi,'') <> 'SIPPP'
        group by 1,2,3 order by 4 desc nulls last limit 1`,
    ]);

  const subMap = new Map<string, SubKegiatan[]>();
  for (const r of subkeg) {
    const s: SubKegiatan = {
      kode: String(r.kode_subkegiatan).trim(),
      nama: String(r.nama_subkegiatan ?? ""),
      jnsPemda: r.jns_pemda === "PROV" ? "PROV" : "KAB/KOTA",
      daerahKhusus: String(r.daerah_khusus ?? "UMUM"),
      kodeUrusan: str(r.kode_urusan),
      namaUrusan: str(r.nama_urusan),
      kodeBidangUrusan: str(r.kode_bidang_urusan),
      namaBidangUrusan: str(r.nama_bidang_urusan),
      kodeProgram: str(r.kode_program),
      namaProgram: str(r.nama_program),
      kodeKegiatan: str(r.kode_kegiatan),
      namaKegiatan: str(r.nama_kegiatan),
      satuan: str(r.satuan),
      refSatuanId: num(r.ref_satuan_id),
    };
    const list = subMap.get(s.kode) ?? [];
    list.push(s);
    subMap.set(s.kode, list);
  }

  const otsusKodes = new Set(danaOtsus.map((r) => String(r.kode_subdana)));
  const dana: Dana[] = [
    ...danaOtsus.map((r) => ({ kode: String(r.kode_subdana), nama: String(r.nama_subdana), otsus: true })),
    ...sipdDana.filter((r) => !otsusKodes.has(String(r.kode))).map((r) => ({ kode: String(r.kode), nama: String(r.nama), otsus: false })),
  ];

  return {
    tahun,
    pemda,
    daerah,
    skpd: skpd.map((r) => ({
      idSkpd: num(r.id_skpd),
      kodeSkpd: String(r.kode_skpd ?? r.kode_unit_skpd),
      kodeUnit: String(r.kode_unit_skpd),
      namaSkpd: String(r.nama_skpd ?? ""),
      namaUnit: String(r.nama_unit_skpd ?? ""),
      isSkpd: num(r.is_skpd),
    })),
    subkegiatan: subMap,
    misi: misi.map((r) => ({ id: Number(r.id), nama: String(r.nama) })),
    programPercepatan: pp.map((r) => ({ id: Number(r.id), misiId: Number(r.mst_misi_id), nama: String(r.nama) })),
    subProgramPercepatan: spp.map((r) => ({
      id: Number(r.id),
      misiId: Number(r.mst_misi_id),
      ppId: Number(r.mst_program_percepatan_id),
      nama: String(r.nama),
    })),
    kelompok: kelompok.map((r) => ({ id: Number(r.id), nama: String(r.nama) })),
    statusMusrenbang: statusMusrenbang.map((r) => ({ id: Number(r.id), nama: String(r.nama) })),
    satuan: satuan.map((r) => ({ id: Number(r.id), nama: String(r.nama) })),
    dana,
    usulan: usulan.map((r) => ({
      id: String(r.id),
      subkegiatanKode: String(r.subkegiatan_kode ?? "").trim(),
      unitskpdKode: String(r.unitskpd_kode ?? "").trim(),
      misiId: num(r.mst_misi_id),
      ppId: num(r.mst_program_percepatan_id),
      sppId: num(r.mst_subprogram_percepatan_id),
      kelompokId: num(r.ref_kelompok_id),
      statusMusrenbangId: num(r.ref_status_musrenbang_id),
      statusUsulanId: num(r.ref_status_usulan_id),
      volume: num(r.volume),
      paguAnggaran: num(r.pagu_anggaran),
      volumeFinal: num(r.volume_final),
      paguAnggaranFinal: num(r.pagu_anggaran_final),
      volumeAkhir: num(r.volume_akhir),
      paguAnggaranAkhir: num(r.pagu_anggaran_akhir),
      satuanId: num(r.ref_satuan_id),
      kodesumberdana: str(r.kodesumberdana),
      namasumberdana: str(r.namasumberdana),
      hasilMusrenbang: str(r.hasil_musrenbang),
      rkpdId: num(r.trx_rkpd_id),
    })),
    rkpd: rkpd.map((r) => ({
      id: Number(r.sippp_rkpd_id),
      kodeSubkegiatan: String(r.kodesubkegiatan ?? "").trim(),
      kodeUnitSkpd: String(r.kodeunitskpd ?? "").trim(),
      namaUnitSkpd: str(r.namaunitskpd),
      kodeSkpd: str(r.kodeskpd),
      namaSkpd: str(r.namaskpd),
      nilaiPagu: num(r.nilaipagu),
      targetSubkegiatan: str(r.targetsubkegiatan),
      kodesumberdana: str(r.kodesumberdana),
      namasumberdana: str(r.namasumberdana),
      idJadwal: num(r.id_jadwal),
      namaaplikasi: str(r.namaaplikasi),
    })),
    rkpdTemplate: template[0]
      ? {
          kodeprovinsi: str(template[0].kodeprovinsi),
          namaprovinsi: str(template[0].namaprovinsi),
          namapemda: str(template[0].namapemda),
          idJadwal: num(template[0].id_jadwal),
        }
      : null,
    aliases,
  };
}
