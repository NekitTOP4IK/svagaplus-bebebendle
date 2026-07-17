import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ShareButton } from "@/components/share-button";

describe("ShareButton", () => {
  const mockUserAnswers = [
    { isCorrect: true },
    { isCorrect: false },
    { isCorrect: true },
  ];

  const mockScore = 2;

  beforeEach(() => {
    vi.clearAllTimers();
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("should render share button with copy icon", () => {
    render(<ShareButton userAnswers={mockUserAnswers} score={mockScore} />);
    
    expect(screen.getByText("Поделиться результатом")).toBeInTheDocument();
  });

  it("should copy formatted text to clipboard when clicked", async () => {
    render(<ShareButton userAnswers={mockUserAnswers} score={mockScore} />);
    
    const button = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
      const text = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0] as string;
      // Random emblem pairs are intentional product behavior; lock the score/URL contract.
      // URL follows NEXT_PUBLIC_SITE_URL / APP_URL or window.location.origin
      expect(text).toMatch(/ - 2\/10\nhttps?:\/\/.+$/);
      expect(text.split(" - ")[0].length).toBeGreaterThan(0);
    });
  });

  it("should show copied state after successful copy", async () => {
    render(<ShareButton userAnswers={mockUserAnswers} score={mockScore} />);
    
    const button = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(screen.getByText("Скопировано!")).toBeInTheDocument();
    });
  });

  it("should revert to copy state after timeout", async () => {
    render(<ShareButton userAnswers={mockUserAnswers} score={mockScore} />);
    
    const button = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(button);
    });

    // Wait for copied state
    await waitFor(() => {
      expect(screen.getByText("Скопировано!")).toBeInTheDocument();
    });

    // Wait for the timeout to complete (2 seconds)
    await waitFor(() => {
      expect(screen.getByText("Поделиться результатом")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("should handle clipboard error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("Clipboard error")),
      },
    });

    render(<ShareButton userAnswers={mockUserAnswers} score={mockScore} />);
    
    const button = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith("Failed to copy:", expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it("should include perfect score contract for all-correct answers", async () => {
    const allCorrect = [
      { isCorrect: true },
      { isCorrect: true },
      { isCorrect: true },
    ];

    render(<ShareButton userAnswers={allCorrect} score={3} />);

    const button = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      const text = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0] as string;
      expect(text).toMatch(/ - 3\/10\nhttps?:\/\/.+$/);
    });
  });

  it("should include zero score contract for all-wrong answers", async () => {
    const allWrong = [
      { isCorrect: false },
      { isCorrect: false },
      { isCorrect: false },
    ];

    render(<ShareButton userAnswers={allWrong} score={0} />);

    const button = screen.getByRole("button");
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      const text = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0] as string;
      expect(text).toMatch(/ - 0\/10\nhttps?:\/\/.+$/);
    });
  });
});
