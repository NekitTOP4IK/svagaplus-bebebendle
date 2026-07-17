import { describe, expect, it } from "vitest";
import {
  buildBanNotifyMessage,
  isBanReasonCode,
  pendingRejectReasonForBan,
  resolveBanReason,
} from "@/lib/ban-reasons";

describe("ban-reasons", () => {
  it("accepts known codes", () => {
    expect(isBanReasonCode("spam")).toBe(true);
    expect(isBanReasonCode("custom")).toBe(true);
    expect(isBanReasonCode("nope")).toBe(false);
  });

  it("requires custom text for custom reason", () => {
    expect(resolveBanReason("custom", "  ").ok).toBe(false);
    expect(resolveBanReason("custom", "ab").ok).toBe(false);
    const ok = resolveBanReason("custom", "спам без устали");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.reason).toBe("спам без устали");
  });

  it("uses preset label without note", () => {
    const ok = resolveBanReason("nsfw", "");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.reason).toContain("Неприемлемый");
  });

  it("builds notify and pending reject text", () => {
    expect(buildBanNotifyMessage("спам")).toContain("заблокировали");
    expect(pendingRejectReasonForBan("@mod")).toBe(
      "пользователь заблокирован модератором @mod",
    );
  });
});
