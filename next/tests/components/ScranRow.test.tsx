import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  const onBan = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Approve for pending for both moderator and admin", () => {
    render(
      <table>
        <tbody>
          <ScranRow
            scran={baseScran}
            role="moderator"
            onApprove={onApprove}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>
    );
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.queryByText("Ban")).not.toBeInTheDocument();
    expect(screen.queryByText("Удалить")).not.toBeInTheDocument();
  });

  it("shows Ban for approved, available to moderator (not delete)", () => {
    const approvedScran = { ...baseScran, approved: true };
    render(
      <table>
        <tbody>
          <ScranRow
            scran={approvedScran}
            role="moderator"
            onApprove={onApprove}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>
    );
    expect(screen.getByText("Ban")).toBeInTheDocument();
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByText("Удалить")).not.toBeInTheDocument();
  });

  it("shows Delete button ONLY for admin role", () => {
    render(
      <table>
        <tbody>
          <ScranRow
            scran={baseScran}
            role="admin"
            onApprove={onApprove}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>
    );
    expect(screen.getByText("Удалить")).toBeInTheDocument();
    // still shows approve for pending
    expect(screen.getByText("Approve")).toBeInTheDocument();
  });

  it("hides Delete button for moderator role", () => {
    render(
      <table>
        <tbody>
          <ScranRow
            scran={baseScran}
            role="moderator"
            onApprove={onApprove}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>
    );
    expect(screen.queryByText("Удалить")).not.toBeInTheDocument();
  });

  it("hides Delete when role is null/player (no role prop or insufficient)", () => {
    render(
      <table>
        <tbody>
          <ScranRow
            scran={baseScran}
            role={null}
            onApprove={onApprove}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>
    );
    expect(screen.queryByText("Удалить")).not.toBeInTheDocument();
  });

  it("shows SVAGA+ badge for subscriber scrans regardless of role", () => {
    const subScran = { ...baseScran, isSubscriberAtSubmit: true };
    render(
      <table>
        <tbody>
          <ScranRow
            scran={subScran}
            role="moderator"
            onApprove={onApprove}
            onBan={onBan}
            onDelete={onDelete}
          />
        </tbody>
      </table>
    );
    expect(screen.getByText("SVAGA+")).toBeInTheDocument();
  });
});
