// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
  getCurrentUser: dependencies.getCurrentUser,
  isStaffRole: (role: string | null | undefined) => role === "moderator" || role === "admin",
}));

import { getAdminSessionSnapshot } from "@/app/actions/auth";

describe("getAdminSessionSnapshot", () => {
  beforeEach(() => {
    dependencies.getCurrentUser.mockReset();
  });

  it("returns a staff role only for an authenticated staff user", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ role: "moderator" });

    await expect(getAdminSessionSnapshot()).resolves.toEqual({
      authenticated: true,
      role: "moderator",
    });
  });

  it("does not grant admin access to a player session", async () => {
    dependencies.getCurrentUser.mockResolvedValue({ role: "player" });

    await expect(getAdminSessionSnapshot()).resolves.toEqual({
      authenticated: false,
      role: null,
    });
  });
});
