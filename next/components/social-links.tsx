"use client";

import Link from "next/link";
import { Send, Settings } from "lucide-react";
import { InfoButton } from "@/components/info-button";

function telegramBotUrl(): string {
  const username = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "")
    .trim()
    .replace(/^@/, "");
  return username ? `https://t.me/${username}` : "https://t.me/bebebendle_bot";
}

export function SocialLinks() {
  return (
    <div className="flex w-full flex-col gap-2 sm:gap-3 2xl:gap-4 4xl:gap-5">
      <a
        href={telegramBotUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="pixel-btn pixel-btn-tg inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs sm:gap-2 sm:px-4 sm:py-2 sm:text-sm md:text-base 2xl:gap-3 2xl:px-6 2xl:py-3 2xl:text-xl 4xl:gap-4 4xl:px-8 4xl:py-4 4xl:text-2xl"
      >
        <Send className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 2xl:h-7 2xl:w-7 4xl:h-9 4xl:w-9" />
        <span className="hidden sm:inline">Предложить свой слоп</span>
        <span className="sm:hidden">слоп</span>
      </a>
      <div className="flex w-full items-center justify-between gap-2">
        <Link
          href="/settings"
          className="pixel-btn inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm"
        >
          <Settings className="h-4 w-4" aria-hidden />
          Настройки
        </Link>
        <InfoButton />
      </div>
    </div>
  );
}
