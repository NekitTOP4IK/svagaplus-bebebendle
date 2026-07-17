import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DailyPlayButton } from "@/components/daily-play-button";
import * as cookiesModule from "@/lib/cookies";

vi.mock("@/lib/cookies", () => ({
  hasPlayedToday: vi.fn(),
  getTodayResult: vi.fn(), // still mocked — module may export it for other callers
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href} className="next-link-mock">{children}</a>
  ),
}));

describe("DailyPlayButton", () => {
  const mockHasPlayedToday = cookiesModule.hasPlayedToday as ReturnType<typeof vi.fn>;
  const mockGetTodayResult = cookiesModule.getTodayResult as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPlayedToday.mockReturnValue(false);
    mockGetTodayResult.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render play button when user has not played today", () => {
    render(<DailyPlayButton available />);

    expect(screen.getByText("Дейлик!")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/daily");
  });

  it("should render disabled button when user has played today", () => {
    mockHasPlayedToday.mockReturnValue(true);
    mockGetTodayResult.mockReturnValue({
      date: "2024-01-15",
      score: 7,
      totalRounds: 10,
      userAnswers: [],
    });

    render(<DailyPlayButton available />);

    expect(screen.getByText("Уже сыграно")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("should not display score on the home CTA when user has played today", () => {
    mockHasPlayedToday.mockReturnValue(true);
    mockGetTodayResult.mockReturnValue({
      date: "2024-01-15",
      score: 8,
      totalRounds: 10,
      userAnswers: Array.from({ length: 8 }, () => ({ isCorrect: true })),
    });

    render(<DailyPlayButton available />);

    expect(screen.queryByText(/Ваш результат/)).not.toBeInTheDocument();
    expect(screen.getByText("Уже сыграно")).toBeInTheDocument();
  });

  it("should show next daily message when played today", () => {
    mockHasPlayedToday.mockReturnValue(true);
    mockGetTodayResult.mockReturnValue({
      date: "2024-01-15",
      score: 5,
      totalRounds: 10,
      userAnswers: [],
    });

    render(<DailyPlayButton available />);

    expect(screen.getByText("Следующий дейлик завтра")).toBeInTheDocument();
  });

  it("should not show score when result is null", () => {
    mockHasPlayedToday.mockReturnValue(true);
    mockGetTodayResult.mockReturnValue(null);

    render(<DailyPlayButton available />);

    expect(screen.queryByText(/Ваш результат/)).not.toBeInTheDocument();
  });

  it("should render link when not played", () => {
    render(<DailyPlayButton available />);

    const link = screen.getByRole("link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent("Дейлик!");
  });

  it("should apply disabled styling when played", () => {
    mockHasPlayedToday.mockReturnValue(true);
    mockGetTodayResult.mockReturnValue({
      date: "2024-01-15",
      score: 6,
      totalRounds: 10,
      userAnswers: [],
    });

    render(<DailyPlayButton available />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveClass("pixel-btn");
    expect(button).toHaveClass("w-full");
  });

  it("disables CTA when no daily exists for today", () => {
    render(<DailyPlayButton available={false} />);

    const button = screen.getByRole("button", { name: "Дейлика на сегодня нет" });
    expect(button).toBeDisabled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/Набор ещё не готов/)).toBeInTheDocument();
  });

  it("shows custom unavailable reason when provided", () => {
    render(
      <DailyPlayButton available={false} unavailableReason="Техработы до вечера" />,
    );
    expect(screen.getByText("Техработы до вечера")).toBeInTheDocument();
  });

  it("prefers unavailable state over play link even if not played", () => {
    mockHasPlayedToday.mockReturnValue(false);
    render(<DailyPlayButton available={false} />);
    expect(screen.getByText("Дейлика на сегодня нет")).toBeInTheDocument();
    expect(screen.queryByText("Дейлик!")).not.toBeInTheDocument();
  });
});
