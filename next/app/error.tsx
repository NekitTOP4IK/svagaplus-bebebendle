"use client";

import Link from "next/link";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-none border-4 border-black bg-white p-8 text-center text-black shadow-[6px_6px_0_#000]">
        <h2 className="pixel-text-on-light mb-4 text-2xl font-bold">
          Что-то пошло не так!
        </h2>
        <p className="mb-8 text-base text-zinc-800">
          {error.message || "Произошла непредвиденная ошибка"}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={reset}
            className="border-4 border-black bg-yellow-400 px-6 py-3 font-[family-name:var(--font-pixel)] text-sm text-black hover:bg-yellow-300"
          >
            Попробовать снова
          </button>
          <Link
            href="/"
            className="border-4 border-black bg-zinc-100 px-6 py-3 font-[family-name:var(--font-pixel)] text-sm text-black hover:bg-white"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
