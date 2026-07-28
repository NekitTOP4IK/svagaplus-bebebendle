// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAdminAuditLogs = vi.fn();

vi.mock("@/app/admin/actions", () => ({
  getAdminAuditLogs: (...args: unknown[]) => getAdminAuditLogs(...args),
  getAdminDuplicates: vi.fn(),
  getAdminHealth: vi.fn(),
  getAdminStats: vi.fn(),
}));

import { AuditPanel } from "@/components/admin/ops-panels";
import { Pagination } from "@/components/admin/pagination";

describe("admin pagination", () => {
  beforeEach(() => {
    getAdminAuditLogs.mockReset();
  });

  it("renders a compact page window instead of one button per page", () => {
    render(
      <Pagination currentPage={50} totalPages={100} onPageChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "49" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "50" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "51" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "100" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2" })).not.toBeInTheDocument();
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("loads audit rows page by page", async () => {
    getAdminAuditLogs
      .mockResolvedValueOnce({
        success: true,
        data: { rows: [], total: 51 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { rows: [], total: 51 },
      });

    render(<AuditPanel />);

    await waitFor(() =>
      expect(getAdminAuditLogs).toHaveBeenCalledWith(1, 25),
    );
    fireEvent.click(await screen.findByRole("button", { name: "2" }));
    await waitFor(() =>
      expect(getAdminAuditLogs).toHaveBeenLastCalledWith(2, 25),
    );
  });
});
