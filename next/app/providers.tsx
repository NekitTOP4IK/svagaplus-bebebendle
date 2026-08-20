"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { SessionRefreshBoundary } from "@/components/session-refresh-boundary";
import { AudioPreferencesProvider } from "@/components/audio/audio-preferences-provider";
import { AudioProvider } from "@/components/audio/audio-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AudioPreferencesProvider>
      <AudioProvider>
        <AnimatePresence mode="wait" initial={false}>
          <div key={pathname}>{children}</div>
        </AnimatePresence>
        <SessionRefreshBoundary />
        <Toaster position="top-right" richColors />
      </AudioProvider>
    </AudioPreferencesProvider>
  );
}
