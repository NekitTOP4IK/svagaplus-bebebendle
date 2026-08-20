import { describe, expect, it } from "vitest";
import {
  SOUNDTRACK_MANIFEST,
  type SoundtrackManifest,
  type SoundtrackTrack,
} from "@/lib/audio/soundtrack-manifest";
import {
  casualOutcome,
  chooseSupportedSource,
  rankedOutcome,
  resolveRouteAudioScene,
  supportedSources,
  tracksForScene,
} from "@/lib/audio/soundtrack";

const EMPTY_MANIFEST: SoundtrackManifest = {
  casualMenu: [],
  casualGame: [],
  rankedMenu: [],
  rankedGame: [],
};

const trackA: SoundtrackTrack = {
  id: "casual-menu-a",
  title: "Тема меню A",
  sources: [
    { src: "/soundtrack/menu-a.ogg", type: "audio/ogg" },
    { src: "/soundtrack/menu-a.mp3", type: "audio/mpeg" },
  ],
};

const trackB: SoundtrackTrack = {
  id: "casual-menu-b",
  title: "Тема меню B",
  sources: [
    { src: "/soundtrack/menu-b.ogg", type: "audio/ogg" },
    { src: "/soundtrack/menu-b.mp3", type: "audio/mpeg" },
  ],
};

const VICTORY_JINGLE: SoundtrackTrack = {
  id: "victory",
  title: "Победа",
  sources: [
    { src: "/soundtrack/victory.ogg", type: "audio/ogg" },
    { src: "/soundtrack/victory.mp3", type: "audio/mpeg" },
  ],
};

function fixtureManifest(): SoundtrackManifest {
  return {
    casualMenu: [trackA, trackB],
    casualGame: [trackB],
    rankedMenu: [],
    rankedGame: [trackA],
    victoryJingle: VICTORY_JINGLE,
  };
}

describe("SOUNDTRACK_MANIFEST", () => {
  it("maps every scene and outcome to an OGG-first MP3-fallback pair", () => {
    const tracks = [
      ...SOUNDTRACK_MANIFEST.casualMenu,
      ...SOUNDTRACK_MANIFEST.casualGame,
      ...SOUNDTRACK_MANIFEST.rankedMenu,
      ...SOUNDTRACK_MANIFEST.rankedGame,
      SOUNDTRACK_MANIFEST.victoryJingle,
      SOUNDTRACK_MANIFEST.defeatJingle,
    ];

    expect(tracks).toHaveLength(6);
    for (const track of tracks) {
      expect(track).toBeDefined();
      expect(track!.sources).toEqual([
        { src: `/soundtrack/${track!.id}.ogg`, type: "audio/ogg" },
        { src: `/soundtrack/${track!.id}.mp3`, type: "audio/mpeg" },
      ]);
    }
  });
});

describe("tracksForScene", () => {
  it("returns no tracks for silent scenes", () => {
    expect(tracksForScene(EMPTY_MANIFEST, "silent")).toEqual([]);
    expect(tracksForScene(fixtureManifest(), "silent")).toEqual([]);
  });

  it("exposes the manifest playlist reference without copying", () => {
    const manifest = fixtureManifest();
    expect(tracksForScene(manifest, "casual-menu")).toBe(manifest.casualMenu);
    expect(tracksForScene(manifest, "casual-game")).toBe(manifest.casualGame);
    expect(tracksForScene(manifest, "ranked-menu")).toBe(manifest.rankedMenu);
    expect(tracksForScene(manifest, "ranked-game")).toBe(manifest.rankedGame);
  });

  it("returns empty playlists for scenes without tracks", () => {
    expect(tracksForScene(fixtureManifest(), "ranked-menu")).toEqual([]);
  });
});

describe("resolveRouteAudioScene", () => {
  it("maps the home route to the casual menu scene", () => {
    expect(resolveRouteAudioScene("/")).toBe("casual-menu");
  });

  it("keeps the casual menu soundtrack on settings and administration routes", () => {
    expect(resolveRouteAudioScene("/settings")).toBe("casual-menu");
    expect(resolveRouteAudioScene("/admin")).toBe("casual-menu");
    expect(resolveRouteAudioScene("/admin/announcements")).toBe("casual-menu");
  });

  it("maps the competitive hub to the ranked menu scene", () => {
    expect(resolveRouteAudioScene("/competitive")).toBe("ranked-menu");
  });

  it("keeps game routes silent until gameplay claims a scene", () => {
    expect(resolveRouteAudioScene("/daily")).toBe("silent");
    expect(resolveRouteAudioScene("/competitive/play")).toBe("silent");
    expect(resolveRouteAudioScene("/profile")).toBe("silent");
    expect(resolveRouteAudioScene("/competitive/seasons")).toBe("silent");
  });

  it("does not prefix-match unrelated routes", () => {
    expect(resolveRouteAudioScene("/competitive-old")).toBe("silent");
    expect(resolveRouteAudioScene("/competition")).toBe("silent");
    expect(resolveRouteAudioScene("/daily-old")).toBe("silent");
  });
});

describe("supportedSources and chooseSupportedSource", () => {
  it("preserves manifest order and accepts both maybe and probably", () => {
    expect(
      supportedSources(trackA, (type) => (type === "audio/mpeg" ? "maybe" : "")),
    ).toEqual([trackA.sources[1]]);
    expect(
      supportedSources(trackA, (type) => (type.startsWith("audio/ogg") ? "probably" : "")),
    ).toEqual([trackA.sources[0]]);
    expect(
      supportedSources(trackA, () => "probably"),
    ).toEqual([trackA.sources[0], trackA.sources[1]]);
    expect(supportedSources(trackA, () => "")).toEqual([]);
  });

  it("chooses the first supported source or null", () => {
    expect(
      chooseSupportedSource(trackA, (type) => (type.startsWith("audio/ogg") ? "probably" : "")),
    ).toEqual(trackA.sources[0]);
    expect(
      chooseSupportedSource(trackA, (type) => (type === "audio/mpeg" ? "maybe" : "")),
    ).toEqual(trackA.sources[1]);
    expect(chooseSupportedSource(trackA, () => "")).toBeNull();
  });
});

describe("casualOutcome", () => {
  it("treats meeting the average as victory", () => {
    expect(casualOutcome(6, 6)).toBe("victory");
    expect(casualOutcome(7, 6)).toBe("victory");
  });

  it("treats scoring below the average as defeat", () => {
    expect(casualOutcome(5, 6)).toBe("defeat");
  });

  it("compares the score with itself when no average exists", () => {
    expect(casualOutcome(0, null)).toBe("victory");
    expect(casualOutcome(9, null)).toBe("victory");
  });
});

describe("rankedOutcome", () => {
  it("uses the percentile when available", () => {
    expect(rankedOutcome({ betterThanPercent: 50, hits: 0, totalRounds: 10 })).toBe("victory");
    expect(rankedOutcome({ betterThanPercent: 72, hits: 1, totalRounds: 10 })).toBe("victory");
    expect(rankedOutcome({ betterThanPercent: 49, hits: 10, totalRounds: 10 })).toBe("defeat");
  });

  it("falls back to a majority of rounds when the percentile is missing", () => {
    expect(rankedOutcome({ betterThanPercent: null, hits: 5, totalRounds: 10 })).toBe("victory");
    expect(rankedOutcome({ betterThanPercent: null, hits: 4, totalRounds: 10 })).toBe("defeat");
    expect(rankedOutcome({ betterThanPercent: null, hits: 4, totalRounds: 7 })).toBe("victory");
  });
});
