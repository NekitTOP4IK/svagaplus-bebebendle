"use client";

import type { Scran } from "@/types/scran";
import { ScranRow } from "@/components/admin/scran-row";

type SortField = "id" | "name" | "price" | "numberOfLikes" | "numberOfDislikes" | "approved";
type SortOrder = "asc" | "desc";
type ViewMode = "list" | "queue";

interface ScranTableProps {
  scrans: Scran[];
  sortField: SortField;
  sortOrder: SortOrder;
  view?: ViewMode;
  onSort: (field: SortField) => void;
  onApprove: (id: number) => void;
  onBan: (id: number) => void;
  onDelete: (scran: Scran) => void;
}

function SortableHeader({ 
  field, 
  label, 
  currentField, 
  currentOrder, 
  onSort 
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
  onSort,
  onApprove,
  onBan,
  onDelete,
}: ScranTableProps) {
  const isQueue = view === "queue";
  return (
    <div className="pixel-container overflow-hidden rounded-none border-4 border-black bg-zinc-900/80">
      <table className="w-full">
        <thead className="bg-zinc-800">
          <tr>
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
            {isQueue && (
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
              onApprove={onApprove}
              onBan={onBan}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
