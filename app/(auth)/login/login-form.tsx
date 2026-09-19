"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);
  const invalid = Boolean(state?.error);

  return (
    <form action={action} className="space-y-5" aria-describedby={invalid ? "login-error" : undefined}>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="username" className="block text-xs font-medium text-muted">
          Username atau email
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          autoFocus
          aria-invalid={invalid || undefined}
          className="control mt-1.5 w-full"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs font-medium text-muted">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={invalid || undefined}
          className="control mt-1.5 w-full"
        />
      </div>
      {state?.error && (
        <p id="login-error" role="alert" className="border-l-2 border-danger pl-3 text-sm text-ink-2">
          {state.error}. Periksa ejaan, lalu coba lagi.
        </p>
      )}
      <Button type="submit" variant="primary" busy={pending} className="w-full justify-center">
        {pending ? "Memeriksa akun" : "Masuk"}
      </Button>
    </form>
  );
}
