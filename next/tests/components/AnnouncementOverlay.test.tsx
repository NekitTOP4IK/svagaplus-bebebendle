// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AnnouncementOverlay } from "@/components/announcements/announcement-overlay";

type Announcement = {
  id: number;
  title: string;
  body: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: number | null;
};

const a = (id: number, createdAt: string): Announcement => ({
  id,
  title: `Title ${id}`,
  body: `Body **${id}**`,
  active: true,
  createdAt: new Date(createdAt),
  updatedAt: new Date(createdAt),
  createdByUserId: null,
});

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
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
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

describe("AnnouncementOverlay", () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders nothing when active list is empty", () => {
    render(<AnnouncementOverlay active={[]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the oldest unseen announcement and marks it seen", () => {
    const older = a(1, "2026-01-01T00:00:00Z");
    const newer = a(2, "2026-02-01T00:00:00Z");
    render(<AnnouncementOverlay active={[older, newer]} />);
    expect(screen.getByText("Title 1")).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem("seenAnnouncementIds") ?? "[]");
    expect(stored).toContain(1);
  });

  it("skips announcements already recorded as seen", () => {
    localStorage.setItem("seenAnnouncementIds", JSON.stringify([1]));
    const older = a(1, "2026-01-01T00:00:00Z");
    const newer = a(2, "2026-02-01T00:00:00Z");
    render(<AnnouncementOverlay active={[older, newer]} />);
    expect(screen.queryByText("Title 1")).not.toBeInTheDocument();
    expect(screen.getByText("Title 2")).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem("seenAnnouncementIds") ?? "[]");
    expect(stored).toContain(2);
    expect(stored).toContain(1);
  });

  it("renders nothing when all active are already seen", () => {
    localStorage.setItem("seenAnnouncementIds", JSON.stringify([1, 2]));
    render(
      <AnnouncementOverlay
        active={[a(1, "2026-01-01T00:00:00Z"), a(2, "2026-02-01T00:00:00Z")]}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("treats corrupt localStorage as empty and shows the oldest", () => {
    localStorage.setItem("seenAnnouncementIds", "{not json}");
    render(<AnnouncementOverlay active={[a(1, "2026-01-01T00:00:00Z")]} />);
    expect(screen.getByText("Title 1")).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem("seenAnnouncementIds") ?? "[]");
    expect(stored).toContain(1);
  });

  it("closes the card when X button is clicked (without altering seen)", async () => {
    render(<AnnouncementOverlay active={[a(1, "2026-01-01T00:00:00Z")]} />);
    const close = screen.getByRole("button", { name: /закрыть|✕|×/i });
    fireEvent.click(close);
    await waitFor(() => {
      expect(screen.queryByText("Title 1")).not.toBeInTheDocument();
    });
    const stored = JSON.parse(localStorage.getItem("seenAnnouncementIds") ?? "[]");
    expect(stored).toContain(1);
  });
});