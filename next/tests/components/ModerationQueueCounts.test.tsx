import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModerationQueue } from "@/components/admin/moderation-queue";
import { ModerationReview } from "@/components/admin/moderation-review";
import type { Scran } from "@/types/scran";

const scran = (id: number, name = `Scran ${id}`): Scran => ({
  id,
  imageUrl: "/test.jpg",
  name,
  description: null,
  price: 123,
  numberOfLikes: 0,
  numberOfDislikes: 0,
  approved: false,
  rejected: false,
  telegramId: String(1000 + id),
  isSubscriberAtSubmit: false,
});

describe("moderation queue counters", () => {
  it("shows total queue count instead of current page length in card mode", () => {
    render(
      <ModerationQueue
        scrans={[scran(1), scran(2)]}
        totalCount={23}
        role="moderator"
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onBan={vi.fn()}
        onDelete={vi.fn()}
        onStartReview={vi.fn()}
      />,
    );

    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("shows total queue count in review mode when only one page is loaded", () => {
    render(
      <ModerationReview
        scrans={[scran(1), scran(2)]}
        totalCount={23}
        role="moderator"
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByText("23")).toBeInTheDocument();
  });
});
