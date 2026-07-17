"use client";

import { useState, type ReactElement } from "react";
import type { Scran } from "@/types/scran";
import { ScranImageLightbox } from "@/components/admin/scran-image-lightbox";

type Props = Readonly<{
  scrans: Scran[];
  role?: "moderator" | "admin" | null;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onBan: (id: number) => void;
  onDelete: (scran: Scran) => void;
  onStartReview: () => void;
}>;

function authorLabel(scran: Scran): string {
  return (
    scran.authorUsername ||
    scran.authorDisplayName ||
    (scran.telegramId ? `tg:${scran.telegramId}` : "аноним")
  );
}

export function ModerationQueue({
  scrans,
  role,
  onApprove,
  onReject,
  onBan,
  onDelete,
  onStartReview,
}: Props): ReactElement {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  if (scrans.length === 0) {
    return (
      <div className="pixel-container border-4 border-black bg-zinc-900/80 px-6 py-16 text-center">
        <p className="pixel-text text-lg text-white">Очередь пуста</p>
        <p className="mt-2 text-sm text-white/60">Новых блюд на проверку нет</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/70">
          В списке: <span className="font-bold text-white">{scrans.length}</span>
        </p>
        <button
          type="button"
          onClick={onStartReview}
          className="pixel-btn bg-amber-400 px-4 py-2 text-sm font-bold text-black hover:bg-amber-300"
        >
          Режим проверки →
        </button>
      </div>

      <ul className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {scrans.map((scran) => {
          const isSub = scran.isSubscriberAtSubmit === true;
          const pendingCount =
            typeof scran.pendingCount === "number" ? scran.pendingCount : undefined;
          const overLimit = pendingCount != null && pendingCount > 6;

          return (
            <li
              key={scran.id}
              className="pixel-container flex flex-col gap-4 border-4 border-black bg-zinc-900/90 p-3 sm:flex-row sm:p-4"
            >
              <button
                type="button"
                className="group relative shrink-0 self-center overflow-hidden border-2 border-black bg-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:self-start"
                onClick={() =>
                  scran.imageUrl &&
                  setLightbox({ src: scran.imageUrl, alt: scran.name })
                }
                disabled={!scran.imageUrl}
                title="Открыть фото"
              >
                {scran.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={scran.imageUrl}
                    alt={scran.name}
                    className="h-40 w-40 object-cover transition group-hover:opacity-90 sm:h-44 sm:w-44"
                  />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center text-xs text-white/40 sm:h-44 sm:w-44">
                    нет фото
                  </div>
                )}
                <span className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100">
                  открыть
                </span>
              </button>

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-white/50">#{scran.id}</span>
                    <h3 className="pixel-text truncate text-base font-bold text-white sm:text-lg">
                      {scran.name}
                    </h3>
                    {isSub && (
                      <span className="bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                        SVAGA+
                      </span>
                    )}
                    {scran.isSubscriberAtSubmit === null && (
                      <span className="bg-zinc-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        Не проверено
                      </span>
                    )}
                  </div>
                  {scran.description && (
                    <p className="line-clamp-2 text-sm text-zinc-400">{scran.description}</p>
                  )}
                  <p className="text-sm text-white/80">
                    {scran.price.toFixed(2)} ₽
                    <span className="mx-2 text-white/30">·</span>
                    <span className="text-white/70">{authorLabel(scran)}</span>
                    {pendingCount != null && (
                      <span
                        className={`ml-1 text-xs ${overLimit ? "font-bold text-red-400" : "text-amber-400"}`}
                      >
                        ({pendingCount} на модерации
                        {overLimit ? " ⚠️" : ""})
                      </span>
                    )}
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2">
                  {!scran.approved && (
                    <>
                      <button
                        type="button"
                        onClick={() => onApprove(scran.id)}
                        className="pixel-btn min-h-11 flex-1 bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 sm:flex-none"
                      >
                        Одобрить
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(scran.id)}
                        className="pixel-btn min-h-11 flex-1 bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 sm:flex-none"
                      >
                        Отклонить
                      </button>
                    </>
                  )}
                  {scran.approved && role === "admin" && (
                    <button
                      type="button"
                      onClick={() => onBan(scran.id)}
                      className="pixel-btn min-h-11 flex-1 bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-500 sm:flex-none"
                    >
                      Снять
                    </button>
                  )}
                  {role === "admin" && (
                    <button
                      type="button"
                      onClick={() => onDelete(scran)}
                      className="pixel-btn min-h-11 flex-1 bg-zinc-700 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-600 sm:flex-none"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {lightbox && (
        <ScranImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
