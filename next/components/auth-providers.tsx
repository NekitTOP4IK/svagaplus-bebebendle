"use client";

import { useState, type ReactElement } from "react";
import Image from "next/image";

/** Pixel-style horizontal rule with «ИЛИ» between Telegram and Twitch. */
export function AuthOrDivider(): ReactElement {
  return (
    <div
      className="my-5 flex items-center gap-3"
      role="separator"
      aria-label="или"
    >
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
      <span className="pixel-text shrink-0 px-1 text-[10px] font-bold tracking-[0.2em] text-white/55 sm:text-xs">
        ИЛИ
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
    </div>
  );
}

type TwitchAuthButtonProps = Readonly<{
  href: string;
  /** Parent can force-disable (e.g. while Telegram auth is in flight). */
  disabled?: boolean;
  className?: string;
  hint?: string | null;
  onLoadingChange?: (loading: boolean) => void;
}>;

/**
 * Twitch login control: disables and shows waiting label after click
 * until navigation leaves the page.
 */
export function TwitchAuthButton({
  href,
  disabled = false,
  className = "",
  hint = "Twitch — если аккаунт уже привязан к Telegram в СВАГА+.",
  onLoadingChange,
}: TwitchAuthButtonProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const busy = disabled || loading;

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        className={
          className ||
          "pixel-btn pixel-btn-twitch inline-flex min-h-11 w-full items-center justify-center gap-2 px-6 py-2 text-sm font-bold disabled:cursor-wait"
        }
        onClick={() => {
          if (busy) return;
          setLoading(true);
          onLoadingChange?.(true);
          window.location.assign(href);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static public asset */}
        <Image
          src="/twitch-icon.webp"
          alt=""
          width={20}
          height={20}
          className={`h-5 w-5 shrink-0 ${busy ? "opacity-70" : ""}`}
          aria-hidden
        />
        {busy ? "Авторизовываемся…" : "Войти через Twitch"}
      </button>
      {hint ? (
        <p className="mt-2 text-[11px] leading-snug text-white/45">{hint}</p>
      ) : null}
    </div>
  );
}
