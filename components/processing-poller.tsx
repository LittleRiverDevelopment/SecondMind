"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ProcessingPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
