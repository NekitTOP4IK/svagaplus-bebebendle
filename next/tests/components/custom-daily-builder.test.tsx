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
  search: vi.fn(),
}));

vi.mock("@/app/actions/admin-custom-daily", () => ({
  listAdminCustomDailyEvents: (...args: unknown[]) => actions.list(...args),
  getAdminCustomDailyEvent: (...args: unknown[]) => actions.get(...args),
  createAdminCustomDailyEvent: (...args: unknown[]) => actions.create(...args),
  updateAdminCustomDailyEvent: (...args: unknown[]) => actions.update(...args),
  publishAdminCustomDailyEvent: (...args: unknown[]) => actions.publish(...args),
  cancelAdminCustomDailyEvent: (...args: unknown[]) => actions.cancel(...args),
  searchApprovedCustomDailyScrans: (...args: unknown[]) => actions.search(...args),
}));

import { CustomDailyBuilder } from "@/components/admin/custom-daily-builder";

const bulkScrans = [
  { id: 1, name: "Альфа", imageUrl: null, price: 100 },
  { id: 2, name: "Бета", imageUrl: null, price: 200 },
];

describe("CustomDailyBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.list.mockResolvedValue({ ok: true, data: [] });
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

    fireEvent.click(screen.getByRole("button", { name: "Поменять стороны в раунде 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Убрать Альфа" }));
    expect(screen.queryByText("Альфа")).toBeNull();
    expect(screen.getByText("1/20")).toBeVisible();
  });

  it("searches approved scrans and persists the draft in the visible order", async () => {
    actions.search.mockResolvedValue({
      ok: true,
      data: [{ id: 3, name: "Гамма", imageUrl: "/gamma.webp", price: 300 }],
    });
    render(<CustomDailyBuilder bulkScrans={bulkScrans} bulkRevision={1} />);

    fireEvent.change(screen.getByPlaceholderText("Название или ID"), {
      target: { value: "Гамма" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Найти/ }));
    await waitFor(() => expect(actions.search).toHaveBeenCalledWith("Гамма"));
    fireEvent.click(await screen.findByRole("button", { name: /Гамма/ }));

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
      bulkAssisted: true,
    })));
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
