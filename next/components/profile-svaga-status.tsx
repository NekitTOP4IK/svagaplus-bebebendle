"use client";

import { useState, type ReactElement } from "react";
import { apiFetch } from "@/lib/api-client";

export type LocalSvagaStatus = Readonly<{
  status: "subscriber" | "not_subscriber" | "unknown";
  isSubscriber: boolean | null;
  lastSyncedAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncError: string | null;
}>;

type Props = Readonly<{
  initialStatus: LocalSvagaStatus | null;
}>;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ru-RU");
  } catch {
    return value;
  }
}

export function ProfileSvagaStatus({ initialStatus }: Props): ReactElement {
  const [status, setStatus] = useState<LocalSvagaStatus | null>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [staleNote, setStaleNote] = useState(false);

  const confirmedLabel =
    status?.isSubscriber === true
      ? "Подписка активна"
      : status?.isSubscriber === false
        ? "Активная подписка на Olesha не найдена"
        : "Статус подписки пока не удалось проверить";

  async function handleRefresh(): Promise<void> {
    setLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setStaleNote(false);
    try {
      const res = await apiFetch("/api/svaga/refresh", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        isSubscriber?: boolean | null;
        source?: string;
        checkedAt?: string | null;
        error?: string | null;
      };

      if (body.source === "unknown" || (!res.ok && body.source !== "stale_cache")) {
        setErrorMessage(
          body.error
            ? `Не удалось проверить подписку (${body.error})`
            : "Не удалось проверить подписку",
        );
        if (body.source === "unknown") {
          setStatus((prev) => ({
            status: "unknown",
            isSubscriber: null,
            lastSyncedAt: prev?.lastSyncedAt ?? null,
            lastSyncAttemptAt: new Date().toISOString(),
            lastSyncError: body.error ?? "unknown",
          }));
        }
        return;
      }

      if (body.source === "stale_cache") {
        setStaleNote(true);
        setStatus({
          status: body.isSubscriber === true ? "subscriber" : "not_subscriber",
          isSubscriber: body.isSubscriber ?? null,
          lastSyncedAt: body.checkedAt ?? null,
          lastSyncAttemptAt: new Date().toISOString(),
          lastSyncError: body.error ?? null,
        });
        return;
      }

      if (res.ok && (body.source === "fresh" || body.source === "cache")) {
        setSuccessMessage("Статус подписки обновлён");
        setStatus({
          status:
            body.isSubscriber === true
              ? "subscriber"
              : body.isSubscriber === false
                ? "not_subscriber"
                : "unknown",
          isSubscriber: body.isSubscriber ?? null,
          lastSyncedAt: body.checkedAt ?? null,
          lastSyncAttemptAt: body.checkedAt ?? null,
          lastSyncError: null,
        });
        return;
      }

      setErrorMessage("Не удалось проверить подписку");
    } catch {
      setErrorMessage("Не удалось проверить подписку");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pixel-container mb-6 rounded-none border-4 border-black bg-zinc-900/90 p-4">
      <h2 className="pixel-text mb-3 text-xl font-bold">Подписка СВАГА+</h2>
      <div className="mb-3 space-y-1 text-sm">
        <div>
          Статус:{" "}
          <span
            className={`inline-flex rounded-none px-2 py-0.5 text-xs font-bold ${
              status?.isSubscriber === true
                ? "bg-emerald-500 text-black"
                : status?.isSubscriber === false
                  ? "bg-zinc-600 text-white"
                  : "bg-amber-500 text-black"
            }`}
          >
            {confirmedLabel}
          </span>
        </div>
        <div>Последняя успешная проверка: {formatDateTime(status?.lastSyncedAt ?? null)}</div>
        {status?.lastSyncError && (
          <div className="text-xs text-zinc-400">
            Последняя ошибка проверки: {status.lastSyncError}
          </div>
        )}
        {status?.isSubscriber === false && (
          <div className="text-xs text-zinc-400">
            Проверка относится к подписке на Olesha в СВАГА+, а не к любому аккаунту платформы.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void handleRefresh()}
        disabled={loading}
        className="pixel-btn min-h-11 px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-60"
      >
        {loading ? "Проверка..." : "Проверить подписку"}
      </button>

      {successMessage && (
        <div className="mt-2 text-sm text-emerald-300" role="status" aria-live="polite">
          {successMessage}
        </div>
      )}
      {staleNote && (
        <div className="mt-2 text-sm text-amber-300" role="alert">
          Не удалось обновить статус; показаны последние подтверждённые данные
        </div>
      )}
      {errorMessage && (
        <div className="mt-2 rounded-none border-2 border-red-500 bg-red-900/30 p-2 text-sm text-red-300" role="alert">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
