"use client";

import { useState } from "react";
import Link from "next/link";
import type { Scran } from "@/types/scran";
import { ScranTable } from "@/components/admin/scran-table";
import { Pagination } from "@/components/admin/pagination";
import { DeleteScranModal } from "@/components/admin/delete-scran-modal";

type SortField = "id" | "name" | "price" | "numberOfLikes" | "numberOfDislikes" | "approved";
type SortOrder = "asc" | "desc";
type ViewMode = "list" | "queue";

interface AdminDashboardProps {
  scrans: Scran[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  sortField: SortField;
  sortOrder: SortOrder;
  // Queue view support (Task 5)
  view?: ViewMode;
  subscriberOnly?: boolean;
  subscriberCount?: number;
  regularCount?: number;
  onSort: (field: SortField) => void;
  onPageChange: (page: number) => void;
  onApprove: (id: number) => void;
  onBan: (id: number) => void;
  onDelete: (id: number, comment: string) => Promise<boolean>;
  onSetView?: (mode: ViewMode) => void;
  onSetSubscriberOnly?: (only: boolean) => void;
  onToggleSubscriberOnly?: () => void;
}

function LoadingState() {
  return (
    <div className="pixel-container flex h-64 items-center justify-center rounded-none bg-zinc-900/80">
      <div className="pixel-text text-lg text-white">Loading...</div>
    </div>
  );
}

export function AdminDashboard({
  scrans,
  loading,
  currentPage,
  totalPages,
  sortField,
  sortOrder,
  view = "list",
  subscriberOnly = false,
  subscriberCount,
  regularCount,
  onSort,
  onPageChange,
  onApprove,
  onBan,
  onDelete,
  onSetView,
  onSetSubscriberOnly,
  onToggleSubscriberOnly,
}: AdminDashboardProps) {
  const [deletingScran, setDeletingScran] = useState<Scran | null>(null);

  return (
    <div className="retro-bg min-h-dvh">
      <div className="retro-overlay absolute inset-0" />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="pixel-text text-3xl font-bold text-white">
              Admin Dashboard
            </h1>
            <p className="pixel-text mt-2 text-white">
              Manage scrans and approve submissions
            </p>
          </div>
          <Link
            href="/"
            className="pixel-text text-xl font-bold text-white hover:text-yellow-300"
          >
            бебебендл
          </Link>
        </div>

        {/* Task 5: Hybrid queue controls + counts */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSetView?.("queue")}
              className={`pixel-btn px-3 py-1 text-sm font-bold ${view === "queue" ? "bg-yellow-400 text-black" : "bg-zinc-800 text-white hover:bg-zinc-700"}`}
            >
              Очередь модерации
            </button>
            <button
              onClick={() => onSetView?.("list")}
              className={`pixel-btn px-3 py-1 text-sm font-bold ${view === "list" ? "bg-yellow-400 text-black" : "bg-zinc-800 text-white hover:bg-zinc-700"}`}
            >
              Все записи
            </button>
          </div>

          {view === "queue" && (
            <>
              <div className="pixel-text text-sm text-white/80">
                Subscribers: <span className="font-bold text-white">{subscriberCount ?? "—"}</span> | Regular: <span className="font-bold text-white">{regularCount ?? "—"}</span>
              </div>
              <button
                onClick={() => onToggleSubscriberOnly?.()}
                className={`pixel-btn px-3 py-1 text-sm font-bold ${subscriberOnly ? "bg-green-600 text-white" : "bg-zinc-800 text-white hover:bg-zinc-700"}`}
                title="Фильтр: только с is_subscriber_at_submit"
              >
                {subscriberOnly ? "✓ Только подписчики" : "Только подписчики"}
              </button>
            </>
          )}
        </div>

        {loading ? (
          <LoadingState />
        ) : (
          <>
            <ScranTable
              scrans={scrans}
              sortField={sortField}
              sortOrder={sortOrder}
              view={view}
              onSort={onSort}
              onApprove={onApprove}
              onBan={onBan}
              onDelete={setDeletingScran}
            />
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          </>
        )}
      </div>

      <DeleteScranModal
        key={deletingScran?.id ?? "none"}
        scran={deletingScran}
        onClose={() => setDeletingScran(null)}
        onConfirm={onDelete}
      />
    </div>
  );
}
