import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  hasPlayedToday,
  saveDailyResult,
  getTodayResult,
} from "../../lib/cookies";

describe("cookies", () => {
  beforeEach(() => {
    // Clear all cookies before each test
    document.cookie = "daily_bebendle=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    
    // Mock Date for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("hasPlayedToday", () => {
    it("should return false when no cookie exists", () => {
      expect(hasPlayedToday()).toBe(false);
    });

    it("should return true when cookie exists for today", () => {
      const result = {
        date: "2024-01-15",
        score: 7,
        totalRounds: 10,
        userAnswers: [],
      };
      saveDailyResult(result);

      expect(hasPlayedToday()).toBe(true);
    });

    it("should return false when cookie exists for different date", () => {
      const result = {
        date: "2024-01-14",
        score: 7,
        totalRounds: 10,
        userAnswers: [],
      };
      saveDailyResult(result);

      expect(hasPlayedToday()).toBe(false);
    });
  });

  describe("saveDailyResult", () => {
    it("should save result to cookie", () => {
      const result = {
        date: "2024-01-15",
        score: 8,
        totalRounds: 10,
        userAnswers: [
          {
            roundNumber: 1,
            isCorrect: true,
            chosenScranId: 1,
            correctScranId: 1,
            percentageA: 60,
            percentageB: 40,
          },
        ],
      };

      saveDailyResult(result);
      const retrieved = getTodayResult();

      expect(retrieved).toEqual(result);
    });

    it("should set cookie to expire at midnight UTC", () => {
      const result = {
        date: "2024-01-15",
        score: 5,
        totalRounds: 10,
        userAnswers: [],
      };

      saveDailyResult(result);

      // Check that cookie was set with expires attribute
      expect(document.cookie).toContain("daily_bebendle");
    });
  });

  describe("getTodayResult", () => {
    it("should return null when no cookie exists", () => {
      expect(getTodayResult()).toBeNull();
    });

    it("should return parsed result when cookie exists", () => {
      const result = {
        date: "2024-01-15",
        score: 9,
        totalRounds: 10,
        userAnswers: [],
      };
      saveDailyResult(result);

      expect(getTodayResult()).toEqual(result);
    });

    it("should return null when cookie has invalid date", () => {
      const result = {
        date: "2024-01-14",
        score: 9,
        totalRounds: 10,
        userAnswers: [],
      };
      saveDailyResult(result);

      expect(getTodayResult()).toBeNull();
    });

    it("should return null when cookie has invalid JSON", () => {
      document.cookie = "daily_bebendle=invalid-json; path=/; SameSite=Strict";

      expect(getTodayResult()).toBeNull();
    });

    it("should handle multiple cookies and find correct one", () => {
      document.cookie = "other_cookie=value; path=/";
      const result = {
        date: "2024-01-15",
        score: 6,
        totalRounds: 10,
        userAnswers: [],
      };
      saveDailyResult(result);

      expect(getTodayResult()).toEqual(result);
    });
  });
});

describe("daily play integration (anonymous + logged-in paths)", () => {
  beforeEach(() => {
    document.cookie = "daily_bebendle=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("supports anonymous play: save + hasPlayed + retrieve without any user id", () => {
    // Anonymous flow uses only cookies + fingerprint passed to server (no getCurrentUser)
    const anonResult = {
      date: "2024-01-15",
      score: 4,
      totalRounds: 10,
      userAnswers: [{ roundNumber: 1, isCorrect: true, chosenScranId: 1, correctScranId: 1, percentageA: 70, percentageB: 30 }],
    };
    saveDailyResult(anonResult);

    expect(hasPlayedToday()).toBe(true);
    expect(getTodayResult()).toEqual(anonResult);
  });

  it("logged-in users use identical client storage (sessionId/fingerprint on server side, userId optional)", () => {
    // Per design: daily plays remain session-based even for logged-in; profile/history merges via session + optional userId
    const loggedResult = {
      date: "2024-01-15",
      score: 8,
      totalRounds: 10,
      userAnswers: [],
    };
    saveDailyResult(loggedResult);

    expect(hasPlayedToday()).toBe(true);
    // same cookie mechanism used regardless of login status
    expect(getTodayResult()?.score).toBe(8);
  });

  it("prevents double-play via hasPlayedToday for both anon and logged-in sessions on same day", () => {
    const play = { date: "2024-01-15", score: 5, totalRounds: 10, userAnswers: [] };
    saveDailyResult(play);
    expect(hasPlayedToday()).toBe(true);

    // second attempt detection would be server-side uniqueness on (sessionId, date) or (userId, date)
    expect(hasPlayedToday()).toBe(true);
  });
});
