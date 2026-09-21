import postgres, { type Sql as PgSql, type TransactionSql } from "postgres";

/**
 * Single postgres.js client for the whole process.
 *
 * Target database is `sippp_next`: a clone of the legacy SIPPP `sipppv2` dump
 * where the legacy tables live untouched in `public` and everything this app
 * owns lives in the `inject` schema (see db/migrations).
 */
declare global {
  var __sipppSql: PgSql | undefined;
}

function create(): PgSql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.local)");
  return postgres(url, {
    max: 10,
    idle_timeout: 30,
    transform: { undefined: null },
    onnotice: () => {},
  });
}

export const sql: PgSql = globalThis.__sipppSql ?? create();
if (process.env.NODE_ENV !== "production") globalThis.__sipppSql = sql;

export type Sql = PgSql;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Tx = TransactionSql<{}>;

export const TAHUN = Number(process.env.INJECT_TAHUN ?? 2027);
