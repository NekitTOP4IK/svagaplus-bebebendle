// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProfileSvagaStatus } from "@/components/profile-svaga-status";
import { TelegramLogin } from "@/components/telegram-login";

const actions = vi.hoisted(() => ({ refreshSvagaStatus: vi.fn() }));

vi.mock("@/app/actions/profile", () => ({
  refreshSvagaStatus: actions.refreshSvagaStatus,
}));

describe("ProfileSvagaStatus", () => {
  beforeEach(() => {
    actions.refreshSvagaStatus.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows confirmed subscriber state", () => {
    render(
      <ProfileSvagaStatus
        initialStatus={{
          status: "subscriber",
          isSubscriber: true,
          lastSyncedAt: "2026-07-16T12:00:00Z",
          lastSyncAttemptAt: "2026-07-16T12:00:00Z",
          lastSyncError: null,
        }}
      />,
    );
    expect(screen.getByText("Подписка СВАГА+")).toBeInTheDocument();
    expect(screen.getByText("Подписка активна")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Проверить подписку" })).toBeInTheDocument();
  });

  it("shows confirmed non-subscriber state", () => {
    render(
      <ProfileSvagaStatus
        initialStatus={{
          status: "not_subscriber",
          isSubscriber: false,
          lastSyncedAt: "2026-07-16T12:00:00Z",
          lastSyncAttemptAt: "2026-07-16T12:00:00Z",
          lastSyncError: null,
        }}
      />,
    );
    expect(screen.getByText("Активная подписка на Olesha не найдена")).toBeInTheDocument();
  });

  it("shows unknown state", () => {
    render(
      <ProfileSvagaStatus
        initialStatus={{
          status: "unknown",
          isSubscriber: null,
          lastSyncedAt: null,
          lastSyncAttemptAt: null,
          lastSyncError: null,
        }}
      />,
    );
    expect(screen.getByText("Статус подписки пока не удалось проверить")).toBeInTheDocument();
  });

  it("shows stale error copy with alert role", async () => {
    actions.refreshSvagaStatus.mockResolvedValueOnce({
      ok: true,
      data: { isSubscriber: true, source: "stale_cache", checkedAt: "2026-07-16T10:00:00Z", error: "timeout" },
    });

    render(
      <ProfileSvagaStatus
        initialStatus={{
          status: "subscriber",
          isSubscriber: true,
          lastSyncedAt: "2026-07-16T10:00:00Z",
          lastSyncAttemptAt: "2026-07-16T10:00:00Z",
          lastSyncError: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Проверить подписку" }));
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(
        "Не удалось обновить статус; показаны последние подтверждённые данные",
      );
    });
  });

  it("shows success live region on refresh", async () => {
    actions.refreshSvagaStatus.mockResolvedValueOnce({
      ok: true,
      data: { isSubscriber: true, source: "fresh", checkedAt: "2026-07-16T12:00:00Z", error: null },
    });

    render(
      <ProfileSvagaStatus
        initialStatus={{
          status: "unknown",
          isSubscriber: null,
          lastSyncedAt: null,
          lastSyncAttemptAt: null,
          lastSyncError: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Проверить подписку" }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Статус подписки обновлён");
    });
  });

  it("shows player login copy", () => {
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = "test_bot";
    render(<TelegramLogin onAuthenticated={async () => true} context="player" />);
    expect(screen.getByText("Войти через Telegram")).toBeInTheDocument();
  });
});
