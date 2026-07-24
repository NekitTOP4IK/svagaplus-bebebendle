import { describe, it, expect } from "vitest";
import {
  introShouldShow,
  parseCompetitiveIntro,
  parseCompetitiveIntroFromJsonString,
  serializeCompetitiveIntro,
} from "@/lib/competitive/intro";

describe("parseCompetitiveIntro", () => {
  it("defaults when empty", () => {
    const c = parseCompetitiveIntro(null);
    expect(c.enabled).toBe(false);
    expect(c.title.length).toBeGreaterThan(0);
  });

  it("parses enabled and fields", () => {
    const c = parseCompetitiveIntro({
      enabled: true,
      title: "  Hi  ",
      body: "Welcome **all**",
    });
    expect(c.enabled).toBe(true);
    expect(c.title).toBe("Hi");
    expect(c.body).toBe("Welcome **all**");
  });

  it("round-trips JSON", () => {
    const raw = serializeCompetitiveIntro({
      enabled: true,
      title: "T",
      body: "B",
    });
    const c = parseCompetitiveIntroFromJsonString(raw);
    expect(c).toEqual({ enabled: true, title: "T", body: "B" });
  });
});

describe("introShouldShow", () => {
  it("requires enabled, body, not dismissed", () => {
    expect(
      introShouldShow(
        { enabled: true, title: "T", body: "Hello" },
        false,
      ),
    ).toBe(true);
    expect(
      introShouldShow(
        { enabled: true, title: "T", body: "Hello" },
        true,
      ),
    ).toBe(false);
    expect(
      introShouldShow({ enabled: false, title: "T", body: "Hello" }, false),
    ).toBe(false);
    expect(
      introShouldShow({ enabled: true, title: "T", body: "   " }, false),
    ).toBe(false);
  });
});
