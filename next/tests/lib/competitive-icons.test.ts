import { describe, it, expect } from "vitest";
import {
  COMPETITIVE_ICONS,
  swordSrcForPlace,
  swordTierForPlace,
} from "@/lib/competitive/icons";

describe("competitive icons", () => {
  it("maps place tiers for play sword", () => {
    expect(swordTierForPlace(null)).toBe("iron");
    expect(swordTierForPlace(1)).toBe("netherite");
    expect(swordTierForPlace(2)).toBe("diamond");
    expect(swordTierForPlace(3)).toBe("diamond");
    expect(swordTierForPlace(10)).toBe("golden");
    expect(swordTierForPlace(11)).toBe("iron");
    expect(swordTierForPlace(50)).toBe("iron");
    expect(swordTierForPlace(51)).toBe("copper");
  });

  it("resolves sword src under public icons path", () => {
    expect(swordSrcForPlace(1)).toBe(COMPETITIVE_ICONS.swords.netherite);
    expect(swordSrcForPlace(null)).toBe(COMPETITIVE_ICONS.swords.iron);
  });
});
