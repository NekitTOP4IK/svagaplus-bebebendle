"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { Scran } from "@/types/scran";
import type { ViewMode } from "@/hooks/use-admin";
import type { ScranStatusFilter } from "@/hooks/use-scrans-data";
import type { RejectReasonCode } from "@/lib/reject-reasons";
import { ScranTable } from "@/components/admin/scran-table";
import { ModerationQueue } from "@/components/admin/moderation-queue";
import { ModerationReview } from "@/components/admin/moderation-review";
import { Pagination } from "@/components/admin/pagination";
import { DeleteScranModal } from "@/components/admin/delete-scran-modal";
import { RejectScranModal } from "@/components/admin/reject-scran-modal";
import { BanUserModal } from "@/components/admin/ban-user-modal";
import { AuthorCardModal } from "@/components/admin/author-card-modal";
import { EditScranModal } from "@/components/admin/edit-scran-modal";
import { DailyPanel } from "@/components/admin/daily-panel";
import { SoundtrackPanel } from "@/components/admin/soundtrack-panel";
import { CreditsPanel } from "@/components/admin/credits-panel";
import {
  StatsPanel,
  AuditPanel,
  DuplicatesPanel,
  HealthPanel,
} from "@/components/admin/ops-panels";
import { getUsersPage, type AdminUser } from "@/app/admin/actions";
import { UserEditorModal } from "@/components/admin/user-editor-modal";
import type { BanReasonCode } from "@/lib/ban-reasons";
import { addCompetitivePoolEntry } from "@/app/admin/competitive-actions";
import { toast } from "sonner";

type SortField = "id" | "name" | "price" | "numberOfLikes" | "numberOfDislikes" | "approved";
type SortOrder = "asc" | "desc";
type QueueMode = "cards" | "review";

interface AdminDashboardProps {
  scrans: Scran[];
  loading: boolean;
  currentPage: number;
  totalItems: number;
  totalPages: number;
  sortField: SortField;
  sortOrder: SortOrder;
  view?: ViewMode;
  role?: "moderator" | "admin" | null;
  subscriberOnly?: boolean;
  subscriberCount?: number;
  regularCount?: number;
  searchQuery?: string;
  statusFilter?: ScranStatusFilter;
  authorTelegramId?: string;
  onSort: (field: SortField) => void;
  onPageChange: (page: number) => void;
  onApprove: (id: number) => void | Promise<void>;
  onReject: (id: number, reason?: RejectReasonCode, note?: string) => void | Promise<void>;
  onBan: (id: number) => void | Promise<void>;
  onBanUser: (
    telegramId: string,
    reasonCode: BanReasonCode,
    customNote?: string,
  ) => Promise<boolean>;
  onDelete: (id: number, comment: string) => Promise<boolean>;
  onRecheckSubscriber?: (scranId?: number) => void | Promise<void>;
  onBulk?: (
    action: "approve" | "reject",
    ids: number[],
    reason?: RejectReasonCode,
    note?: string,
  ) => void | Promise<void>;
  onEdit?: (
    id: number,
    patch: { name: string; description: string; price: number },
  ) => Promise<boolean>;
  onRestore?: (id: number) => void | Promise<void>;
  onSetView?: (mode: ViewMode) => void;
  onSetSubscriberOnly?: (only: boolean) => void;
  onToggleSubscriberOnly?: () => void;
  onSearchChange?: (q: string) => void;
  onStatusFilterChange?: (s: ScranStatusFilter) => void;
  onAuthorFilterChange?: (id: string) => void;
  onLogout?: () => void;
}

function LoadingState() {
  return (
    <div className="pixel-container flex h-64 items-center justify-center rounded-none bg-zinc-900/80">
      <div className="pixel-text text-lg text-white">Loading...</div>
    </div>
  );
}

const MOD_TABS: { id: ViewMode; label: string; adminOnly?: boolean }[] = [
  { id: "queue", label: "Очередь" },
  { id: "list", label: "Все записи" },
  { id: "rejected", label: "Отклонённые" },
  { id: "daily", label: "Daily" },
  { id: "soundtrack", label: "Музыка", adminOnly: true },
  { id: "credits", label: "Авторы", adminOnly: true },
  { id: "stats", label: "Статистика" },
  { id: "duplicates", label: "Дубликаты" },
  { id: "users", label: "Пользователи", adminOnly: true },
  { id: "audit", label: "Audit", adminOnly: true },
  { id: "health", label: "Health", adminOnly: true },
];

export function AdminDashboard({
  scrans,
  loading,
  currentPage,
  totalItems,
  totalPages,
  sortField,
  sortOrder,
  view = "list",
  role = null,
  subscriberOnly = false,
  subscriberCount,
  regularCount,
  searchQuery = "",
  statusFilter = "all",
  authorTelegramId = "",
  onSort,
  onPageChange,
  onApprove,
  onReject,
  onBan,
  onBanUser,
  onDelete,
  onRecheckSubscriber,
  onBulk,
  onEdit,
  onRestore,
  onSetView,
  onToggleSubscriberOnly,
  onSearchChange,
  onStatusFilterChange,
  onAuthorFilterChange,
  onLogout,
}: AdminDashboardProps) {
  const [deletingScran, setDeletingScran] = useState<Scran | null>(null);
  const [rejectingScran, setRejectingScran] = useState<Scran | null>(null);
  const [editingScran, setEditingScran] = useState<Scran | null>(null);
  const [authorTg, setAuthorTg] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<{
    telegramId: string;
    displayName: string | null;
  } | null>(null);
  const [queueMode, setQueueMode] = useState<QueueMode>("cards");
  const [actionBusy, setActionBusy] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [competitiveBusyId, setCompetitiveBusyId] = useState<number | null>(
    null,
  );
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const handleAddToCompetitive = useCallback(async (id: number) => {
    setCompetitiveBusyId(id);
    try {
      const result = await addCompetitivePoolEntry(id);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(`#${id} добавлен в competitive pool`);
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setCompetitiveBusyId(null);
    }
  }, []);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [userSearchInput, setUserSearchInput] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const visibleTabs = useMemo(
    () => MOD_TABS.filter((t) => !t.adminOnly || role === "admin"),
    [role],
  );

  const handleSetView = useCallback(
    (mode: ViewMode) => {
      setQueueMode("cards");
      setSelected(new Set());
      onSetView?.(mode);
    },
    [onSetView],
  );

  const handleApprove = useCallback(
    async (id: number) => {
      setActionBusy(true);
      try {
        await onApprove(id);
      } finally {
        setActionBusy(false);
      }
    },
    [onApprove],
  );

  const openReject = useCallback((id: number) => {
    const scran = scrans.find((s) => s.id === id) ?? null;
    setRejectingScran(scran);
  }, [scrans]);

  const confirmReject = useCallback(
    async (reason: RejectReasonCode, note: string) => {
      if (!rejectingScran) return;
      setActionBusy(true);
      try {
        await onReject(rejectingScran.id, reason, note);
        setRejectingScran(null);
      } finally {
        setActionBusy(false);
      }
    },
    [onReject, rejectingScran],
  );

  const handleRecheck = useCallback(
    async (scranId?: number) => {
      if (!onRecheckSubscriber) return;
      setActionBusy(true);
      try {
        await onRecheckSubscriber(scranId);
      } finally {
        setActionBusy(false);
      }
    },
    [onRecheckSubscriber],
  );

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    setSelected(new Set(scrans.map((s) => s.id)));
  }, [scrans]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const runBulk = useCallback(
    async (action: "approve" | "reject") => {
      if (!onBulk || selected.size === 0) return;
      setActionBusy(true);
      try {
        await onBulk(action, [...selected], action === "reject" ? "other" : undefined);
        setSelected(new Set());
      } finally {
        setActionBusy(false);
      }
    },
    [onBulk, selected],
  );

  const uncheckedCount = scrans.filter((s) => s.isSubscriberAtSubmit === null).length;

  const loadUsers = useCallback(async () => {
    if (role !== "admin") return;
    setUsersLoading(true);
    setUsersError("");
    try {
      const result = await getUsersPage(userSearch, userPage, 25);
      if (!result.success) {
        setUsersError(result.message);
        return;
      }
      setUsers(result.data.rows);
      setUserTotal(result.data.total);
    } catch {
      setUsersError("Не удалось загрузить пользователей");
    } finally {
      setUsersLoading(false);
    }
  }, [role, userPage, userSearch]);

  useEffect(() => {
    if (view === "users") loadUsers();
  }, [view, loadUsers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setUserSearch(userSearchInput);
      setUserPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearchInput]);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Debounce search commit
  useEffect(() => {
    const t = setTimeout(() => {
      if (localSearch !== searchQuery) onSearchChange?.(localSearch);
    }, 300);
    return () => clearTimeout(t);
  }, [localSearch, searchQuery, onSearchChange]);

  const showScranToolbar = view === "queue" || view === "list" || view === "rejected";

  return (
    <div className="retro-bg relative min-h-dvh">
      <div className="retro-overlay pointer-events-none fixed inset-0" />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="pixel-text text-3xl font-bold text-white">
              {role === "moderator" ? "Модерация" : "Админ-панель"}
              {role && (
                <span className="ml-3 align-middle bg-white/20 px-2 py-0.5 text-xs font-bold text-white">
                  {role.toUpperCase()}
                </span>
              )}
            </h1>
            <p className="pixel-text mt-2 text-white/80">
              {role === "moderator"
                ? "Очередь, daily и отклонения"
                : "Модерация, daily, audit и health"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {role === "admin" && (
              <>
                <Link
                  href="/admin/competitive"
                  className="pixel-btn pixel-btn-info px-3 py-2 text-xs font-bold"
                  title="Competitive: флаг, сезоны, пул, daily"
                >
                  Competitive
                </Link>
                <Link
                  href="/admin/announcements"
                  className="pixel-btn pixel-btn-info px-3 py-2 text-xs font-bold"
                  title="Управление объявлениями на главной"
                >
                  Объявления
                </Link>
              </>
            )}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="pixel-btn px-3 py-2 text-xs font-bold"
              >
                Выйти
              </button>
            )}
            <Link
              href="/"
              className="pixel-text text-xl font-bold text-whitetext-yellow-300"
            >
              бебебендл
            </Link>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSetView(tab.id)}
              className={`pixel-btn px-3 py-1.5 text-sm font-bold ${
                view === tab.id
                  ? "pixel-btn-warn"
                  : ""
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {showScranToolbar && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Поиск: имя, tg id…"
              className="pixel-input min-w-[12rem] flex-1 sm:max-w-xs"
            />
            {view === "list" && (
              <select
                value={statusFilter}
                onChange={(e) => onStatusFilterChange?.(e.target.value as ScranStatusFilter)}
                className="pixel-select w-auto min-w-[10rem]"
              >
                <option value="all">Все статусы</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            )}
            {authorTelegramId && (
              <button
                type="button"
                onClick={() => onAuthorFilterChange?.("")}
                className="pixel-btn pixel-btn-info px-3 py-1.5 text-xs font-bold"
              >
                Автор: {authorTelegramId} ✕
              </button>
            )}
            {view === "queue" && queueMode === "cards" && (
              <>
                <div className="text-sm text-white/80">
                  SVAGA+: <span className="font-bold text-white">{subscriberCount ?? "—"}</span>
                  {" · "}
                  Обычные: <span className="font-bold text-white">{regularCount ?? "—"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleSubscriberOnly?.()}
                  className={`pixel-btn px-3 py-1 text-sm font-bold ${
                    subscriberOnly ? "pixel-btn-ok" : ""
                  }`}
                >
                  {subscriberOnly ? "✓ Только подписчики" : "Только подписчики"}
                </button>
                {uncheckedCount > 0 && onRecheckSubscriber && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleRecheck()}
                    className="pixel-btn pixel-btn-info px-3 py-1 text-sm font-bold"
                  >
                    Перепроверить SVAGA ({uncheckedCount})
                  </button>
                )}
              </>
            )}
            {(view === "queue" || view === "list") && selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-white/60">Выбрано: {selected.size}</span>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void runBulk("approve")}
                  className="pixel-btn pixel-btn-ok px-2 py-1 text-xs font-bold"
                >
                  Bulk ✓
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void runBulk("reject")}
                  className="pixel-btn pixel-btn-danger px-2 py-1 text-xs font-bold"
                >
                  Bulk ✕
                </button>
                <button type="button" onClick={clearSelection} className="pixel-link-btn">
                  сброс
                </button>
              </div>
            )}
            {(view === "queue" || view === "list") && scrans.length > 0 && (
              <button type="button" onClick={selectAllOnPage} className="pixel-link-btn">
                выбрать страницу
              </button>
            )}
          </div>
        )}

        {view === "daily" ? (
          <DailyPanel role={role} />
        ) : view === "soundtrack" ? (
          <div className="pixel-container border-4 border-black bg-zinc-900/80 p-4">
            <SoundtrackPanel />
          </div>
        ) : view === "credits" ? (
          <div className="pixel-container border-4 border-black bg-zinc-900/80 p-4">
            <CreditsPanel />
          </div>
        ) : view === "stats" ? (
          <div className="pixel-container border-4 border-black bg-zinc-900/80 p-4">
            <h2 className="pixel-text mb-4 text-xl font-bold text-white">Статистика</h2>
            <StatsPanel />
          </div>
        ) : view === "audit" ? (
          <div className="pixel-container border-4 border-black bg-zinc-900/80 p-4">
            <h2 className="pixel-text mb-4 text-xl font-bold text-white">Audit log</h2>
            <AuditPanel />
          </div>
        ) : view === "duplicates" ? (
          <div className="pixel-container border-4 border-black bg-zinc-900/80 p-4">
            <h2 className="pixel-text mb-4 text-xl font-bold text-white">Дубликаты имён</h2>
            <DuplicatesPanel />
          </div>
        ) : view === "health" ? (
          <div className="pixel-container border-4 border-black bg-zinc-900/80 p-4">
            <h2 className="pixel-text mb-4 text-xl font-bold text-white">Health</h2>
            <HealthPanel />
          </div>
        ) : view === "users" ? (
          <div className="pixel-container overflow-hidden border-4 border-black bg-zinc-900/80 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="pixel-text text-xl font-bold text-white">Пользователи</h2>
              <input type="search" value={userSearchInput} onChange={(event) => setUserSearchInput(event.target.value)} placeholder="Имя, username или Telegram ID" className="pixel-input w-full max-w-sm" />
            </div>
            {usersLoading ? (
              <div className="pixel-text text-white">Загрузка пользователей...</div>
            ) : usersError ? (
              <div className="text-sm text-red-400">{usersError}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700 text-left text-xs font-bold uppercase text-white/80">
                      <th className="py-2 pr-4">ID</th>
                      <th className="py-2 pr-4">Telegram ID</th>
                      <th className="py-2 pr-4">Username</th>
                      <th className="py-2 pr-4">Display Name</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2 pr-4">SVAGA+</th>
                      <th className="py-2 pr-4">Создан</th>
                      <th className="py-2 pr-4">Обновлён</th>
                      <th className="py-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700 text-white">
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-4 text-white/60">
                          Нет пользователей
                        </td>
                      </tr>
                    )}
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="py-2 pr-4">{u.id}</td>
                        <td className="py-2 pr-4">{u.telegramId}</td>
                        <td className="py-2 pr-4">{u.telegramUsername || "—"}</td>
                        <td className="py-2 pr-4">{u.displayName || "—"}</td>
                        <td className="py-2 pr-4">
                          <span
                            className={`inline px-2 py-0.5 text-xs font-bold ${
                              u.role === "admin"
                                ? "bg-yellow-400 text-black"
                                : u.role === "moderator"
                                  ? "bg-blue-400 text-black"
                                  : u.role === "streamer"
                                    ? "bg-purple-400 text-black"
                                  : "bg-zinc-600 text-white"
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-2 pr-4">{u.isSubscriber === null ? "—" : u.isSubscriber ? "Да" : "Нет"}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{u.createdAt?.toLocaleString() ?? "—"}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{u.updatedAt?.toLocaleString() ?? "—"}</td>
                        <td className="py-2">
                          <button type="button" onClick={() => setEditingUser(u)} className="pixel-btn px-3 py-1 text-xs">Открыть</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {userTotal > 25 && (
              <div className="mt-4 flex items-center justify-between gap-3 text-sm text-white">
                <span>Страница {userPage} из {Math.ceil(userTotal / 25)} · всего {userTotal}</span>
                <div className="flex gap-2"><button type="button" className="pixel-btn px-3 py-1" disabled={userPage === 1} onClick={() => setUserPage((page) => page - 1)}>Назад</button><button type="button" className="pixel-btn px-3 py-1" disabled={userPage >= Math.ceil(userTotal / 25)} onClick={() => setUserPage((page) => page + 1)}>Дальше</button></div>
              </div>
            )}
            {editingUser && <UserEditorModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={() => { setEditingUser(null); void loadUsers(); }} />}
          </div>
        ) : loading ? (
          <LoadingState />
        ) : view === "queue" && queueMode === "review" ? (
          <ModerationReview
            scrans={scrans}
            totalCount={totalItems}
            role={role}
            busy={actionBusy}
            onApprove={handleApprove}
            onReject={(id) => openReject(id)}
            onBanUser={(telegramId, displayName) =>
              setBanTarget({ telegramId, displayName: displayName ?? null })
            }
            onExit={() => setQueueMode("cards")}
            hasMorePages={currentPage < totalPages}
            onNeedMore={() => onPageChange(currentPage + 1)}
          />
        ) : view === "queue" ? (
          <>
            <ModerationQueue
              scrans={scrans}
              totalCount={totalItems}
              role={role}
              selectedIds={selected}
              onToggleSelect={toggleSelect}
              onApprove={(id) => void handleApprove(id)}
              onReject={(id) => openReject(id)}
              onBan={onBan}
              onDelete={setDeletingScran}
              onRecheck={(id) => void handleRecheck(id)}
              onAuthor={(tg) => tg && setAuthorTg(tg)}
              onStartReview={() => setQueueMode("review")}
            />
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          </>
        ) : (
          <>
            <ScranTable
              scrans={scrans}
              sortField={sortField}
              sortOrder={sortOrder}
              view={view === "rejected" ? "list" : view}
              role={role}
              selectedIds={selected}
              onToggleSelect={toggleSelect}
              onSort={onSort}
              onApprove={(id) => void handleApprove(id)}
              onReject={(id) => openReject(id)}
              onBan={onBan}
              onDelete={setDeletingScran}
              onAuthor={(tg) => tg && setAuthorTg(tg)}
              onEdit={role === "admin" ? setEditingScran : undefined}
              onRestore={
                view === "rejected" && onRestore
                  ? (id) => void onRestore(id)
                  : undefined
              }
              onAddToCompetitive={
                role === "admin"
                  ? (id) => void handleAddToCompetitive(id)
                  : undefined
              }
              competitiveBusyId={competitiveBusyId}
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

      <RejectScranModal
        open={!!rejectingScran}
        scranName={rejectingScran?.name ?? ""}
        busy={actionBusy}
        onClose={() => setRejectingScran(null)}
        onConfirm={confirmReject}
      />

      <AuthorCardModal
        telegramId={authorTg}
        onClose={() => setAuthorTg(null)}
        onFilterAuthor={(id) => {
          onAuthorFilterChange?.(id);
          handleSetView("list");
        }}
        onBanUser={(telegramId, displayName) => {
          setAuthorTg(null);
          setBanTarget({ telegramId, displayName: displayName ?? null });
        }}
      />

      <BanUserModal
        open={!!banTarget}
        busy={actionBusy}
        telegramId={banTarget?.telegramId ?? ""}
        displayName={banTarget?.displayName}
        onClose={() => setBanTarget(null)}
        onConfirm={async ({ reasonCode, customNote }) => {
          if (!banTarget) return;
          setActionBusy(true);
          try {
            const ok = await onBanUser(
              banTarget.telegramId,
              reasonCode,
              customNote,
            );
            if (ok) setBanTarget(null);
          } finally {
            setActionBusy(false);
          }
        }}
      />

      {editingScran && onEdit && (
        <EditScranModal
          key={editingScran.id}
          scran={editingScran}
          busy={actionBusy}
          onClose={() => setEditingScran(null)}
          onSave={async (patch) => {
            setActionBusy(true);
            try {
              const ok = await onEdit(editingScran.id, patch);
              if (ok) setEditingScran(null);
            } finally {
              setActionBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
