// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  requireRole: vi.fn().mockRejectedValue(new Error("Unauthorized")),
}));

import {
  getCompetitiveIntro,
  getCompetitiveSettings,
  saveCompetitiveIntro,
  saveCompetitiveSettings,
  saveCompetitiveModeRules,
  uploadCompetitiveContentAsset,
} from "@/app/admin/competitive-actions";
import { requireRole } from "@/lib/auth-server";

describe("competitive content server actions", () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
  });
  it("rejects an unauthenticated asset upload", async () => {
    const formData = new FormData();
    formData.set("file", new File(["image"], "asset.png", { type: "image/png" }));

    await expect(uploadCompetitiveContentAsset(formData)).resolves.toEqual({
      success: false,
      message: "Unauthorized",
    });
  });

  it.each([
    ["intro read", () => getCompetitiveIntro()],
    ["intro save", () => saveCompetitiveIntro({ enabled: true, title: "Title", body: "Body" })],
    ["settings read", () => getCompetitiveSettings()],
    ["settings save", () => saveCompetitiveSettings(true)],
    ["mode rules save", () => saveCompetitiveModeRules({ version: 1, blocks: [] })],
  ])("rejects an unauthenticated %s request", async (_name, action) => {
    await expect(action()).resolves.toEqual({
      success: false,
      message: "Unauthorized",
    });
  });

  it("rejects a non-boolean competitive settings value", async () => {
    vi.mocked(requireRole).mockResolvedValue({ id: 1 } as never);

    await expect(saveCompetitiveSettings("true")).resolves.toEqual({
      success: false,
      message: "competitiveEnabled (boolean) is required",
    });
  });
});
