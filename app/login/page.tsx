import { redirect } from "next/navigation";
import { connection } from "next/server";
import { login } from "@/app/actions";
import { loadConfig } from "@/lib/config";
import { readOwnerSession } from "@/lib/auth/owner";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  await connection();
  const config = loadConfig();
  const existing = await readOwnerSession();
  if (existing.ok) redirect("/");
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Signal Library</h1>
      <p className="mt-2 text-sm text-muted">A private library for one owner. There is no public registration.</p>
      {!config.ok ? (
        <p className="mt-6 text-sm text-danger" role="alert">
          {config.reason}
        </p>
      ) : (
        <LoginForm mode={config.mode} action={login} />
      )}
    </main>
  );
}
