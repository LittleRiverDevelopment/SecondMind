import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const links = [
  ["Library", "/"],
  ["Chat", "/chat"],
  ["Digests", "/digests"],
  ["Projects", "/projects"],
  ["Settings", "/settings"],
];

export function Shell({
  mode,
  children,
}: {
  mode: "demo" | "local" | "supabase";
  children: ReactNode;
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Signal Library
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Primary">
            {links.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-lg px-2 py-1 hover:bg-muted-bg">
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {mode === "demo" ? (
              <span className="rounded-full border border-warning px-2 py-0.5 text-xs text-warning">Demo mode</span>
            ) : null}
            <ThemeToggle />
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
        {mode === "demo" ? (
          <p className="mx-auto max-w-5xl px-4 pb-3 text-sm text-muted">
            Local demo with synthetic saves. Summaries and answers are deterministic previews, not model responses.
          </p>
        ) : null}
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </>
  );
}
