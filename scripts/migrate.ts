import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "../lib/db";

// Plain-SQL, forward-only migrations for the `inject` schema.
async function main() {
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  await sql`create schema if not exists inject`;
  await sql`create table if not exists inject.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set(
    (await sql<{ name: string }[]>`select name from inject.schema_migrations`).map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(path.join(dir, file), "utf8"));
      await tx`insert into inject.schema_migrations (name) values (${file})`;
    });
    console.log("applied", file);
  }
  console.log(`migrations up to date (${files.length} files, ${applied.size} previously applied)`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
