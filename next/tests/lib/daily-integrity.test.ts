import { describe, expect, it } from "vitest";
import { resolvePlaySessionId } from "@/lib/daily-integrity";

describe("resolvePlaySessionId", () => {
  it("uses fingerprint when long enough", () => {
    const fp = "a".repeat(32);
    expect(resolvePlaySessionId(fp, "1.2.3.4")).toBe(fp);
  });

  it("falls back to stable anon-IP without timestamp", () => {
    expect(resolvePlaySessionId(null, "10.0.0.1")).toBe("anon-10.0.0.1");
    expect(resolvePlaySessionId("short", "10.0.0.1")).toBe("anon-10.0.0.1");
    expect(resolvePlaySessionId(null, "10.0.0.1")).toBe(
      resolvePlaySessionId("", "10.0.0.1"),
    );
  });
});
