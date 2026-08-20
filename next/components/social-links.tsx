"use client";

import Link from "next/link";
import { Send, Settings } from "lucide-react";
import { CreditsButton } from "@/components/credits-button";
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
      <div className="grid w-full grid-cols-[minmax(0,1fr)_2.5rem_2.5rem] items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_3rem_3rem]">
        <CreditsButton />
        <Link
          href="/settings"
          className="pixel-btn grid h-10 w-10 place-items-center p-0 sm:h-12 sm:w-12"
          aria-label="Настройки"
          title="Настройки"
        >
          <Settings className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
        </Link>
        <InfoButton />
      </div>
    </div>
  );
}
