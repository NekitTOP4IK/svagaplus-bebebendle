"use client";

import type { Scran } from "@/types/scran";
import { ScranRow } from "@/components/admin/scran-row";

type SortField = "id" | "name" | "price" | "numberOfLikes" | "numberOfDislikes" | "approved";
type SortOrder = "asc" | "desc";
type ViewMode = "list" | "queue" | "users";

interface ScranTableProps {
  scrans: Scran[];
  sortField: SortField;
  sortOrder: SortOrder;
  view?: ViewMode;
  role?: "moderator" | "admin" | null;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onSort: (field: SortField) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onBan: (id: number) => void;
  onDelete: (scran: Scran) => void;
  onAuthor?: (telegramId: string | null | undefined) => void;
  onEdit?: (scran: Scran) => void;
  onRestore?: (id: number) => void;
  onAddToCompetitive?: (id: number) => void;
  competitiveBusyId?: number | null;
}

function SortableHeader({
  field,
  label,
  currentField,
  currentOrder,
  onSort,
}: {
  field: SortField;
  label: string;
  currentField: SortField;
  currentOrder: SortOrder;
  onSort: (field: SortField) => void;
}) {
  const icon = currentField !== field ? "↕️" : currentOrder === "asc" ? "↑" : "↓";

  return (
    <th
      className="cursor-pointer px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-white hover:bg-zinc-700"
      onClick={() => onSort(field)}
    >
      {label} {icon}
    </th>
  );
}

export function ScranTable({
  scrans,
  sortField,
  sortOrder,
  view,
  role,
  selectedIds,
  onToggleSelect,
  onSort,
  onApprove,
  onReject,
  onBan,
  onDelete,
  onAuthor,
  onEdit,
  onRestore,
  onAddToCompetitive,
  competitiveBusyId,
}: ScranTableProps) {
  const isQueue = view === "queue";
  return (
    <div className="pixel-container overflow-x-auto border-4 border-black bg-zinc-900/80">
      <table className="w-full min-w-[720px]">
        <thead className="bg-zinc-800">
          <tr>
            {onToggleSelect && (
              <th className="px-2 py-3 text-xs font-bold text-white">✓</th>
            )}
            <SortableHeader
              field="id"
              label="ID"
              currentField={sortField}
              currentOrder={sortOrder}
              onSort={onSort}
            />
            <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">
              Image
            </th>
            <SortableHeader
              field="name"
              label="Name"
              currentField={sortField}
              currentOrder={sortOrder}
              onSort={onSort}
            />
            {isQueue ? (
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">
                Автор
              </th>
            ) : (
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">
                Автор
              </th>
            )}
            <SortableHeader
              field="price"
              label="Price"
              currentField={sortField}
              currentOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              field="numberOfLikes"
              label="Likes"
              currentField={sortField}
              currentOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              field="numberOfDislikes"
              label="Dislikes"
              currentField={sortField}
              currentOrder={sortOrder}
              onSort={onSort}
            />
            <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">
              Rating
            </th>
            <SortableHeader
              field="approved"
              label="Status"
              currentField={sortField}
              currentOrder={sortOrder}
              onSort={onSort}
            />
            <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-white">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-700">
          {scrans.map((scran) => (
            <ScranRow
              key={scran.id}
              scran={scran}
              view={view}
              role={role}
              selected={selectedIds?.has(scran.id)}
              onToggleSelect={onToggleSelect}
              onApprove={onApprove}
              onReject={onReject}
              onBan={onBan}
              onDelete={onDelete}
              onAuthor={onAuthor}
              onEdit={onEdit}
              onRestore={onRestore}
              onAddToCompetitive={onAddToCompetitive}
              competitiveBusy={competitiveBusyId === scran.id}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
