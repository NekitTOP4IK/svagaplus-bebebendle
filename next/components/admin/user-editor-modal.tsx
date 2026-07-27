"use client";

import { useEffect, useState } from "react";
import {
  getUserDiagnostics,
  updateUser,
  type AdminUser,
  type AdminUserDiagnostics,
  type UserPatch,
} from "@/app/admin/actions";

type Props = Readonly<{
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}>;

function toLocalDateTime(value: Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string): Date | null {
  return value ? new Date(value) : null;
}

export function UserEditorModal({ user, onClose, onSaved }: Props): React.JSX.Element {
  const [diagnostics, setDiagnostics] = useState<AdminUserDiagnostics | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [telegramUsername, setTelegramUsername] = useState(user.telegramUsername ?? "");
  const [role, setRole] = useState<AdminUser["role"]>(user.role);
  const [subscriber, setSubscriber] = useState<"unknown" | "yes" | "no">("unknown");
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [lastSyncAttemptAt, setLastSyncAttemptAt] = useState("");
  const [lastSyncError, setLastSyncError] = useState("");

  useEffect(() => {
    let active = true;
    void getUserDiagnostics(user.id).then((result) => {
      if (!active) return;
      if (!result.success) {
        setError(result.message);
        return;
      }
      setDiagnostics(result.data);
      setDisplayName(result.data.displayName ?? "");
      setTelegramUsername(result.data.telegramUsername ?? "");
      setRole(result.data.role);
      setSubscriber(result.data.isSubscriber === null ? "unknown" : result.data.isSubscriber ? "yes" : "no");
      setLastSyncedAt(toLocalDateTime(result.data.lastSyncedAt));
      setLastSyncAttemptAt(toLocalDateTime(result.data.lastSyncAttemptAt));
      setLastSyncError(result.data.lastSyncError ?? "");
    });
    return () => { active = false; };
  }, [user.id]);

  async function save(): Promise<void> {
    setSaving(true);
    setError("");
    const patch: UserPatch = {
      displayName: displayName || null,
      telegramUsername: telegramUsername || null,
      role,
      isSubscriber: subscriber === "unknown" ? null : subscriber === "yes",
      lastSyncedAt: fromLocalDateTime(lastSyncedAt),
      lastSyncAttemptAt: fromLocalDateTime(lastSyncAttemptAt),
      lastSyncError: lastSyncError || null,
    };
    const result = await updateUser(user.id, patch);
    setSaving(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Редактор пользователя">
      <div className="pixel-container max-h-[90vh] w-full max-w-2xl overflow-y-auto border-4 border-black bg-zinc-900 p-5 text-white">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div><h2 className="pixel-text text-xl font-bold">Пользователь #{user.id}</h2><p className="text-sm text-white/65">Telegram ID: {user.telegramId}</p></div>
          <button type="button" onClick={onClose} className="pixel-btn px-3 py-1 text-sm">Закрыть</button>
        </div>
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        {!diagnostics ? <p className="text-sm text-white/70">Загрузка диагностики...</p> : <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="pixel-input mt-1 w-full" maxLength={100} /></label>
            <label className="text-sm">Telegram username<input value={telegramUsername} onChange={(event) => setTelegramUsername(event.target.value)} className="pixel-input mt-1 w-full" placeholder="без @" maxLength={32} /></label>
            <label className="text-sm">Role<select value={role} onChange={(event) => setRole(event.target.value as AdminUser["role"])} className="pixel-select mt-1 w-full"><option value="player">player</option><option value="streamer">streamer</option><option value="moderator">moderator</option><option value="admin">admin</option></select></label>
            <label className="text-sm">Subscriber cache<select value={subscriber} onChange={(event) => setSubscriber(event.target.value as "unknown" | "yes" | "no")} className="pixel-select mt-1 w-full"><option value="unknown">unknown</option><option value="yes">yes</option><option value="no">no</option></select></label>
            <label className="text-sm">Last synced at<input type="datetime-local" value={lastSyncedAt} onChange={(event) => setLastSyncedAt(event.target.value)} className="pixel-input mt-1 w-full" /></label>
            <label className="text-sm">Last sync attempt<input type="datetime-local" value={lastSyncAttemptAt} onChange={(event) => setLastSyncAttemptAt(event.target.value)} className="pixel-input mt-1 w-full" /></label>
          </div>
          <label className="mt-3 block text-sm">Last sync error<textarea value={lastSyncError} onChange={(event) => setLastSyncError(event.target.value)} className="pixel-input mt-1 min-h-20 w-full" maxLength={1000} /></label>
          <section className="mt-5 border-t border-zinc-700 pt-4 text-sm text-white/75">
            <h3 className="mb-2 font-bold text-white">Только чтение</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Diag label="Local ID" value={diagnostics.id} />
              <Diag label="Telegram ID" value={diagnostics.telegramId} />
              <Diag label="Telegram photo" value={diagnostics.telegramPhotoUrl} />
              <Diag label="SVAGA Telegram ID" value={diagnostics.svagaTelegramUserId} />
              <Diag label="SVAGA user ID" value={diagnostics.svagaUserId} />
              <Diag label="SVAGA linked" value={diagnostics.linkedAt?.toLocaleString()} />
              <Diag label="Created" value={diagnostics.createdAt?.toLocaleString()} />
              <Diag label="Updated" value={diagnostics.updatedAt?.toLocaleString()} />
              <Diag label="Sessions" value={diagnostics.sessionCount} />
              <Diag label="Casual" value={diagnostics.casualResultCount} />
              <Diag label="Competitive" value={diagnostics.competitiveResultCount} />
              <Diag label="Freeze season" value={diagnostics.competitiveStreakFreezeSeasonId} />
              <Diag label="Freeze used" value={diagnostics.competitiveStreakFreezeUsedAt?.toLocaleString()} />
              <Diag label="Freeze gap" value={diagnostics.competitiveStreakFreezeDate} />
            </div>
          </section>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="pixel-btn px-4 py-2">Отмена</button><button type="button" onClick={() => void save()} disabled={saving} className="pixel-btn pixel-btn-warn px-4 py-2">{saving ? "Сохранение..." : "Сохранить"}</button></div>
        </>}
      </div>
    </div>
  );
}

/**
 * One read-only diagnostic field. `min-w-0` lets the grid track shrink below
 * its content and `break-all` breaks unspaced values — without both, a Telegram
 * photo URL is a single unbreakable token that widens the track and pushes the
 * panel past the modal.
 */
function Diag({
  label,
  value,
}: Readonly<{ label: string; value: string | number | null | undefined }>) {
  return (
    <span className="min-w-0 break-all">
      {label}: {value ?? "—"}
    </span>
  );
}
