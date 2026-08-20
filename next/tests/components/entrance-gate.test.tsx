// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntranceGate } from "@/components/entrance-gate";

describe("EntranceGate", () => {
  it("requires an explicit interaction before revealing the home overlays", async () => {
    const onEntered = vi.fn();
    const onActivate = vi.fn();
    render(<EntranceGate onActivate={onActivate} onEntered={onEntered} />);

    const title = "Я думаю тебе определённо стоит нажать кнопочку ниже";
    expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
    expect(screen.queryByText("Один клик — и можно начинать.")).not.toBeInTheDocument();
    expect(screen.queryByText("Мир успешно прогружен")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(onActivate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onEntered).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
  });
});
