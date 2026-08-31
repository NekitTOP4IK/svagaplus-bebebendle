// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scran } from "@/types/scran";

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/admin/scran-table", () => ({
  ScranTable: ({ scrans, onToggleSelect }: {
    scrans: Scran[];
    onToggleSelect: (id: number) => void;
  }) => <div>{scrans.map((scran) => <button key={scran.id} onClick={() => onToggleSelect(scran.id)}>выбрать #{scran.id}</button>)}</div>,
}));
vi.mock("@/components/admin/pagination", () => ({ Pagination: () => null }));
vi.mock("@/components/admin/daily-panel", () => ({ DailyPanel: () => null }));
vi.mock("@/components/admin/soundtrack-panel", () => ({ SoundtrackPanel: () => null }));
vi.mock("@/components/admin/credits-panel", () => ({ CreditsPanel: () => null }));
vi.mock("@/components/admin/moderation-queue", () => ({ ModerationQueue: () => null }));
vi.mock("@/components/admin/moderation-review", () => ({ ModerationReview: () => null }));
vi.mock("@/components/admin/ops-panels", () => ({
  StatsPanel: () => null,
  AuditPanel: () => null,
  DuplicatesPanel: () => null,
  HealthPanel: () => null,
}));
vi.mock("@/components/admin/delete-scran-modal", () => ({ DeleteScranModal: () => null }));
vi.mock("@/components/admin/reject-scran-modal", () => ({ RejectScranModal: () => null }));
vi.mock("@/components/admin/ban-user-modal", () => ({ BanUserModal: () => null }));
vi.mock("@/components/admin/author-card-modal", () => ({ AuthorCardModal: () => null }));
vi.mock("@/components/admin/edit-scran-modal", () => ({ EditScranModal: () => null }));
vi.mock("@/components/admin/user-editor-modal", () => ({ UserEditorModal: () => null }));
vi.mock("@/app/admin/actions", () => ({ getUsersPage: vi.fn() }));

import { AdminDashboard } from "@/components/admin/admin-dashboard";

function scran(id: number, approved: boolean, rejected = false): Scran {
  return {
    id,
    name: `Блюдо ${id}`,
    imageUrl: `/scran-${id}.webp`,
    description: null,
    price: id * 10,
    numberOfLikes: 1,
    numberOfDislikes: 0,
    approved,
    rejected,
  };
}

const callbacks = {
  onSort: vi.fn(),
  onPageChange: vi.fn(),
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onBan: vi.fn(),
  onBanUser: vi.fn(async () => true),
  onDelete: vi.fn(async () => true),
};

describe("admin custom Daily bulk action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports rejected and no-longer-loaded selected IDs instead of dropping them silently", () => {
    const props = {
      ...callbacks,
      loading: false,
      currentPage: 1,
      totalItems: 3,
      totalPages: 2,
      sortField: "id" as const,
      sortOrder: "asc" as const,
      view: "list" as const,
      role: "admin" as const,
    };
    const view = render(<AdminDashboard {...props} scrans={[scran(99, true)]} />);
    fireEvent.click(screen.getByRole("button", { name: "выбрать #99" }));

    view.rerender(
      <AdminDashboard {...props} scrans={[scran(1, true), scran(2, false, true)]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "выбрать #1" }));
    fireEvent.click(screen.getByRole("button", { name: "выбрать #2" }));
    fireEvent.click(screen.getByRole("button", { name: "В событие" }));

    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("не одобрены: #2"));
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("не загружены на этой странице: #99"));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
