import type { RefData, SubKegiatan } from "@/lib/inject/reference";
import type { RawRow, Scalar } from "@/lib/inject/types";
import { COLUMNS, type Col } from "@/lib/inject/types";

/** Small, hand-written reference set for Kab. Deiyai (94.08) — no database needed. */

function sub(kode: string, nama: string, jns: SubKegiatan["jnsPemda"], satuan = "Unit"): SubKegiatan {
  return {
    kode,
    nama,
    jnsPemda: jns,
    daerahKhusus: "UMUM",
    kodeUrusan: kode.slice(0, 1),
    namaUrusan: "URUSAN",
    kodeBidangUrusan: kode.slice(0, 4),
    namaBidangUrusan: "BIDANG",
    kodeProgram: kode.slice(0, 7),
    namaProgram: "PROGRAM",
    kodeKegiatan: kode.slice(0, 12),
    namaKegiatan: "Kegiatan",
    satuan,
    refSatuanId: 1,
  };
}

export function makeRef(): RefData {
  const subs = [
    sub("1.02.02.2.01.0023", "Pengadaan Obat, Bahan Habis Pakai, Bahan Medis Habis Pakai", "KAB/KOTA", "Paket"),
    sub("1.02.02.2.01.0006", "Pengembangan Puskesmas", "KAB/KOTA"),
    sub("1.01.02.2.01.0047", "Pembangunan Ruang Kelas Baru", "KAB/KOTA", "Ruang"),
    sub("2.17.06.2.01.0009", "Pemberdayaan Koperasi dengan Keanggotaan OAP", "KAB/KOTA"),
    sub("2.07.03.1.01.0001", "Proses Pelaksanaan Pendidikan dan Pelatihan Keterampilan", "PROV"),
  ];
  const subkegiatan = new Map<string, SubKegiatan[]>();
  for (const s of subs) subkegiatan.set(s.kode, [s]);

  return {
    tahun: 2027,
    pemda: { kode: "94.08", nama: "Kab. Deiyai", jns: 2 },
    daerah: [
      { kode: "91", nama: "Provinsi Papua", jns: 1 },
      { kode: "91.03", nama: "Kab. Jayapura", jns: 2 },
      { kode: "91.71", nama: "Kota Jayapura", jns: 3 },
      { kode: "92", nama: "Provinsi Papua Barat", jns: 1 },
      { kode: "92.03", nama: "Kab. Fak Fak", jns: 2 },
      { kode: "94.08", nama: "Kab. Deiyai", jns: 2 },
      { kode: "96", nama: "Provinsi Papua Barat Daya", jns: 1 },
      { kode: "96.01", nama: "Kab. Sorong", jns: 2 },
      { kode: "96.71", nama: "Kota Sorong", jns: 3 },
    ],
    skpd: [
      { idSkpd: 1, kodeSkpd: "1.02.0.00.0.00.01.0000", kodeUnit: "1.02.0.00.0.00.01.0000", namaSkpd: "Dinas Kesehatan", namaUnit: "Dinas Kesehatan", isSkpd: 1 },
      { idSkpd: 2, kodeSkpd: "1.01.0.00.0.00.01.0000", kodeUnit: "1.01.0.00.0.00.01.0000", namaSkpd: "Dinas Pendidikan", namaUnit: "Dinas Pendidikan", isSkpd: 1 },
      { idSkpd: 3, kodeSkpd: "1.02.0.00.0.00.02.0000", kodeUnit: "1.02.0.00.0.00.02.0000", namaSkpd: "Rumah Sakit Umum Daerah Pratama", namaUnit: "Rumah Sakit Umum Daerah Pratama", isSkpd: 1 },
      { idSkpd: 4, kodeSkpd: "2.18.0.00.0.00.01.0000", kodeUnit: "2.18.0.00.0.00.01.0000", namaSkpd: "Dinas Penanaman Modal, Perijinan dan Koperasi", namaUnit: "Dinas Penanaman Modal, Perijinan dan Koperasi", isSkpd: 1 },
    ],
    subkegiatan,
    misi: [
      { id: 1, nama: "Papua Sehat" },
      { id: 2, nama: "Papua Cerdas" },
      { id: 3, nama: "Papua Produktif" },
      { id: 4, nama: "Infrastruktur Dasar dan Konektivitas" },
    ],
    programPercepatan: [
      { id: 2, misiId: 1, nama: "Akselerasi Akses dan Mutu Pelayanan Kesehatan" },
      { id: 4, misiId: 2, nama: "Pengembangan Sekolah Sepanjang Hari" },
      { id: 7, misiId: 3, nama: "Pengembangan Ekonomi Lokal Berbasis Komoditas Unggulan" },
      { id: 8, misiId: 3, nama: "Pengembangan Pariwisata Rintisan dan Ekonomi Kreatif" },
      { id: 12, misiId: 4, nama: "Peningkatan Infrastruktur Wilayah" },
    ],
    subProgramPercepatan: [
      { id: 2, misiId: 1, ppId: 2, nama: "Pemenuhan Standar Pelayanan Minimal (SPM) Kesehatan" },
      { id: 9, misiId: 2, ppId: 4, nama: "Pengembangan Sekolah Sepanjang Hari" },
      { id: 22, misiId: 3, ppId: 7, nama: "Pengembangan Ekonomi Lokal di Daerah Tertinggal" },
      { id: 25, misiId: 3, ppId: 8, nama: "Pengembangan Ekonomi Lokal di Daerah Tertinggal" },
      { id: 40, misiId: 4, ppId: 12, nama: "Peningkatan Jalan dan Jembatan yang Terintegrasi" },
    ],
    kelompok: [
      { id: 1, nama: "PAPUA SEHAT" },
      { id: 2, nama: "PAPUA CERDAS" },
      { id: 3, nama: "PAPUA PRODUKTIF" },
    ],
    statusMusrenbang: [
      { id: 1, nama: "BELUM TERBAHAS" },
      { id: 2, nama: "TIDAK DIREKOMENDASIKAN" },
      { id: 3, nama: "DIREKOMENDASIKAN" },
    ],
    satuan: [
      { id: 1, nama: "Unit" },
      { id: 2, nama: "Ruang" },
      { id: 3, nama: "Paket" },
      { id: 4, nama: "Peserta didik" },
      { id: 5, nama: "Orang" },
      { id: 8, nama: "Dokumen" },
    ],
    dana: [
      { kode: "2.2.01.03.011.00002", nama: "Dana Otonomi Khusus 1,25%-Papua-Kesehatan", otsus: true },
      { kode: "2.2.01.03.011.00001", nama: "Dana Otonomi Khusus 1,25%-Papua-Pendidikan", otsus: true },
      { kode: "2.2.01.03.011.00003", nama: "Dana Otonomi Khusus 1,25%-Papua-Pemberdayaan Ekonomi Masyarakat", otsus: true },
      { kode: "1.2.01.07", nama: "Dana Bagi Hasil (DBH)", otsus: false },
      { kode: "1.2.01.01", nama: "Dana Alokasi Umum (DAU)", otsus: false },
    ],
    usulan: [
      {
        id: "aaaa000000000001",
        subkegiatanKode: "1.02.02.2.01.0023",
        unitskpdKode: "1.02.0.00.0.00.01.0000",
        misiId: 1,
        ppId: 2,
        sppId: 2,
        kelompokId: 1,
        statusMusrenbangId: 3,
        statusUsulanId: 3,
        volume: 5,
        paguAnggaran: 8000000000,
        volumeFinal: 5,
        paguAnggaranFinal: 8000000000,
        volumeAkhir: 5,
        paguAnggaranAkhir: 8000000000,
        satuanId: 3,
        kodesumberdana: "2.2.01.03.011.00002",
        namasumberdana: "Dana Otonomi Khusus 1,25%-Papua-Kesehatan",
        hasilMusrenbang: "<p>Direkomendasikan Hasil Musrenbang Otsus</p>",
        rkpdId: 501,
      },
    ],
    rkpd: [
      { id: 501, kodeSubkegiatan: "1.02.02.2.01.0023", kodeUnitSkpd: "1.02.0.00.0.00.01.0000", namaUnitSkpd: "Dinas Kesehatan", kodeSkpd: null, namaSkpd: null, nilaiPagu: 8000000000, targetSubkegiatan: "5", kodesumberdana: null, namasumberdana: null, idJadwal: 77, namaaplikasi: "SIPD" },
      { id: 502, kodeSubkegiatan: "1.02.02.2.01.0006", kodeUnitSkpd: "1.02.0.00.0.00.01.0000", namaUnitSkpd: "Dinas Kesehatan", kodeSkpd: null, namaSkpd: null, nilaiPagu: 1000000000, targetSubkegiatan: "1", kodesumberdana: null, namasumberdana: null, idJadwal: 77, namaaplikasi: "SIPD" },
    ],
    rkpdTemplate: { kodeprovinsi: "94", namaprovinsi: "Papua Tengah", namapemda: "Kab. Deiyai", idJadwal: 77 },
    aliases: [],
  };
}

const TEMPLATE: Record<Col, Scalar> = {
  no: 1,
  status: "DIREKOMENDASIKAN",
  desk: "PAPUA SEHAT",
  misi: "Papua Sehat",
  programPercepatan: "Akselerasi Akses dan Mutu Pelayanan Kesehatan",
  subProgramPercepatan: "Pemenuhan Standar Pelayanan Minimal (SPM) Kesehatan",
  pemda: "Kab. Deiyai",
  unitSkpd: "DINAS KESEHATAN",
  program: "PROGRAM PEMENUHAN UPAYA KESEHATAN",
  kegiatan: "Penyediaan Fasilitas Pelayanan Kesehatan",
  kodeSubKegiatan: "1.02.02.2.01.0023",
  subKegiatan: "Pengadaan Obat, Bahan Habis Pakai, Bahan Medis Habis Pakai",
  sumberDana: "Dana Otonomi Khusus 1,25%-Papua-Kesehatan",
  volume: 5,
  satuan: "Paket",
  anggaran: 8000000000,
  kategoriUsulan: "Rancangan RKPD",
  catatan: "Direkomendasikan Hasil Musrenbang Otsus",
};

export function makeRow(over: Partial<Record<Col, Scalar>> = {}, sheetKind: RawRow["sheetKind"] = "selaras", rowNo = 2): RawRow {
  const cells = { ...TEMPLATE, ...over } as Record<Col, Scalar>;
  for (const c of COLUMNS) if (!(c in cells)) cells[c] = null;
  return { sheet: "test", sheetKind, rowNo, cells };
}
