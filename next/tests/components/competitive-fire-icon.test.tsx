// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { StreakFire } from "@/components/competitive/streak-fire";

const css = readFileSync(
  resolve(process.cwd(), "components/competitive/competitive.css"),
  "utf8",
);

describe("streak fire icon fit", () => {
  it("uses a viewBox tight to the flame artwork", () => {
    const { container } = render(<StreakFire days={5} />);
    const svg = container.querySelector(".c-streak-fire__icon");

    expect(svg?.getAttribute("viewBox")).toBe("15 5 34 60.5");
  });

  it("declares the flame aspect ratio on the element", () => {
    const { container } = render(<StreakFire days={5} />);
    const svg = container.querySelector(".c-streak-fire__icon");

    expect(svg?.getAttribute("width")).toBe("23");
    expect(svg?.getAttribute("height")).toBe("40");
  });

  it("sizes the icon so height governs the fit", () => {
    expect(css).toMatch(/\.c-streak-fire__icon\s*\{[^}]*width:\s*23px;/);
    expect(css).toMatch(/\.c-streak-fire__icon\s*\{[^}]*height:\s*40px;/);
  });

  it("drops rules for elements that no longer exist", () => {
    expect(css).not.toContain(".c-streak-fire__icons");
  });
});
