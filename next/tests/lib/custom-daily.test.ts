// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CUSTOM_DAILY_ENTRY_COUNT,
  isCustomDailyDate,
  pairCustomDailyScranIds,
  parseCustomDailyScranSearch,
  validateCustomDailyInput,
  validateCustomDailyScranCatalogInput,
  validateCustomDailyPublishEntries,
} from "@/lib/admin/custom-daily";

describe("custom Daily validation", () => {
  const valid = {
    name: "  Битва бургеров  ",
    targetDate: "2026-09-12",
    notifyAuthors: true,
    scranIds: [1, 2, 3],
  };

  it("normalizes a valid draft and permits fewer than twenty entries", () => {
    expect(validateCustomDailyInput(valid)).toEqual({
      ok: true,
      data: {
        ...valid,
        name: "Битва бургеров",
        showEventBadge: true,
        showOnHome: false,
        badgeStyle: "violet",
      },
    });
  });

  it("validates custom Daily presentation settings", () => {
    expect(validateCustomDailyInput({
      ...valid,
      showEventBadge: false,
      showOnHome: true,
      badgeStyle: "rainbow",
    })).toMatchObject({
      ok: true,
      data: { showEventBadge: false, showOnHome: true, badgeStyle: "rainbow" },
    });
    expect(validateCustomDailyInput({ ...valid, showEventBadge: "yes" })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(validateCustomDailyInput({ ...valid, badgeStyle: "sparkles" })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
  });

  it("rejects duplicate, excessive, and malformed IDs", () => {
    expect(validateCustomDailyInput({ ...valid, scranIds: [1, 1] })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(validateCustomDailyInput({
      ...valid,
      scranIds: Array.from({ length: CUSTOM_DAILY_ENTRY_COUNT + 1 }, (_, index) => index + 1),
    })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(validateCustomDailyInput({ ...valid, scranIds: [0, 2] })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
  });

  it("validates real calendar dates instead of only their shape", () => {
    expect(isCustomDailyDate("2028-02-29")).toBe(true);
    expect(isCustomDailyDate("2027-02-29")).toBe(false);
    expect(isCustomDailyDate("2026-13-01")).toBe(false);
    expect(isCustomDailyDate("12.09.2026")).toBe(false);
  });

  it("recognizes numeric ID searches while preserving name searches", () => {
    expect(parseCustomDailyScranSearch("  23 ")).toEqual({ text: "23", numericId: 23 });
    expect(parseCustomDailyScranSearch("борщ")).toEqual({ text: "борщ", numericId: null });
    expect(parseCustomDailyScranSearch("0")).toEqual({ text: "0", numericId: null });
  });

  it("validates and normalizes custom Daily catalog parameters", () => {
    expect(validateCustomDailyScranCatalogInput({ query: "  борщ  ", page: 2, sort: "price_desc" })).toEqual({
      ok: true,
      data: { query: "борщ", page: 2, sort: "price_desc" },
    });
    expect(validateCustomDailyScranCatalogInput({ query: "", page: 0, sort: "newest" })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(validateCustomDailyScranCatalogInput({ query: "", page: 1, sort: "popular" })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(validateCustomDailyScranCatalogInput({ query: "x".repeat(101), page: 1, sort: "name" })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
  });
});

describe("custom Daily pairing", () => {
  it("derives ten deterministic adjacent pairs from ordered IDs", () => {
    const ids = Array.from({ length: CUSTOM_DAILY_ENTRY_COUNT }, (_, index) => index + 101);
    const pairs = pairCustomDailyScranIds(ids);
    expect(pairs).toHaveLength(10);
    expect(pairs[0]).toEqual({ roundNumber: 1, scranAId: 101, scranBId: 102 });
    expect(pairs[9]).toEqual({ roundNumber: 10, scranAId: 119, scranBId: 120 });
  });

  it("rejects missing, duplicate, unapproved, and rejected publish entries", () => {
    const entries = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      approved: true,
      rejected: false,
    }));
    expect(validateCustomDailyPublishEntries(entries)).toMatchObject({ ok: true });
    expect(validateCustomDailyPublishEntries(entries.slice(1))).toMatchObject({ ok: false, code: "invalid_scrans" });
    expect(validateCustomDailyPublishEntries([...entries.slice(0, 19), entries[0]!])).toMatchObject({ ok: false, code: "invalid_scrans" });
    expect(validateCustomDailyPublishEntries(entries.map((entry, index) => index === 3 ? { ...entry, approved: false } : entry))).toMatchObject({ ok: false, code: "invalid_scrans" });
    expect(validateCustomDailyPublishEntries(entries.map((entry, index) => index === 3 ? { ...entry, rejected: true } : entry))).toMatchObject({ ok: false, code: "invalid_scrans" });
  });

  it("refuses incomplete and duplicate publish selections", () => {
    expect(() => pairCustomDailyScranIds([1, 2])).toThrow(/exactly 20 unique/);
    expect(() => pairCustomDailyScranIds(Array(20).fill(1))).toThrow(/exactly 20 unique/);
  });
});
