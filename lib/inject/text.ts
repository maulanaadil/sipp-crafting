import type { Candidate, Scalar } from "./types";

/** Trim, collapse whitespace, drop zero-width/nbsp characters. Returns null for empty. */
export function clean(v: Scalar | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v)
    .normalize("NFC")
    .replace(/[​-‍﻿ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s === "" ? null : s;
}

/** Lower-case, strip diacritics and punctuation — the key used for every name comparison. */
export function norm(v: Scalar | undefined): string {
  const s = clean(v);
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Kepmendagri 900/050 sub-kegiatan code: U.BB.PP.J.KK.SSSS, where J = 1 provinsi, 2 kab/kota. */
export const KODE_SUBKEGIATAN_RE = /^[0-9X]\.[0-9X]{2}\.\d{2}\.([12])\.\d{2}\.\d{4}$/;

export function normKode(v: Scalar | undefined): string | null {
  const s = clean(v);
  if (!s) return null;
  return s.replace(/\s+/g, "").toUpperCase();
}

/** Jenis pemda encoded in the 4th segment of a sub-kegiatan code. */
export function kodeJenisPemda(kode: string): "PROV" | "KAB/KOTA" | null {
  const m = KODE_SUBKEGIATAN_RE.exec(kode);
  if (!m) return null;
  return m[1] === "1" ? "PROV" : "KAB/KOTA";
}

/**
 * Parse Indonesian-style numbers coming from Excel as text:
 *   "5.132.781.183"  -> 5132781183      "217.494.985,00" -> 217494985
 *   "1,5"            -> 1.5             "Rp 3.000.000"   -> 3000000
 *   "75.0"           -> 75              "1.234"          -> 1234 (treated as thousands)
 * Returns null when nothing numeric remains.
 */
export function parseIdNumber(v: Scalar | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = clean(v);
  if (!s) return null;
  s = s.replace(/^rp\.?\s*/i, "").replace(/\s+/g, "");
  if (!/^[-+]?[\d.,]+$/.test(s)) return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let normalized: string;
  if (hasDot && hasComma) {
    // whichever separator comes last is the decimal mark
    normalized =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (hasComma) {
    // "1,5" decimal vs "1,234,567" thousands
    normalized = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    // "5.132.781.183" thousands vs "75.0" decimal; a lone ".ddd" group of 3 is ambiguous -> thousands
    normalized = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* Trigram similarity, same definition as PostgreSQL pg_trgm.          */
/* ------------------------------------------------------------------ */

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of norm(s).split(" ")) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** pg_trgm `similarity()`: shared / (|a| + |b| - shared). 0..1 */
export function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/**
 * Rank candidates for `query`. Exact normalised equality scores 1.
 * Only candidates at or above `threshold` are returned, best first.
 */
export function rank<T>(
  query: string,
  candidates: { value: T; label: string }[],
  threshold = 0.5,
  limit = 5,
): Candidate<T>[] {
  const q = norm(query);
  if (!q) return [];
  const scored: Candidate<T>[] = [];
  for (const c of candidates) {
    const score = norm(c.label) === q ? 1 : similarity(q, c.label);
    if (score >= threshold) scored.push({ value: c.value, label: c.label, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Legacy stores `hasil_musrenbang` as HTML; compare on text. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return clean(html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")) ?? "";
}

export function textToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n+/g, "</p><p>")}</p>`;
}
