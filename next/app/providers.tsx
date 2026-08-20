"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { SessionRefreshBoundary } from "@/components/session-refresh-boundary";
import { AudioPreferencesProvider } from "@/components/audio/audio-preferences-provider";
import { AudioProvider } from "@/components/audio/audio-provider";
import type { SoundtrackMetadata } from "@/lib/audio/soundtrack-metadata";

export function Providers({
  children,
  soundtrackMetadata,
}: Readonly<{
  children: React.ReactNode;
  soundtrackMetadata: SoundtrackMetadata;
}>) {
  const pathname = usePathname();

  return (
    <AudioPreferencesProvider>
      <AudioProvider soundtrackMetadata={soundtrackMetadata}>
        <AnimatePresence mode="wait" initial={false}>
          <div key={pathname}>{children}</div>
        </AnimatePresence>
        <SessionRefreshBoundary />
        <Toaster position="top-right" richColors />
      </AudioProvider>
    </AudioPreferencesProvider>
  );
}
