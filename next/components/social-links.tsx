"use client";

import { Twitch, Github, Send } from "lucide-react";
import { InfoButton } from "@/components/info-button";

const socialLinks = [
  {
    href: "https://t.me/bebebendle_bot",
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
    href: "https://github.com/catlilface/bebebendle",
    icon: Github,
    label: "github",
    mobileLabel: "git",
    skin: "",
  },
] as const;

export function SocialLinks() {
  return (
    <div className="flex w-full flex-col gap-2 sm:gap-3 2xl:gap-4 4xl:gap-5">
      {socialLinks.map((link) => (
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
      <div className="flex justify-end">
        <InfoButton />
      </div>
    </div>
  );
}
