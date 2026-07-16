import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DailyPlayButton } from "@/components/daily-play-button";
import * as cookiesModule from "@/lib/cookies";

// Mock the cookies module
vi.mock("@/lib/cookies", () => ({
  hasPlayedToday: vi.fn(),
  getTodayResult: vi.fn(),
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render play button when user has not played today", () => {
    mockHasPlayedToday.mockReturnValue(false);

    render(<DailyPlayButton />);

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

    render(<DailyPlayButton />);

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

    render(<DailyPlayButton />);

    // Score is intentionally not shown on the home button (only "Уже сыграно").
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

    render(<DailyPlayButton />);

    expect(screen.getByText("Следующий дейлик завтра")).toBeInTheDocument();
  });

  it("should not show score when result is null", () => {
    mockHasPlayedToday.mockReturnValue(true);
    mockGetTodayResult.mockReturnValue(null);

    render(<DailyPlayButton />);

    expect(screen.queryByText(/Ваш результат/)).not.toBeInTheDocument();
  });

  it("should render link when not played", () => {
    mockHasPlayedToday.mockReturnValue(false);

    render(<DailyPlayButton />);

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

    render(<DailyPlayButton />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveClass("pixel-btn");
    expect(button).toHaveClass("w-full");
  });
});
