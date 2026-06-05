"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <div key={pathname}>{children}</div>
      </AnimatePresence>
      <Toaster position="top-right" richColors />
    </>
  );
}
