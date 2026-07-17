import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBoolMock, sendMock } = vi.hoisted(() => ({
  getBoolMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("@/lib/app-settings", () => ({
  isDailyRotationNotifyEnabled: getBoolMock,
}));

vi.mock("@/lib/telegram-notify", async () => {
  const actual = await vi.importActual<typeof import("@/lib/telegram-notify")>(
    "@/lib/telegram-notify",
  );
  return {
    ...actual,
    sendTelegramMessage: sendMock,
  };
});

import { notifyAuthorsDailyRotation } from "@/lib/daily-rotation-notify";

describe("notifyAuthorsDailyRotation", () => {
  beforeEach(() => {
    getBoolMock.mockReset();
    sendMock.mockReset();
  });

  it("no-ops when setting is off", async () => {
    getBoolMock.mockResolvedValue(false);
    const result = await notifyAuthorsDailyRotation("2026-07-17", [
      { id: 1, name: "A", telegramId: "111" },
    ]);
    expect(result.disabled).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("groups by author and sends once", async () => {
    getBoolMock.mockResolvedValue(true);
    sendMock.mockResolvedValue(true);

    const result = await notifyAuthorsDailyRotation("2026-07-17", [
      { id: 1, name: "A", telegramId: "111" },
      { id: 2, name: "B", telegramId: "111" },
      { id: 3, name: "C", telegramId: "222" },
      { id: 4, name: "D", telegramId: null },
    ]);

    expect(result.disabled).toBe(false);
    expect(result.sent).toBe(2);
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[0][0]).toBe("111");
    expect(sendMock.mock.calls[0][1]).toContain("• A");
    expect(sendMock.mock.calls[0][1]).toContain("• B");
    expect(sendMock.mock.calls[1][0]).toBe("222");
  });
});
