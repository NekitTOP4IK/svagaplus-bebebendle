"use client";

import Image from "next/image";
import { useEffect, useState, type ReactElement } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

let enteredCurrentDocument = false;

export function hasEnteredCurrentDocument(): boolean {
  return enteredCurrentDocument;
}

function rememberEntranceForCurrentDocument(): void {
  enteredCurrentDocument = true;
}

type Props = Readonly<{
  onActivate(): void;
  onEntered(): void;
}>;

export function EntranceGate({ onActivate, onEntered }: Props): ReactElement | null {
  const [visible, setVisible] = useState(true);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  const enter = (): void => {
    onActivate();
    rememberEntranceForCurrentDocument();
    setVisible(false);
  };

  return (
    <AnimatePresence onExitComplete={onEntered}>
      {visible && (
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="entrance-title"
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-zinc-950 p-4"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35 }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div
            className="absolute inset-[-24px] scale-105 bg-cover bg-center blur-[3px]"
            style={{ backgroundImage: "url('/background.jpg')" }}
          />
          <div className="absolute inset-0 bg-black/65" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.72)_100%)]" />

          <motion.div
            className="pixel-container relative w-full max-w-xl border-4 border-black bg-zinc-900/95 px-5 py-7 text-center shadow-[8px_8px_0_rgba(0,0,0,0.75)] sm:px-10 sm:py-9"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 14, scale: reduceMotion ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -10, scale: reduceMotion ? 1 : 1.02 }}
            transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
          >
            <Image
              src="/бебендл.webp"
              alt="Бебебендл"
              width={1303}
              height={319}
              className="mx-auto h-auto w-full max-w-[430px]"
              priority
            />
            <h1 id="entrance-title" className="pixel-text mx-auto mt-7 max-w-lg text-base leading-relaxed font-bold text-white sm:text-xl">
              Я думаю тебе определённо стоит нажать кнопочку ниже
            </h1>

            <motion.button
              type="button"
              autoFocus
              className="pixel-btn pixel-btn-ok mt-7 w-full px-6 py-3 text-base font-bold sm:text-lg"
              onClick={enter}
              whileHover={reduceMotion ? undefined : { scale: 1.015 }}
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            >
              Войти
            </motion.button>
            <p className="mt-3 text-xs text-white/45">Нажми кнопку или Enter</p>
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
