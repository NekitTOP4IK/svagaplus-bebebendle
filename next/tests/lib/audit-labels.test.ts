import { describe, expect, it } from "vitest";
import { auditActionLabel, auditDetailsPreview } from "@/lib/audit-labels";

describe("auditActionLabel", () => {
  it("maps known actions to Russian", () => {
    expect(auditActionLabel("scran.approve")).toBe("Скран одобрен");
    expect(auditActionLabel("scran.reject")).toBe("Скран отклонён");
    expect(auditActionLabel("user.ban")).toBe("Пользователь забанен");
    expect(auditActionLabel("daily.generate")).toBe("Daily сгенерирован");
  });

  it("falls back to raw action", () => {
    expect(auditActionLabel("custom.thing")).toBe("custom.thing");
  });
});

describe("auditDetailsPreview", () => {
  it("extracts name from JSON", () => {
    expect(auditDetailsPreview(JSON.stringify({ name: "Борщ" }))).toBe("Борщ");
  });

  it("handles plain strings", () => {
    expect(auditDetailsPreview("просто текст")).toBe("просто текст");
  });
});
