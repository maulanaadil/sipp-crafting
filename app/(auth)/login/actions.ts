"use server";

import { redirect } from "next/navigation";
import { verifyLogin } from "@/lib/auth/login";
import { createSession, destroySession } from "@/lib/auth/session";

export type LoginState = { error?: string } | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const res = await verifyLogin(username, password);
  if (!res.ok) return { error: res.message };
  await createSession(res.user);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/inject");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
