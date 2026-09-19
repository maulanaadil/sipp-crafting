const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export function fmtIDR(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? idr.format(n) : String(v);
}

export function fmtNum(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? num.format(n) : String(v);
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}
