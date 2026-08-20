import Link from "next/link";
import type { ReactElement } from "react";
import { AudioSettingsPanel } from "@/components/audio/audio-settings-panel";

export default function SettingsPage(): ReactElement {
  return (
    <main className="retro-bg relative flex min-h-dvh items-center justify-center px-4 py-8 text-white">
      <div className="retro-overlay pointer-events-none absolute inset-0" />
      <div className="settings-page relative z-10 w-full max-w-3xl">
        <header className="settings-page__header pixel-container">
          <Link href="/" className="settings-page__back pixel-btn" aria-label="На главную">
            ←
          </Link>
          <div className="settings-page__heading">
            <span>Параметры игры</span>
            <h1 id="settings-title" className="pixel-text">Настройки</h1>
            <p>Настрой звук и поведение плеера под себя.</p>
          </div>
          <div className="settings-page__storage">
            <i aria-hidden="true" />
            На этом устройстве
          </div>
        </header>
        <AudioSettingsPanel />
      </div>
    </main>
  );
}
