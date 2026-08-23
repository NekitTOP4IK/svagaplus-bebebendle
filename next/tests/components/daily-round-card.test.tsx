// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { RoundCard } from "@/components/daily/round-card";

const setPlayerObscured = vi.hoisted(() => vi.fn());

vi.mock("@/components/audio/audio-provider", () => ({
  useOptionalAudioController: () => ({ setPlayerObscured }),
}));

const globals = readFileSync(
  resolve(process.cwd(), "app/globals.css"),
  "utf8",
);

const scran = {
  id: 1,
  imageUrl: "/uploads/sample.jpg",
  name: "Бургер с говядиной",
  description: "Сочная котлета, сыр чеддер и соус.",
  price: 549,
  icon: "CakeNew.png",
  isSubscriberAtSubmit: false,
};

function renderCard(position: "left" | "right") {
  return render(
    <RoundCard
      scran={scran}
      onVote={() => {}}
      isVoting={false}
      position={position}
    />,
  );
}

describe("daily round card info panel", () => {
  it("keeps the top card's panel clear of the VS badge on mobile", () => {
    const { container } = renderCard("left");
    const wrapper = container.querySelector("div.absolute.bottom-0");

    expect(wrapper?.className).toContain("pb-8");
    expect(wrapper?.className).toContain("sm:pb-6");
  });

  it("leaves the bottom card flush against the viewport edge", () => {
    const { container } = renderCard("right");
    const wrapper = container.querySelector("div.absolute.bottom-0");

    expect(wrapper?.className).not.toContain("pb-8");
  });

  it("dims the soundtrack player only while the right dish is hovered", () => {
    setPlayerObscured.mockClear();
    const { getByRole, unmount } = renderCard("right");
    const card = getByRole("button");

    fireEvent.pointerEnter(card);
    expect(setPlayerObscured).toHaveBeenLastCalledWith(true);
    fireEvent.pointerLeave(card);
    expect(setPlayerObscured).toHaveBeenLastCalledWith(false);
    unmount();
    expect(setPlayerObscured).toHaveBeenLastCalledWith(false);
  });

  it("does not dim the soundtrack player over the left dish", () => {
    setPlayerObscured.mockClear();
    const { getByRole, unmount } = renderCard("left");
    const card = getByRole("button");

    fireEvent.pointerEnter(card);
    fireEvent.pointerLeave(card);
    unmount();
    expect(setPlayerObscured).not.toHaveBeenCalled();
  });

  it("clamps the description to one line on mobile", () => {
    const { container } = renderCard("left");
    const description = container.querySelector("p");

    expect(description?.className).toContain("line-clamp-1");
    expect(description?.className).toContain("sm:line-clamp-2");
  });

  it("draws the frame from CSS so a media query can override it", () => {
    const { container } = renderCard("left");
    const frame = container.querySelector(".scran-frame");

    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("style")).toBeNull();
  });

  it("thins the frame on mobile only", () => {
    expect(globals).toContain("border: 4px solid #555555;");
    expect(globals).toContain("border-width: 6px;");
  });
});
