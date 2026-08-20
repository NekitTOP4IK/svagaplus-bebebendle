import { describe, expect, it } from "vitest";
import { SOUNDTRACK_MANIFEST } from "@/lib/audio/soundtrack-manifest";
import {
  applySoundtrackMetadata,
  DEFAULT_SOUNDTRACK_METADATA,
  normalizeSoundtrackMetadata,
} from "@/lib/audio/soundtrack-metadata";

describe("normalizeSoundtrackMetadata", () => {
  it("fills malformed and missing slots with defaults", () => {
    const metadata = normalizeSoundtrackMetadata({
      "start-menu": { title: "  Тихий старт  ", artist: "  Музыкант  " },
      "daily-game": { title: "", artist: 42 },
    });

    expect(metadata["start-menu"]).toEqual({
      title: "Тихий старт",
      artist: "Музыкант",
    });
    expect(metadata["daily-game"]).toEqual(DEFAULT_SOUNDTRACK_METADATA["daily-game"]);
    expect(metadata["game-win"]).toEqual(DEFAULT_SOUNDTRACK_METADATA["game-win"]);
  });
});

describe("applySoundtrackMetadata", () => {
  it("updates titles and artists without changing audio sources", () => {
    const metadata = normalizeSoundtrackMetadata({
      ...DEFAULT_SOUNDTRACK_METADATA,
      "start-menu": { title: "Утро в кубах", artist: "Test Artist" },
    });
    const resolved = applySoundtrackMetadata(SOUNDTRACK_MANIFEST, metadata);

    expect(resolved.casualMenu[0]).toMatchObject({
      id: "start-menu",
      title: "Утро в кубах",
      artist: "Test Artist",
    });
    expect(resolved.casualMenu[0]?.sources).toBe(
      SOUNDTRACK_MANIFEST.casualMenu[0]?.sources,
    );
  });

  it("omits an empty artist from the player track", () => {
    const resolved = applySoundtrackMetadata(
      SOUNDTRACK_MANIFEST,
      DEFAULT_SOUNDTRACK_METADATA,
    );

    expect(resolved.casualMenu[0]).not.toHaveProperty("artist");
  });
});
