import { describe, expect, it } from "vitest";
import {
  identityBadgeSrc,
  resolveIdentityTone,
} from "@/lib/user-identity";

describe("resolveIdentityTone", () => {
  it("admin wins over subscriber", () => {
    expect(resolveIdentityTone("admin", true)).toBe("admin");
    expect(identityBadgeSrc("admin")).toBe("/red_verified_badge.svg");
  });

  it("moderator wins over subscriber", () => {
    expect(resolveIdentityTone("moderator", true)).toBe("moderator");
    expect(identityBadgeSrc("moderator")).toBe("/blue_moderator_badge.svg");
  });

  it("streamer wins over subscriber", () => {
    expect(resolveIdentityTone("streamer", true)).toBe("streamer");
    expect(identityBadgeSrc("streamer")).toBe("/streamer-badge.svg");
  });

  it("subscriber for players", () => {
    expect(resolveIdentityTone("player", true)).toBe("subscriber");
    expect(identityBadgeSrc("subscriber")).toBe("/gold_verified_badge.svg");
  });

  it("default otherwise", () => {
    expect(resolveIdentityTone("player", false)).toBe("default");
    expect(identityBadgeSrc("default")).toBeNull();
  });
});
