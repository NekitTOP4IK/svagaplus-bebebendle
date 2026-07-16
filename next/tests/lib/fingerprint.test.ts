/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFingerprint,
  getFingerprint,
  getFingerprintFromCookie,
} from "../../lib/fingerprint";

function installStorage(): void {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
  });
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    configurable: true,
  });
}

describe("fingerprint", () => {
  beforeEach(() => {
    installStorage();
    document.cookie = "bebendle_fp=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

    const mockContext = {
      textBaseline: "",
      font: "",
      fillStyle: "",
      fillRect: vi.fn(),
      fillText: vi.fn(),
    };

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockContext),
      toDataURL: vi.fn().mockReturnValue("data:image/png;base64,mocked"),
    };

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return mockCanvas as unknown as HTMLElement;
      }
      return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
    });

    Object.defineProperty(globalThis, "crypto", {
      value: {
        subtle: {
          digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
        },
      },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getFingerprint", () => {
    it("should return stored fingerprint from localStorage", async () => {
      localStorage.setItem("bebendle_fp", "stored-fp");
      await expect(getFingerprint()).resolves.toBe("stored-fp");
    });

    it("should return empty string when window is not available", async () => {
      const original = globalThis.window;
      // @ts-expect-error intentional
      delete globalThis.window;
      await expect(getFingerprint()).resolves.toBe("");
      globalThis.window = original;
    });
  });

  describe("getFingerprintFromCookie", () => {
    it("should return empty string when no cookie exists", () => {
      expect(getFingerprintFromCookie()).toBe("");
    });

    it("should return fingerprint from cookie", () => {
      document.cookie = "bebendle_fp=cookie-fp; path=/";
      expect(getFingerprintFromCookie()).toBe("cookie-fp");
    });

    it("should handle multiple cookies and find correct one", () => {
      document.cookie = "other=1; path=/";
      document.cookie = "bebendle_fp=multi-fp; path=/";
      expect(getFingerprintFromCookie()).toBe("multi-fp");
    });
  });

  describe("clearFingerprint", () => {
    it("should remove fingerprint from localStorage", () => {
      localStorage.setItem("bebendle_fp", "to-clear");
      clearFingerprint();
      expect(localStorage.getItem("bebendle_fp")).toBeNull();
    });

    it("should remove fingerprint cookie", () => {
      document.cookie = "bebendle_fp=cookie-to-clear; path=/";
      clearFingerprint();
      expect(document.cookie.includes("bebendle_fp=cookie-to-clear")).toBe(false);
    });
  });
});
