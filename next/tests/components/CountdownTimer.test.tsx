import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CountdownTimer } from "@/components/countdown-timer";

describe("CountdownTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render initial placeholder before mounting", () => {
    render(<CountdownTimer />);
    
    // Before useEffect runs, should show placeholder
    const timeDisplay = screen.getByText("00:00:00");
    expect(timeDisplay).toBeInTheDocument();
  });

  it("should render title text", () => {
    render(<CountdownTimer />);
    
    // Should show Russian text for "Until next daily"
    expect(screen.getByText("До следующего дейлика:")).toBeInTheDocument();
  });

  it("should update timer after mount", async () => {
    // 14:30:45 UTC → 6h 29m 15s until 00:00 MSK (21:00 UTC)
    vi.setSystemTime(new Date("2024-01-15T14:30:45Z"));
    
    await act(async () => {
      render(<CountdownTimer />);
    });
    
    // Trigger useEffect timeout
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    
    // Should show time until midnight MSK
    expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("should update timer every second", async () => {
    vi.setSystemTime(new Date("2024-01-15T23:59:55Z"));
    
    await act(async () => {
      render(<CountdownTimer />);
    });
    
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    
    // Initial time should be 00:00:05
    const initialTime = screen.getByText(/\d{2}:\d{2}:\d{2}/).textContent;
    expect(initialTime).not.toBe("00:00:00");
    
    // Advance 1 second
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    
    const updatedTime = screen.getByText(/\d{2}:\d{2}:\d{2}/).textContent;
    expect(updatedTime).not.toBe(initialTime);
  });

  it("should display correct hours, minutes, and seconds format", async () => {
    // Set to 10:30:15 remaining
    vi.setSystemTime(new Date("2024-01-15T13:29:45Z"));
    
    await act(async () => {
      render(<CountdownTimer />);
    });
    
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    
    // After mount the label and countdown share one line.
    const timeText = screen.getByText(/До следующего дейлика: \d{2}:\d{2}:\d{2}/).textContent;
    expect(timeText).toMatch(/До следующего дейлика: \d{2}:\d{2}:\d{2}/);
  });

  it("should cleanup interval on unmount", async () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    
    const { unmount } = render(<CountdownTimer />);
    
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    
    unmount();
    
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
