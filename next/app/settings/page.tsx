import Link from "next/link";
import type { ReactElement } from "react";
import { AudioSettingsPanel } from "@/components/audio/audio-settings-panel";

export default function SettingsPage(): ReactElement {
  return (
    <main className="retro-bg relative flex min-h-dvh items-center justify-center px-4 py-8 text-white">
      <div className="retro-overlay pointer-events-none absolute inset-0" />
      <div className="relative z-10 w-full max-w-2xl">
        <Link href="/" className="pixel-btn mb-5 inline-block min-h-11 px-5 py-2 text-sm">
          ← На главную
        </Link>
        <AudioSettingsPanel />
      </div>
    </main>
  );
}
