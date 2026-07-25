// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const profileActions = vi.hoisted(() => ({
  getProfileViewAction: vi.fn(),
  setCompetitiveDisplayNameAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/actions/profile", () => profileActions);
vi.mock("@/app/actions/auth", () => ({ loginWithTelegram: vi.fn() }));
vi.mock("@/components/profile-svaga-status", () => ({
  ProfileSvagaStatus: () => null,
}));
vi.mock("@/components/home-user-menu", () => ({
  LogoutButton: () => null,
}));

import ProfilePage from "@/app/profile/page";

describe("ProfilePage Telegram ID", () => {
  beforeEach(() => {
    profileActions.getProfileViewAction.mockReset();
    profileActions.getProfileViewAction.mockResolvedValue({
      ok: true,
      data: {
        user: {
          id: 1,
          telegramId: 123456789,
          telegramUsername: "player",
          displayName: "Player",
          role: "player",
          isSubscriber: false,
        },
        scrans: [],
        history: [],
        svagaStatus: null,
      },
    });
  });

  it("hides the Telegram ID until its button is clicked", async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("Мой профиль")).toBeInTheDocument();
    });

    expect(screen.queryByText("ID: 123456789")).not.toBeInTheDocument();

    const idButton = screen.getByRole("button", {
      name: "ID: нажми, чтобы показать",
    });
    fireEvent.click(idButton);
    expect(screen.getByRole("button", { name: "ID: 123456789" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ID: 123456789" }));
    expect(
      screen.getByRole("button", { name: "ID: нажми, чтобы показать" }),
    ).toBeInTheDocument();
  });
});
