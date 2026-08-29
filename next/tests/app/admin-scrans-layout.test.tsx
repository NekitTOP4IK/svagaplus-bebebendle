import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectionMock, getCurrentUserMock, redirectMock } = vi.hoisted(() => ({
  connectionMock: vi.fn(async () => undefined),
  getCurrentUserMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: connectionMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/auth-server", () => ({
  getCurrentUser: getCurrentUserMock,
  isStaffRole: (role: string | null | undefined) => role === "moderator" || role === "admin",
}));

import AdminScransLayout from "@/app/admin/scrans/layout";

describe("AdminScransLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ role: "admin" });
  });

  it("opts into request-time rendering before checking the staff session", async () => {
    const result = await AdminScransLayout({ children: <div>card</div> });

    expect(connectionMock).toHaveBeenCalledOnce();
    expect(getCurrentUserMock).toHaveBeenCalledOnce();
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      getCurrentUserMock.mock.invocationCallOrder[0],
    );
    expect(result).toBeTruthy();
  });
});
