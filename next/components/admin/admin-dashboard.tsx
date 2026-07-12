"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Scran } from "@/types/scran";
import { ScranTable } from "@/components/admin/scran-table";
import { Pagination } from "@/components/admin/pagination";
import { DeleteScranModal } from "@/components/admin/delete-scran-modal";
import { getUsers, updateUserRole, type AdminUser } from "@/app/admin/actions";

type SortField = "id" | "name" | "price" | "numberOfLikes" | "numberOfDislikes" | "approved";
type SortOrder = "asc" | "desc";
type ViewMode = "list" | "queue" | "users";

interface AdminDashboardProps {
  scrans: Scran[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  sortField: SortField;
  sortOrder: SortOrder;
  // Queue view support (Task 5)
  view?: ViewMode;
  role?: "moderator" | "admin" | null;
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
  role = null,
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

  // Users tab state (Step 4: admin-only minimal users + role management)
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string>("");

  const loadUsers = useCallback(async () => {
    if (role !== "admin") return;
    setUsersLoading(true);
    setUsersError("");
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      setUsersError("Не удалось загрузить пользователей");
    } finally {
      setUsersLoading(false);
    }
  }, [role]);

  const handleRoleChange = useCallback(async (userId: number, newRole: AdminUser["role"]) => {
    setUsersError("");
    const result = await updateUserRole(userId, newRole);
    if (result.success) {
      await loadUsers();
    } else {
      setUsersError(result.message || "Не удалось изменить роль");
    }
  }, [loadUsers]);

  useEffect(() => {
    if (view === "users") {
      loadUsers();
    }
  }, [view, loadUsers]);

  return (
    <div className="retro-bg min-h-dvh">
      <div className="retro-overlay absolute inset-0" />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="pixel-text text-3xl font-bold text-white">
              Admin Dashboard
              {role && (
                <span className="ml-3 text-xs align-middle font-bold px-2 py-0.5 bg-white/20 text-white rounded-none">
                  {role.toUpperCase()}
                </span>
              )}
            </h1>
            <p className="pixel-text mt-2 text-white">
              Manage scrans and approve submissions (role-based access)
            </p>
          </div>
          <Link
            href="/"
            className="pixel-text text-xl font-bold text-white hover:text-yellow-300"
          >
            бебебендл
          </Link>
        </div>

        {/* Task 5: Hybrid queue controls + counts; Task 7: Users tab for admins */}
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
            {role === "admin" && (
              <button
                onClick={() => onSetView?.("users")}
                className={`pixel-btn px-3 py-1 text-sm font-bold ${view === "users" ? "bg-yellow-400 text-black" : "bg-zinc-800 text-white hover:bg-zinc-700"}`}
              >
                Пользователи
              </button>
            )}
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

        {view === "users" ? (
          <div className="pixel-container overflow-hidden rounded-none border-4 border-black bg-zinc-900/80 p-4">
            <h2 className="pixel-text mb-4 text-xl font-bold text-white">Пользователи (admin only)</h2>
            {usersLoading ? (
              <div className="pixel-text text-white">Загрузка пользователей...</div>
            ) : usersError ? (
              <div className="text-sm text-red-400">{usersError}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-left text-xs font-bold uppercase text-white/80">
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2 pr-4">Telegram ID</th>
                    <th className="py-2 pr-4">Username</th>
                    <th className="py-2 pr-4">Display Name</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2">Изменить роль</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700 text-white">
                  {users.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-white/60">Нет пользователей</td></tr>
                  )}
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 pr-4">{u.id}</td>
                      <td className="py-2 pr-4">{u.telegramId}</td>
                      <td className="py-2 pr-4">{u.telegramUsername || "—"}</td>
                      <td className="py-2 pr-4">{u.displayName || "—"}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline px-2 py-0.5 text-xs font-bold ${u.role === "admin" ? "bg-yellow-400 text-black" : u.role === "moderator" ? "bg-blue-400 text-black" : "bg-zinc-600"}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as AdminUser["role"])}
                          className="bg-zinc-800 border border-zinc-600 text-white text-xs px-2 py-1 rounded-none"
                          disabled={u.role === "admin" && users.filter(x => x.role === "admin").length === 1} // minimal guard: don't demote last admin easily
                        >
                          <option value="player">player</option>
                          <option value="moderator">moderator</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-[10px] text-white/50">Только админы могут менять роли. Изменения вступают сразу.</p>
          </div>
        ) : loading ? (
          <LoadingState />
        ) : (
          <>
            <ScranTable
              scrans={scrans}
              sortField={sortField}
              sortOrder={sortOrder}
              view={view}
              role={role}
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
