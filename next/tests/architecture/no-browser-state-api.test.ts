import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const forbidden = /(?:fetch|apiFetch)\s*\([^\n]*["'`]\/api\/(?:auth|user|svaga|admin|competitive)/;

describe("client state boundary", () => {
  test("client components and hooks use server actions instead of state APIs", () => {
    const roots = ["app", "components", "hooks"];
    const files = roots.flatMap((root) => readdirSync(root, { recursive: true })
      .filter((entry) => typeof entry === "string" && /\.(ts|tsx)$/.test(entry))
      .map((entry) => path.join(root, entry)));
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes('"use client"') && forbidden.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
