import { describe, expect, it } from "vitest";
import { normalizeCreditGroups } from "@/lib/credits";

describe("normalizeCreditGroups", () => {
  it("keeps valid groups, people and supported social buttons", () => {
    expect(normalizeCreditGroups([
      {
        title: " Музыка ",
        people: [
          {
            name: " Composer ",
            description: " OST ",
            socials: [
              { platform: "youtube", url: "https://youtube.com/@composer" },
              { platform: "discord", url: "https://example.com/ignored" },
            ],
          },
        ],
      },
    ])).toEqual([
      {
        title: "Музыка",
        people: [
          {
            name: "Composer",
            description: "OST",
            socials: [
              { platform: "youtube", url: "https://youtube.com/@composer" },
            ],
          },
        ],
      },
    ]);
  });

  it("drops malformed entries and unsafe URL schemes", () => {
    expect(normalizeCreditGroups([
      { title: "", people: [] },
      {
        title: "Разработка",
        people: [
          { name: "", socials: [] },
          {
            name: "Dev",
            socials: [{ platform: "telegram", url: "javascript:alert(1)" }],
          },
        ],
      },
    ])).toEqual([
      { title: "Разработка", people: [{ name: "Dev", socials: [] }] },
    ]);
  });
});
