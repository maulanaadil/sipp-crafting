import { readFileSync } from "node:fs";
import path from "node:path";
import { sql, TAHUN } from "../lib/db";
import { runPipeline } from "../lib/inject/pipeline";

/**
 * Dry-run the pipeline on a spreadsheet and print the review table.
 *   npm run inject:cli -- "/path/to/file.xlsx" [--pemda 94.08] [--tahun 2027]
 * Creates a batch in `inject.*` (nothing is written to legacy tables).
 */
async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error('usage: npm run inject:cli -- "<file.xlsx>" [--pemda 94.08] [--tahun 2027]');
    process.exit(2);
  }
  const opt = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const res = await runPipeline({
    buffer: readFileSync(file),
    fileName: path.basename(file),
    tahun: Number(opt("tahun") ?? TAHUN),
    user: "cli",
    pemdaKode: opt("pemda"),
  });

  console.log(`batch ${res.batchId}  pemda ${res.pemda.nama ?? "?"} (${res.pemda.kode ?? "?"})  rows ${res.rows.length}`);
  for (const w of res.warnings) console.log("  ! " + w);

  const counts: Record<string, number> = {};
  for (const r of res.rows) counts[r.action] = (counts[r.action] ?? 0) + 1;
  console.log("actions:", counts, " needsReview:", res.rows.filter((r) => r.needsReview).length);

  const pad = (s: unknown, n: number) => String(s ?? "").slice(0, n).padEnd(n);
  console.log("\n" + [pad("sheet", 12), pad("row", 4), pad("action", 16), pad("kode", 18), pad("unit skpd → kode", 42), "issues"].join(" "));
  for (const r of res.rows) {
    const unit = r.resolved.unitSkpdKode;
    const issues = r.issues
      .filter((i) => i.level !== "info")
      .map((i) => `${i.level === "error" ? "✗" : "△"}${i.code}`)
      .join(" ");
    const changes = r.plan.action === "update" ? Object.keys(r.plan.changes).join(",") : "";
    console.log(
      [
        pad(r.raw.sheetKind, 12),
        pad(r.raw.rowNo, 4),
        pad(r.action + (r.plan.noop ? "(=)" : ""), 16),
        pad(r.normalized.kodeSubKegiatan, 18),
        pad(`${r.normalized.unitSkpd ?? ""} → ${unit.value ?? "?"}${unit.method === "fuzzy" ? "~" : ""}`, 42),
        issues + (changes ? `  Δ${changes}` : ""),
      ].join(" "),
    );
  }
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
