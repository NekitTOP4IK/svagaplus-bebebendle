"use client";

import { useEffect, type ReactElement } from "react";

type Props = Readonly<{
  src: string;
  alt: string;
  onClose: () => void;
}>;

export function ScranImageLightbox({ src, alt, onClose }: Props): ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="pixel-btn absolute right-4 top-4 z-10 bg-zinc-800 px-3 py-2 text-sm font-bold text-white"
      >
        ✕ Закрыть
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-[90dvh] max-w-full object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
