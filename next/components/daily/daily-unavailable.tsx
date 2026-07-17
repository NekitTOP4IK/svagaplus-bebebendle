import Link from "next/link";

export function DailyUnavailable() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-none border-4 border-black bg-white p-8 text-center text-black shadow-[6px_6px_0_#000]">
        <h1 className="pixel-text-on-light mb-4 text-2xl font-bold">
          Дейлика на сегодня нет
        </h1>
        <p className="mb-8 text-base text-zinc-800">
          Сегодняшний набор ещё не сгенерирован. Загляни позже или возвращайся завтра.
        </p>
        <Link
          href="/"
          className="inline-block border-4 border-black bg-yellow-400 px-6 py-3 font-[family-name:var(--font-pixel)] text-sm text-black hover:bg-yellow-300"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
