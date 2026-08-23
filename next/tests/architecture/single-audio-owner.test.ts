import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

const sourceFiles = (path: string): string[] =>
  readdirSync(resolve(root, path), { withFileTypes: true }).flatMap((entry) => {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.[tj]sx?$/.test(entry.name) ? [child] : [];
  });

const read = (path: string): string => readFileSync(resolve(root, path), "utf8");

describe("single audio owner boundary", () => {
  it("only audio-provider.tsx may construct a browser audio element", () => {
    const offenders = [...sourceFiles("app"), ...sourceFiles("components"), ...sourceFiles("hooks")]
      .filter((path) => path !== "components/audio/audio-provider.tsx")
      .filter((path) => /new\s+Audio\s*\(|<audio\b/i.test(read(path)));

    expect(offenders).toEqual([]);
  });

  it("audio-provider.tsx constructs exactly one audio element type", () => {
    const provider = read("components/audio/audio-provider.tsx");

    expect(provider).toMatch(/new\s+Audio\s*\(/);
    expect(provider).not.toMatch(/<audio\b/i);
  });
});
