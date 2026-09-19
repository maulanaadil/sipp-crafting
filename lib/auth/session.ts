import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Stateless session: signed JWT in an httpOnly cookie, 8 hours.
 * The payload mirrors what the legacy PHP app keeps in $_SESSION after Auth\Login::check().
 */
export const SESSION_COOKIE = "sippp_session";
const TTL_SECONDS = 8 * 60 * 60;

export interface SessionUser {
  id: string;
  username: string;
  nama: string;
  /** ref_userlevel: 10 Pusat, 20 Provinsi, 30 Kabupaten */
  userlevelId: number;
  userroleId: number;
  userrole: string;
  /** ref_fitur ids from ref_userrole.fitur_allowed */
  fitur: number[];
  provinsiId: string | null;
  kabupatenId: string | null;
}

/** Legacy feature ids that gate the inject module (ref_fitur). */
export const FITUR = {
  UBAH_USULAN: 5020,
  UPDATE_PEMBAHASAN: 5060,
  MENU_USER: 9090,
} as const;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET missing or too short (see .env.local)");
  return new TextEncoder().encode(s);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

/** For pages/actions: redirect to login when anonymous, throw when the feature is not allowed. */
export async function requireUser(fitur?: number): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  if (fitur !== undefined && !canUse(user, fitur)) {
    throw new Error(`Akses ditolak: fitur ${fitur} tidak ada pada role ${user.userrole}`);
  }
  return user;
}

export function canUse(user: SessionUser, fitur: number): boolean {
  return user.userroleId === 10 || user.fitur.includes(fitur);
}

/** Provinsi/kabupaten users may only work on their own pemda; Pusat sees everything. */
export function canAccessPemda(user: SessionUser, pemdaKode: string | null): boolean {
  if (user.userlevelId === 10) return true;
  if (!pemdaKode) return false;
  if (user.userlevelId === 20) return pemdaKode === user.provinsiId || pemdaKode.startsWith(`${user.provinsiId}.`);
  return pemdaKode === user.kabupatenId;
}
