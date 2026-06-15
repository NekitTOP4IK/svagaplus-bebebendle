"use client";

import { Twitch, Github, Send } from "lucide-react";
import { InfoButton } from "@/components/info-button";

const socialLinks = [
  {
    href: "https://t.me/bebebendle_bot",
    icon: Send,
    label: "Предложить свой слоп",
    mobileLabel: "слоп",
  },
  {
    href: "https://www.twitch.tv/olesha",
    icon: Twitch,
    label: "olesha",
    mobileLabel: "twitch",
  },
  {
    href: "https://github.com/catlilface/bebebendle",
    icon: Github,
    label: "github",
    mobileLabel: "git",
  },
];

export function SocialLinks() {
  return (
    <div className="flex flex-col gap-2 sm:gap-3 2xl:gap-4 4xl:gap-5 w-full">
      {socialLinks.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="pixel-btn inline-flex items-center justify-center gap-1.5 sm:gap-2 2xl:gap-3 4xl:gap-4 px-2 sm:px-4 py-1.5 sm:py-2 2xl:px-6 2xl:py-3 4xl:px-8 4xl:py-4 text-xs sm:text-sm md:text-base 2xl:text-xl 4xl:text-2xl"
        >
          <link.icon className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 2xl:w-7 2xl:h-7 4xl:w-9 4xl:h-9" />
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
