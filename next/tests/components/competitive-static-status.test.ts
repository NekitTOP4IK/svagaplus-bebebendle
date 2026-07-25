import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "components/competitive/competitive.css"),
  "utf8",
);

describe("competitive streak status visuals", () => {
  it("keeps fire and freeze visuals static with a centered block SVG", () => {
    expect(css).not.toContain("animation: c-fire-flicker");
    expect(css).not.toContain("animation: c-freeze-shimmer");
    expect(css).not.toContain("animation: c-freeze-pulse");
    expect(css).toMatch(/\.c-streak-fire__icon\s*\{[^}]*display:\s*block;/s);
    expect(css).toMatch(/\.c-streak-fire__icon\s*\{[^}]*flex:\s*0 0 auto;/s);
  });
});
