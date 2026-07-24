"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactElement,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { COMPETITIVE_ICONS } from "@/lib/competitive/icons";
import type { CompetitiveContentDoc } from "@/lib/competitive/content";

type ModalKind = "mode" | "season" | null;

type Props = Readonly<{
  modeRules: CompetitiveContentDoc;
  seasonRules: CompetitiveContentDoc;
}>;

function ContentBody({
  doc,
  emptyHint,
}: {
  doc: CompetitiveContentDoc;
  emptyHint: string;
}): ReactElement {
  if (!doc.blocks.length) {
    return <p className="text-white/70">{emptyHint}</p>;
  }
  return (
    <div className="c-content-blocks space-y-5">
      {doc.blocks.map((block) => (
        <section key={block.id} className="c-content-block">
          <h5 className="pixel-text mb-2 text-sm font-bold text-amber-100">
            {block.title}
          </h5>
          {block.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.imageUrl}
              alt=""
              className="mb-2 max-h-40 w-full object-contain"
            />
          ) : null}
          {block.body ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">
              {block.body}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/**
 * «ЧаВо сезона»: mode rules + season rules from admin content docs.
 */
export function RulesCard({ modeRules, seasonRules }: Props): ReactElement {
  const [open, setOpen] = useState<ModalKind>(null);
  const titleId = useId();

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  return (
    <article className="c-rules-card c-panel">
      <h3>ЧаВо сезона</h3>
      <div className="c-faq-actions">
        <button
          type="button"
          className="c-faq-btn"
          onClick={() => setOpen("mode")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="c-faq-btn__icon c-faq-btn__icon--enchanted"
            src={COMPETITIVE_ICONS.books.enchanted}
            alt=""
            width={40}
            height={40}
          />
          <span className="c-faq-btn__text">
            <strong>Правила режима</strong>
            <small>как играть ranked</small>
          </span>
        </button>

        <button
          type="button"
          className="c-faq-btn"
          onClick={() => setOpen("season")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="c-faq-btn__icon c-faq-btn__icon--writable"
            src={COMPETITIVE_ICONS.books.writable}
            alt=""
            width={40}
            height={40}
          />
          <span className="c-faq-btn__text">
            <strong>Правила сезона</strong>
            <small>награды и сроки</small>
          </span>
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="faq-backdrop"
            className="c-faq-modal-root"
            role="presentation"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              key={`faq-${open}`}
              className="c-faq-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 28,
                mass: 0.85,
              }}
            >
              <header className="c-faq-modal__head">
                <h4 id={titleId}>
                  {open === "mode" ? "Правила режима" : "Правила сезона"}
                </h4>
                <button
                  type="button"
                  className="pixel-btn px-2 py-1 text-xs font-bold"
                  onClick={close}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </header>
              <div className="c-faq-modal__body">
                {open === "mode" ? (
                  <ContentBody
                    doc={modeRules}
                    emptyHint="Правила режима пока не заполнены. Админ может добавить их в панели Competitive → Настройки."
                  />
                ) : (
                  <ContentBody
                    doc={seasonRules}
                    emptyHint="Правила сезона пока не заполнены. Админ редактирует их в карточке сезона."
                  />
                )}
              </div>
              <footer className="c-faq-modal__foot">
                <button
                  type="button"
                  className="pixel-btn pixel-btn-ok px-4 py-2 text-sm font-bold"
                  onClick={close}
                >
                  Понятно
                </button>
              </footer>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}
