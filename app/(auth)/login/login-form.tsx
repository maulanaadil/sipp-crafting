"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-xs font-medium text-zinc-600">Username atau email</span>
        <input
          name="username"
          autoComplete="username"
          required
          autoFocus
          className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-zinc-600">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={pending} className="w-full justify-center">
        {pending ? "Memeriksa…" : "Masuk"}
      </Button>
    </form>
  );
}
