// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
  cancel: vi.fn(),
  browse: vi.fn(),
}));

vi.mock("@/app/actions/admin-custom-daily", () => ({
  listAdminCustomDailyEvents: (...args: unknown[]) => actions.list(...args),
  getAdminCustomDailyEvent: (...args: unknown[]) => actions.get(...args),
  createAdminCustomDailyEvent: (...args: unknown[]) => actions.create(...args),
  updateAdminCustomDailyEvent: (...args: unknown[]) => actions.update(...args),
  publishAdminCustomDailyEvent: (...args: unknown[]) => actions.publish(...args),
  cancelAdminCustomDailyEvent: (...args: unknown[]) => actions.cancel(...args),
  browseApprovedCustomDailyScrans: (...args: unknown[]) => actions.browse(...args),
}));

import {
  CustomDailyBuilder,
  moveCustomDailyEntry,
} from "@/components/admin/custom-daily-builder";

const bulkScrans = [
  { id: 1, name: "Альфа", imageUrl: null, price: 100 },
  { id: 2, name: "Бета", imageUrl: null, price: 200 },
];

describe("CustomDailyBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.list.mockResolvedValue({ ok: true, data: [] });
    actions.browse.mockResolvedValue({
      ok: true,
      data: { items: [], page: 1, pageSize: 12, total: 0, totalPages: 1 },
    });
    actions.create.mockResolvedValue({
      ok: true,
      data: {
        id: 7,
        name: "Тестовое событие",
        targetDate: "2026-08-30",
        status: "draft",
        notifyAuthors: false,
        entryCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: null,
        createdByUserId: 1,
        entries: [],
      },
    });
  });

  it("adds a bulk selection to a new draft and exposes ten ordered pairs", async () => {
    render(<CustomDailyBuilder bulkScrans={bulkScrans} bulkRevision={1} />);

    expect(await screen.findByText("Альфа")).toBeVisible();
    expect(screen.getByText("Бета")).toBeVisible();
    expect(screen.getByText("2/20")).toBeVisible();
    expect(screen.getAllByText(/Раунд \d+/)).toHaveLength(10);

    fireEvent.click(screen.getByRole("button", { name: "Убрать Альфа" }));
    expect(screen.queryByText("Альфа")).toBeNull();
    expect(screen.getByText("1/20")).toBeVisible();
  });

  it("browses approved scrans without a required search and persists a catalog choice", async () => {
    actions.browse.mockResolvedValue({
      ok: true,
      data: {
        items: [{ id: 3, name: "Гамма", imageUrl: "/gamma.webp", price: 300 }],
        page: 1,
        pageSize: 12,
        total: 1,
        totalPages: 1,
      },
    });
    render(<CustomDailyBuilder bulkScrans={bulkScrans} bulkRevision={1} />);

    await waitFor(() => expect(actions.browse).toHaveBeenCalledWith({
      query: "",
      page: 1,
      sort: "newest",
    }));
    fireEvent.click(await screen.findByRole("button", { name: /Гамма/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Текст под кнопкой/ }));
    fireEvent.click(screen.getByText("Радуга"));

    fireEvent.change(screen.getByPlaceholderText("Например: Битва бургеров"), {
      target: { value: "Тестовое событие" },
    });
    fireEvent.change(screen.getByLabelText("Дата (МСК)"), {
      target: { value: "2026-08-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить черновик/ }));

    await waitFor(() => expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "Тестовое событие",
      targetDate: "2026-08-30",
      scranIds: [1, 2, 3],
      showEventBadge: true,
      showOnHome: true,
      badgeStyle: "rainbow",
      bulkAssisted: true,
    })));
  });

  it("reorders dishes across rounds with pointer drag before save", async () => {
    const fourScrans = [
      ...bulkScrans,
      { id: 3, name: "Гамма", imageUrl: null, price: 300 },
      { id: 4, name: "Дельта", imageUrl: null, price: 400 },
    ];
    render(<CustomDailyBuilder bulkScrans={fourScrans} bulkRevision={1} />);
    const target = document.querySelector<HTMLElement>('[data-daily-slot-index="2"]');
    expect(target).not.toBeNull();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => target),
    });
    const handle = screen.getByRole("button", { name: "Перетащить Альфа" });

    fireEvent.pointerDown(handle, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(handle, { pointerId: 1, pointerType: "mouse", clientX: 40, clientY: 40 });
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: "mouse", clientX: 40, clientY: 40 });
    Reflect.deleteProperty(document, "elementFromPoint");

    fireEvent.change(screen.getByPlaceholderText("Например: Битва бургеров"), {
      target: { value: "Перетаскивание" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить черновик/ }));
    await waitFor(() => expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({
      scranIds: [2, 3, 1, 4],
    })));
  });

  it("does not reorder when a pointer is released outside the round grid", async () => {
    render(<CustomDailyBuilder bulkScrans={bulkScrans} bulkRevision={1} />);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => null),
    });
    const handle = screen.getByRole("button", { name: "Перетащить Альфа" });

    fireEvent.pointerDown(handle, { pointerId: 2, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 2, pointerType: "mouse", clientX: 140, clientY: 140 });
    fireEvent.pointerUp(handle, { pointerId: 2, pointerType: "mouse", clientX: 140, clientY: 140 });
    Reflect.deleteProperty(document, "elementFromPoint");

    fireEvent.change(screen.getByPlaceholderText("Например: Битва бургеров"), {
      target: { value: "Без ложного drop" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Сохранить черновик/ }));
    await waitFor(() => expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({
      scranIds: [1, 2],
    })));
  });

  it("keeps keyboard focus on the moved dish", async () => {
    const fourScrans = [
      ...bulkScrans,
      { id: 3, name: "Гамма", imageUrl: null, price: 300 },
      { id: 4, name: "Дельта", imageUrl: null, price: 400 },
    ];
    render(<CustomDailyBuilder bulkScrans={fourScrans} bulkRevision={1} />);
    const handle = await screen.findByRole("button", { name: "Перетащить Альфа" });

    handle.focus();
    fireEvent.keyDown(handle, { key: "Enter" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    fireEvent.keyDown(handle, { key: "Enter" });

    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Перетащить Альфа" }),
    ));
  });

  it("loads the remembered draft before appending a bulk selection", async () => {
    actions.get.mockResolvedValue({
      ok: true,
      data: {
        id: 9,
        name: "Открытый черновик",
        targetDate: "2026-09-01",
        status: "draft",
        notifyAuthors: false,
        entryCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: null,
        createdByUserId: 1,
        entries: [{
          id: 8,
          position: 1,
          name: "Уже сохранено",
          imageUrl: "/saved.webp",
          price: 80,
        }],
      },
    });

    render(
      <CustomDailyBuilder
        initialEventId={9}
        bulkScrans={bulkScrans}
        bulkRevision={2}
      />,
    );

    await waitFor(() => expect(actions.get).toHaveBeenCalledWith(9));
    expect(await screen.findByText("Уже сохранено")).toBeVisible();
    expect(await screen.findByText("Альфа")).toBeVisible();
    expect(screen.getByText("Бета")).toBeVisible();
    expect(screen.getByText("3/20")).toBeVisible();
  });

  it("keeps a bulk selection pending until a read-only event is replaced by a draft", async () => {
    actions.list.mockResolvedValue({
      ok: true,
      data: [{
        id: 9,
        name: "Доступный черновик",
        targetDate: "2026-09-02",
        status: "draft",
        notifyAuthors: false,
        entryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: null,
      }],
    });
    actions.get.mockImplementation(async (id: number) => ({
      ok: true,
      data: {
        id,
        name: id === 10 ? "Опубликованное событие" : "Доступный черновик",
        targetDate: "2026-09-02",
        status: id === 10 ? "published" : "draft",
        notifyAuthors: false,
        entryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: id === 10 ? new Date() : null,
        createdByUserId: 1,
        entries: [],
      },
    }));

    render(
      <CustomDailyBuilder
        initialEventId={10}
        bulkScrans={bulkScrans}
        bulkRevision={3}
      />,
    );

    expect(await screen.findByDisplayValue("Опубликованное событие")).toBeVisible();
    expect(screen.queryByText("Альфа")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /Доступный черновик/ }));
    expect(await screen.findByText("Альфа")).toBeVisible();
    expect(screen.getByText("2/20")).toBeVisible();
  });
});

describe("moveCustomDailyEntry", () => {
  it("moves forward, backward, across pairs, and clamps trailing targets", () => {
    expect(moveCustomDailyEntry([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveCustomDailyEntry([1, 2, 3, 4], 3, 1)).toEqual([1, 4, 2, 3]);
    expect(moveCustomDailyEntry([1, 2, 3, 4], 1, 99)).toEqual([1, 3, 4, 2]);
    expect(moveCustomDailyEntry([1, 2], 0, 0)).toEqual([1, 2]);
  });
});
