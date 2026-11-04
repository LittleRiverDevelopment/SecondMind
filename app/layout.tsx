import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { readOwnerSession } from "@/lib/auth/owner";
import { Shell } from "@/components/shell";
import { ThemeProvider } from "@/components/theme-provider";
import { startInlineWorker } from "@/lib/processing/worker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Signal Library",
  description: "A personal library for saved sources, notes, and grounded questions.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  startInlineWorker();
  const auth = await readOwnerSession();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col antialiased">
        <ThemeProvider>
          {auth.ok ? (
            <Shell mode={auth.session.mode}>{children}</Shell>
          ) : auth.status === 503 ? (
            <main className="mx-auto max-w-lg px-4 py-16">
              <h1 className="text-2xl font-semibold">Signal Library is not configured</h1>
              <p className="mt-3 text-sm text-muted">{auth.reason}</p>
            </main>
          ) : (
            children
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
