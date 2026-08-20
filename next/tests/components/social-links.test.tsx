// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SocialLinks } from "@/components/social-links";

describe("SocialLinks", () => {
  it("uses a wide credits action followed by square settings and info actions", () => {
    render(<SocialLinks />);

    expect(screen.getByRole("button", { name: "Авторы" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Настройки" })).toHaveClass("h-10", "w-10");
    expect(screen.getByRole("button", { name: "Показать статистику" })).toHaveClass(
      "h-10",
      "w-10",
    );
  });

  it("opens and closes the credits dialog", async () => {
    render(<SocialLinks />);

    fireEvent.click(screen.getByRole("button", { name: "Авторы" }));
    expect(screen.getByRole("dialog", { name: "Авторы" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Авторы" })).toBeNull();
    });
  });
});
