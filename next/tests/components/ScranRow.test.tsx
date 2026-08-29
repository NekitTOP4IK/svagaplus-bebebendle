import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScranRow } from "@/components/admin/scran-row";
import type { Scran } from "@/types/scran";

const baseScran: Scran = {
  id: 42,
  imageUrl: "/test.jpg",
  name: "Test Scran",
  description: "desc",
  price: 123.45,
  numberOfLikes: 5,
  numberOfDislikes: 3,
  approved: false,
  isSubscriberAtSubmit: false,
  telegramId: "123",
};

describe("ScranRow permissions (Moderator vs Admin)", () => {
  const onApprove = vi.fn();
  const onReject = vi.fn();
  const onBan = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows approve/reject for pending moderator, no ban/delete", () => {
    render(
      <table>
        <tbody>
          <ScranRow
            scran={baseScran}
            role="moderator"
            onApprove={onApprove}
            onReject={onReject}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByText("Одобрить")).toBeInTheDocument();
    expect(screen.getByText("Отклонить")).toBeInTheDocument();
    expect(screen.queryByText("Снять")).not.toBeInTheDocument();
    expect(screen.queryByText("Удалить")).not.toBeInTheDocument();
  });

  it("shows unpublish and delete in the admin actions menu for approved items", () => {
    const approvedScran = { ...baseScran, approved: true };
    render(
      <table>
        <tbody>
          <ScranRow
            scran={approvedScran}
            role="admin"
            onApprove={onApprove}
            onReject={onReject}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Действия для Test Scran" }));
    expect(screen.getByText("Снять с публикации")).toBeInTheDocument();
    expect(screen.getByText("Удалить")).toBeInTheDocument();
    expect(screen.queryByText("Одобрить")).not.toBeInTheDocument();
  });

  it("hides ban for moderator on approved items", () => {
    const approvedScran = { ...baseScran, approved: true };
    render(
      <table>
        <tbody>
          <ScranRow
            scran={approvedScran}
            role="moderator"
            onApprove={onApprove}
            onReject={onReject}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>,
    );
    expect(screen.queryByText("Снять")).not.toBeInTheDocument();
    expect(screen.queryByText("Удалить")).not.toBeInTheDocument();
  });

  it("shows Delete only inside the admin actions menu", () => {
    render(
      <table>
        <tbody>
          <ScranRow
            scran={baseScran}
            role="admin"
            onApprove={onApprove}
            onReject={onReject}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>,
    );
    expect(screen.queryByText("Удалить")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Действия для Test Scran" }));
    expect(screen.getByText("Удалить")).toBeInTheDocument();
    expect(screen.getByText("Одобрить")).toBeInTheDocument();
  });

  it("shows SVAGA+ badge for subscriber scrans", () => {
    const subScran = { ...baseScran, isSubscriberAtSubmit: true };
    render(
      <table>
        <tbody>
          <ScranRow
            scran={subScran}
            role="moderator"
            onApprove={onApprove}
            onReject={onReject}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByText("SVAGA+")).toBeInTheDocument();
  });

  it("shows Не проверено badge for null subscriber snapshot", () => {
    const unknownScran = { ...baseScran, isSubscriberAtSubmit: null };
    render(
      <table>
        <tbody>
          <ScranRow
            scran={unknownScran}
            role="moderator"
            onApprove={onApprove}
            onReject={onReject}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>,
    );
    expect(screen.getByText("Не проверено")).toBeInTheDocument();
    expect(screen.queryByText("SVAGA+")).not.toBeInTheDocument();
  });
});
