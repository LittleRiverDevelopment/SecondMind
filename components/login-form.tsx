"use client";

import { useActionState } from "react";
import type { login } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  mode,
  action,
}: {
  mode: "demo" | "local" | "supabase";
  action: typeof login;
}) {
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(action, {});
  return (
    <form action={formAction} className="mt-8 grid gap-3">
      {mode === "demo" ? (
        <Button type="submit" data-testid="login-demo" disabled={pending}>
          Continue as demo owner
        </Button>
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <Button type="submit" disabled={pending}>
            Sign in
          </Button>
        </>
      )}
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      {mode === "demo" ? (
        <p className="text-sm text-muted">Demo data stays in this app’s local demo database and is labeled as synthetic.</p>
      ) : null}
    </form>
  );
}
