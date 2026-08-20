// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntranceGate } from "@/components/entrance-gate";

describe("EntranceGate", () => {
  it("requires an explicit interaction before revealing the home overlays", async () => {
    const onEntered = vi.fn();
    render(<EntranceGate onEntered={onEntered} />);

    expect(screen.getByRole("dialog", { name: "Всё готово!" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Войти в игру" }));

    await waitFor(() => expect(onEntered).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Всё готово!" })).not.toBeInTheDocument();
  });
});
