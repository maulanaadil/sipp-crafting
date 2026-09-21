/**
 * Shapes of the reference data the resolver/classifier work against, for one (tahun, pemda).
 * Pure types + helpers only; loading from the legacy tables lives in ./reference-db.ts so the
 * pipeline core can be unit-tested without a database.
 */

export interface Daerah {
  kode: string;
  nama: string;
  /** 1 provinsi, 2 kabupaten, 3 kota (mst_daerah.jns_pemda) */
  jns: number;
}

export interface Skpd {
  idSkpd: number | null;
  kodeSkpd: string;
  kodeUnit: string;
  namaSkpd: string;
  namaUnit: string;
  isSkpd: number | null;
}

export interface SubKegiatan {
  kode: string;
  nama: string;
  jnsPemda: "PROV" | "KAB/KOTA";
  daerahKhusus: string;
  kodeUrusan: string | null;
  namaUrusan: string | null;
  kodeBidangUrusan: string | null;
  namaBidangUrusan: string | null;
  kodeProgram: string | null;
  namaProgram: string | null;
  kodeKegiatan: string | null;
  namaKegiatan: string | null;
  satuan: string | null;
  refSatuanId: number | null;
}

export interface Named {
  id: number;
  nama: string;
}
export interface ProgramPercepatan extends Named {
  misiId: number;
}
export interface SubProgramPercepatan extends Named {
  misiId: number;
  ppId: number;
}
export interface Dana {
  kode: string;
  nama: string;
  /** true when the code is in ref_dana_otsus (Otsus/DBH/DTI), false for other SIPD sumber dana */
  otsus: boolean;
}

export interface Usulan {
  id: string;
  subkegiatanKode: string;
  unitskpdKode: string;
  misiId: number | null;
  ppId: number | null;
  sppId: number | null;
  kelompokId: number | null;
  statusMusrenbangId: number | null;
  statusUsulanId: number | null;
  volume: number | null;
  paguAnggaran: number | null;
  volumeFinal: number | null;
  paguAnggaranFinal: number | null;
  volumeAkhir: number | null;
  paguAnggaranAkhir: number | null;
  satuanId: number | null;
  kodesumberdana: string | null;
  namasumberdana: string | null;
  hasilMusrenbang: string | null;
  rkpdId: number | null;
}

export interface Rkpd {
  id: number;
  kodeSubkegiatan: string;
  kodeUnitSkpd: string;
  namaUnitSkpd: string | null;
  kodeSkpd: string | null;
  namaSkpd: string | null;
  nilaiPagu: number | null;
  targetSubkegiatan: string | null;
  kodesumberdana: string | null;
  namasumberdana: string | null;
  idJadwal: number | null;
  namaaplikasi: string | null;
}

export interface Alias {
  kind: string;
  scope: string;
  aliasNorm: string;
  targetKey: string;
  targetLabel: string | null;
}

export interface RefData {
  tahun: number;
  pemda: Daerah;
  daerah: Daerah[];
  skpd: Skpd[];
  /** kode → entries (UMUM + daerah_khusus variants share a code) */
  subkegiatan: Map<string, SubKegiatan[]>;
  misi: Named[];
  programPercepatan: ProgramPercepatan[];
  subProgramPercepatan: SubProgramPercepatan[];
  kelompok: Named[];
  statusMusrenbang: Named[];
  satuan: Named[];
  dana: Dana[];
  usulan: Usulan[];
  rkpd: Rkpd[];
  /** Metadata copied from an existing SIPD RKPD row when we must create a new one. */
  rkpdTemplate: { kodeprovinsi: string | null; namaprovinsi: string | null; namapemda: string | null; idJadwal: number | null } | null;
  aliases: Alias[];
}

/** Which jenis a sub-kegiatan code must carry to be usable by this pemda. */
export function requiredJenis(pemda: Daerah): SubKegiatan["jnsPemda"] {
  return pemda.jns === 1 ? "PROV" : "KAB/KOTA";
}
