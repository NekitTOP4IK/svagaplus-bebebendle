"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { SessionRefreshBoundary } from "@/components/session-refresh-boundary";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <div key={pathname}>{children}</div>
      </AnimatePresence>
      <SessionRefreshBoundary />
      <Toaster position="top-right" richColors />
    </>
  );
}
