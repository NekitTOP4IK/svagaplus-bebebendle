"use client";

import { Twitch, Github, Send } from "lucide-react";
import { InfoButton } from "@/components/info-button";
import { LogoutButton } from "@/components/home-user-menu";

function telegramBotUrl(): string {
  const username = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
  return username ? `https://t.me/${username}` : "https://t.me/bebebendle_bot";
}

export function SocialLinks() {
  const links = [
    {
      href: telegramBotUrl(),
      icon: Send,
      label: "Предложить свой слоп",
      mobileLabel: "слоп",
      skin: "pixel-btn-tg",
    },
    {
      href: "https://www.twitch.tv/olesha",
      icon: Twitch,
      label: "olesha",
      mobileLabel: "twitch",
      skin: "pixel-btn-twitch",
    },
    {
      href: "https://github.com/NekitTOP4IK/svagaplus-bebebendle/",
      icon: Github,
      label: "github",
      mobileLabel: "git",
      skin: "",
    },
  ] as const;

  return (
    <div className="flex w-full flex-col gap-2 sm:gap-3 2xl:gap-4 4xl:gap-5">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`pixel-btn ${link.skin} inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs sm:gap-2 sm:px-4 sm:py-2 sm:text-sm md:text-base 2xl:gap-3 2xl:px-6 2xl:py-3 2xl:text-xl 4xl:gap-4 4xl:px-8 4xl:py-4 4xl:text-2xl`}
        >
          <link.icon className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 2xl:h-7 2xl:w-7 4xl:h-9 4xl:w-9" />
          <span className="hidden sm:inline">{link.label}</span>
          <span className="sm:hidden">{link.mobileLabel}</span>
        </a>
      ))}
      {/* Bottom row: logout expands, info stays square — gap between */}
      <div className="flex w-full items-center justify-end gap-2 sm:gap-3 2xl:gap-4">
        <LogoutButton
          hideWhenLoggedOut
          className="flex h-10 min-h-10 flex-1 items-center justify-center px-3 text-xs sm:h-12 sm:min-h-12 sm:px-4 sm:text-sm 2xl:h-14 2xl:min-h-14 2xl:text-base 4xl:h-16 4xl:min-h-16"
        />
        <InfoButton />
      </div>
    </div>
  );
}
