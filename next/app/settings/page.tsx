import Link from "next/link";
import type { ReactElement } from "react";
import { AudioSettingsPanel } from "@/components/audio/audio-settings-panel";

export default function SettingsPage(): ReactElement {
  return (
    <main className="retro-bg relative flex min-h-dvh items-center justify-center px-4 py-8 text-white">
      <div className="retro-overlay pointer-events-none absolute inset-0" />
      <div className="settings-page relative z-10 w-full max-w-3xl">
        <header className="settings-page__header pixel-container">
          <div className="settings-page__heading">
            <span>Параметры игры</span>
            <h1 id="settings-title" className="pixel-text">Настройки</h1>
            <p>Управляй музыкой и поведением плеера.</p>
          </div>
          <Link href="/" className="settings-page__back pixel-btn">
            ← На главную
          </Link>
        </header>
        <AudioSettingsPanel />
      </div>
    </main>
  );
}
