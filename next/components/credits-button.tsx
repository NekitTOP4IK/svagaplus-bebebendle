"use client";

import { useEffect, useState, type ComponentType, type ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Twitch, Twitter, Users, X, Youtube } from "lucide-react";
import {
  CREDIT_GROUPS,
  type CreditSocialPlatform,
} from "@/lib/credits";

type SocialPresentation = Readonly<{
  label: string;
  Icon: ComponentType<Readonly<{ className?: string }>>;
  className: string;
}>;

const SOCIAL_PRESENTATION: Record<CreditSocialPlatform, SocialPresentation> = {
  twitch: { label: "Twitch", Icon: Twitch, className: "pixel-btn-twitch" },
  telegram: { label: "Telegram", Icon: Send, className: "pixel-btn-tg" },
  twitter: { label: "Twitter / X", Icon: Twitter, className: "pixel-btn-info" },
  youtube: { label: "YouTube", Icon: Youtube, className: "pixel-btn-danger" },
};

export function CreditsButton(): ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="pixel-btn inline-flex min-h-10 min-w-0 items-center justify-center gap-2 px-3 py-2 text-xs sm:min-h-12 sm:text-sm"
        onClick={() => setIsOpen(true)}
      >
        <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Авторы</span>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="Закрыть авторов"
              className="fixed inset-0 z-50 cursor-default bg-black/65"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="credits-title"
              className="fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-4 border-black bg-zinc-800 p-4 text-white shadow-[inset_3px_3px_0_#52525b,inset_-3px_-3px_0_#18181b,6px_6px_0_#000] sm:p-6"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            >
              <header className="flex items-center justify-between gap-4 border-b-4 border-black pb-4">
                <div>
                  <h2 id="credits-title" className="pixel-text text-xl sm:text-2xl">
                    Авторы
                  </h2>
                </div>
                <button
                  type="button"
                  className="pixel-btn grid h-10 w-10 shrink-0 place-items-center p-0"
                  aria-label="Закрыть"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </header>

              {CREDIT_GROUPS.length === 0 ? (
                <p className="my-8 text-center text-sm text-white/65">
                  Список авторов пока готовится.
                </p>
              ) : (
                <div className="mt-5 grid gap-5">
                  {CREDIT_GROUPS.map((group, groupIndex) => (
                    <section key={group.title} aria-labelledby={`credit-group-${groupIndex}`}>
                      <h3
                        id={`credit-group-${groupIndex}`}
                        className="mb-2 font-[family-name:var(--font-pixel)] text-xs text-yellow-200"
                      >
                        {group.title}
                      </h3>
                      <div className="grid gap-2">
                        {group.people.map((person) => (
                          <article
                            key={person.name}
                            className="border-2 border-black bg-zinc-700 p-3 shadow-[inset_2px_2px_0_#71717a,inset_-2px_-2px_0_#3f3f46]"
                          >
                            <strong className="font-[family-name:var(--font-pixel)] text-xs">
                              {person.name}
                            </strong>
                            {person.description ? (
                              <p className="mt-1 text-xs text-white/65">{person.description}</p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {person.socials.map((social) => {
                                const presentation = SOCIAL_PRESENTATION[social.platform];
                                const Icon = presentation.Icon;
                                return (
                                  <a
                                    key={`${social.platform}:${social.url}`}
                                    href={social.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`pixel-btn ${presentation.className} inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px]`}
                                  >
                                    <Icon className="h-3.5 w-3.5" />
                                    {presentation.label}
                                  </a>
                                );
                              })}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
