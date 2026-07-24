import { describe, expect, it } from "vitest";
import { publicScran, resolvePlaySessionId } from "@/lib/daily-integrity";

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

describe("publicScran", () => {
  const fakeScran = {
    id: 42,
    imageUrl: "/img/x.png",
    name: "Test Scran",
    description: "desc",
    price: 12.5,
    icon: null as string | null,
    isSubscriberAtSubmit: true as boolean | null,
    // spoiler fields that must never appear on public payloads
    numberOfLikes: 99,
    numberOfDislikes: 1,
    likesA: 50,
    dislikesA: 10,
    likesB: 20,
    dislikesB: 30,
    approved: true,
    rejected: false,
  };

  it("mapPublicScran does not include like fields", () => {
    const mapped = publicScran(fakeScran);
    const keys = Object.keys(mapped);
    expect(keys).not.toContain("numberOfLikes");
    expect(keys).not.toContain("numberOfDislikes");
    expect(keys).not.toContain("likesA");
    expect(keys).not.toContain("dislikesA");
    expect(keys).not.toContain("likesB");
    expect(keys).not.toContain("dislikesB");
    expect(keys).not.toContain("approved");
    expect(keys).not.toContain("rejected");
  });

  it("keeps safe display fields and defaults icon", () => {
    const mapped = publicScran(fakeScran);
    expect(mapped).toEqual({
      id: 42,
      imageUrl: "/img/x.png",
      name: "Test Scran",
      description: "desc",
      price: 12.5,
      icon: "Cooked_Cod.png",
      isSubscriberAtSubmit: true,
    });
  });
});
