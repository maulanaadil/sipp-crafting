import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import type { SessionUser } from "./session";

/**
 * Same checks as legacy app/Libraries/Auth/Login.php::check(): username-or-email lookup,
 * PHP password_verify (bcrypt, `$2y$` prefix), status and validity window.
 */
export type LoginResult = { ok: true; user: SessionUser } | { ok: false; message: string };

const FAIL: LoginResult = { ok: false, message: "Username/Email atau Password salah" };

export async function verifyLogin(usernameOrEmail: string, password: string): Promise<LoginResult> {
  const ident = usernameOrEmail.trim().toLowerCase();
  if (!ident || !password) return FAIL;

  const isEmail = ident.includes("@");
  const rows = await sql<Record<string, unknown>[]>`
    select u.id, u.username, u.password, u.nama, u.status, u.validate_start, u.validate_end,
           u.ref_userlevel_id, u.ref_userrole_id, u.mst_provinsi_id, u.mst_kabupaten_id,
           ur.nama as userrole, ur.fitur_allowed
    from mst_users u
    left join ref_userrole ur on ur.id = u.ref_userrole_id
    where ${isEmail ? sql`lower(u.email)` : sql`lower(u.username)`} = ${ident}
    limit 1`;
  const u = rows[0];
  if (!u || !u.password) return FAIL;

  // PHP emits $2y$; bcryptjs verifies it as $2b$ (identical algorithm)
  const hash = String(u.password).replace(/^\$2y\$/, "$2b$");
  if (!(await bcrypt.compare(password, hash))) return FAIL;

  if (Number(u.status) !== 1) return { ok: false, message: "Akun tidak aktif" };
  const today = new Date().toISOString().slice(0, 10);
  if (u.validate_start && String(u.validate_start).slice(0, 10) > today) return { ok: false, message: "Masa berlaku akun belum aktif" };
  if (u.validate_end && String(u.validate_end).slice(0, 10) < today) return { ok: false, message: "Masa berlaku akun sudah berakhir" };

  await sql`update mst_users set last_login_date = now() where id = ${String(u.id)}`;

  return {
    ok: true,
    user: {
      id: String(u.id),
      username: String(u.username),
      nama: String(u.nama),
      userlevelId: Number(u.ref_userlevel_id),
      userroleId: Number(u.ref_userrole_id),
      userrole: String(u.userrole ?? ""),
      fitur: String(u.fitur_allowed ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
      provinsiId: (u.mst_provinsi_id as string) ?? null,
      kabupatenId: (u.mst_kabupaten_id as string) ?? null,
    },
  };
}

/** Same cost/format PHP's password_hash(PASSWORD_DEFAULT) produces, so legacy can read it too. */
export async function hashPassword(password: string): Promise<string> {
  return (await bcrypt.hash(password, 10)).replace(/^\$2b\$/, "$2y$");
}
