import { describe, it, expect } from "vitest";
import { validateAnnouncement } from "@/lib/announcements";

describe("validateAnnouncement", () => {
  it("accepts valid title and body", () => {
    const r = validateAnnouncement({ title: "Привет", body: "Текст объявления" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.title).toBe("Привет");
      expect(r.body).toBe("Текст объявления");
    }
  });

  it("trims whitespace before validating", () => {
    const r = validateAnnouncement({ title: "  Заголовок  ", body: "  Тело  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.title).toBe("Заголовок");
      expect(r.body).toBe("Тело");
    }
  });

  it("rejects empty title", () => {
    const r = validateAnnouncement({ title: "   ", body: "ok" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/title/i);
  });

  it("rejects empty body", () => {
    const r = validateAnnouncement({ title: "ok", body: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/body/i);
  });

  it("rejects title over 200 chars", () => {
    const r = validateAnnouncement({ title: "x".repeat(201), body: "ok" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/title/i);
  });

  it("rejects body over 5000 chars", () => {
    const r = validateAnnouncement({ title: "ok", body: "x".repeat(5001) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/body/i);
  });

  it("accepts title at exactly 200 chars", () => {
    const r = validateAnnouncement({ title: "x".repeat(200), body: "ok" });
    expect(r.ok).toBe(true);
  });

  it("accepts body at exactly 5000 chars", () => {
    const r = validateAnnouncement({ title: "ok", body: "x".repeat(5000) });
    expect(r.ok).toBe(true);
  });

  it("rejects non-string title", () => {
    const r = validateAnnouncement({ title: 123, body: "ok" });
    expect(r.ok).toBe(false);
  });
});