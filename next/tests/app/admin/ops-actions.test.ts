// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  requireRole: vi.fn().mockRejectedValue(new Error("Unauthorized")),
}));

vi.mock("@/db/schema", () => ({ db: {} }));

import {
  getAdminAuditLogs,
  getAdminDuplicates,
  getAdminHealth,
  getAdminStats,
} from "@/app/admin/actions";

describe("admin ops server actions", () => {
  it.each([
    ["stats", getAdminStats],
    ["audit", getAdminAuditLogs],
    ["duplicates", getAdminDuplicates],
    ["health", getAdminHealth],
  ])("rejects an unauthenticated %s request", async (_name, action) => {
    await expect(action()).resolves.toMatchObject({ success: false, message: "Unauthorized" });
  });
});
