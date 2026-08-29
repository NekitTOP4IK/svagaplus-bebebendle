"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import {
  approveScranAction,
  banUserAction,
  bulkModerationAction,
  deleteScranAction,
  editScranAction,
  recheckScranSubscriberAction,
  rejectScranAction,
  restoreScranAction,
  unpublishScranAction,
} from "@/app/actions/admin/moderation";
import type { RejectReasonCode } from "@/lib/reject-reasons";
import type { BanReasonCode } from "@/lib/ban-reasons";
import { grantAdminDailyReentry } from "@/app/actions/admin-daily";

interface UseScranMutationsParams {
  onUnauthorized: () => void;
  onSuccess: () => void;
}

interface UseScranMutationsReturn {
  approveScran: (id: number) => Promise<void>;
  rejectScran: (
    id: number,
    reason?: RejectReasonCode,
    note?: string,
  ) => Promise<void>;
  banScran: (id: number) => Promise<void>;
  banUser: (
    telegramId: string,
    reasonCode: BanReasonCode,
    customNote?: string,
  ) => Promise<boolean>;
  deleteScran: (id: number, comment: string) => Promise<boolean>;
  recheckSubscriber: (scranId?: number) => Promise<void>;
  bulkAction: (
    action: "approve" | "reject",
    ids: number[],
    reason?: RejectReasonCode,
    note?: string,
  ) => Promise<void>;
  editScran: (
    id: number,
    patch: { name: string; description: string; price: number },
  ) => Promise<boolean>;
  restoreScran: (id: number) => Promise<void>;
  grantDailyReentry: (ids: number[]) => Promise<boolean>;
}

export function useScranMutations({
  onUnauthorized,
  onSuccess,
}: UseScranMutationsParams): UseScranMutationsReturn {
  const approveScran = useCallback(
    async (id: number) => {
      try {
        const result = await approveScranAction(id);
        if (result.ok) {
          toast.success("Блюдо одобрено! Уведомление отправлено автору.", {
            description: `ID: ${id}`,
          });
          onSuccess();
        } else if (result.code === "unauthorized") {
          onUnauthorized();
        } else {
          toast.error("Ошибка одобрения", {
            description: result.message,
          });
        }
      } catch (error) {
        console.error("Error approving scran:", error);
        toast.error("Ошибка одобрения", {
          description: "Не удалось одобрить блюдо",
        });
      }
    },
    [onSuccess, onUnauthorized],
  );

  const rejectScran = useCallback(
    async (id: number, reason: RejectReasonCode = "other", note = "") => {
      try {
        const result = await rejectScranAction({ id, reason, note });
        if (result.ok) {
          toast.success("Блюдо отклонено", {
            description: `ID: ${id} · ${reason}`,
          });
          onSuccess();
        } else if (result.code === "unauthorized") {
          onUnauthorized();
        } else {
          toast.error("Ошибка отклонения", {
            description: result.message,
          });
        }
      } catch (error) {
        console.error("Error rejecting scran:", error);
        toast.error("Ошибка отклонения");
      }
    },
    [onSuccess, onUnauthorized],
  );

  const banScran = useCallback(
    async (id: number) => {
      try {
        const result = await unpublishScranAction(id);
        if (result.ok) {
          toast.success("Публикация снята", { description: `ID: ${id}` });
          onSuccess();
        } else if (result.code === "unauthorized") {
          onUnauthorized();
        } else {
          toast.error("Только админ может снимать с публикации");
        }
      } catch (error) {
        console.error("Error banning scran:", error);
      }
    },
    [onUnauthorized, onSuccess],
  );

  const banUser = useCallback(
    async (
      telegramId: string,
      reasonCode: BanReasonCode,
      customNote = "",
    ): Promise<boolean> => {
      try {
        const result = await banUserAction({
          telegramId,
          reasonCode,
          customNote,
        });
        if (result.ok) {
          const data = result.data;
          if (data.alreadyBanned) {
            toast.message("Уже в бане", { description: `tg:${telegramId}` });
          } else {
            toast.success("Пользователь забанен", {
              description: `tg:${telegramId} · pending → reject: ${data.rejectedPending ?? 0}`,
            });
          }
          onSuccess();
          return true;
        }
        if (result.code === "unauthorized") {
          onUnauthorized();
          return false;
        }
        toast.error(result.message);
        return false;
      } catch (error) {
        console.error("Error banning user:", error);
        toast.error("Ошибка сети при бане");
        return false;
      }
    },
    [onUnauthorized, onSuccess],
  );

  const recheckSubscriber = useCallback(
    async (scranId?: number) => {
      try {
        const response = await recheckScranSubscriberAction(
          scranId != null ? { scranId } : { allUnchecked: true },
        );
        if (response.ok) {
          const data = response.data;
          if (data.mode === "bulk") {
            toast.success(
              `SVAGA recheck: ${data.ok ?? 0}/${data.total ?? 0} ok` +
                (data.failed ? `, failed ${data.failed}` : ""),
            );
          } else if (data.result?.ok) {
            toast.success(
              data.result.isSubscriber
                ? "SVAGA+: подписчик"
                : "SVAGA+: не подписчик",
            );
          } else {
            toast.error("SVAGA recheck не удался", {
              description: data.result?.reason ?? "unknown",
            });
          }
          onSuccess();
        } else if (response.code === "unauthorized") {
          onUnauthorized();
        } else {
          toast.error("Ошибка recheck SVAGA");
        }
      } catch (error) {
        console.error("Error rechecking subscriber:", error);
        toast.error("Ошибка recheck SVAGA");
      }
    },
    [onSuccess, onUnauthorized],
  );

  const deleteScran = useCallback(
    async (id: number, comment: string): Promise<boolean> => {
      try {
        const response = await deleteScranAction({ id, comment });
        if (response.ok) {
          toast.success("Блюдо удалено! Уведомление отправлено автору.", {
            description: `ID: ${id}`,
          });
          onSuccess();
          return true;
        }

        if (response.code === "unauthorized") {
          onUnauthorized();
          return false;
        }

        toast.error("Ошибка удаления", {
          description: response.message,
        });
        return false;
      } catch (error) {
        console.error("Error deleting scran:", error);
        toast.error("Ошибка удаления", {
          description: "Не удалось удалить блюдо",
        });
        return false;
      }
    },
    [onSuccess, onUnauthorized],
  );

  const bulkAction = useCallback(
    async (
      action: "approve" | "reject",
      ids: number[],
      reason?: RejectReasonCode,
      note?: string,
    ) => {
      if (ids.length === 0) return;
      try {
        const response = await bulkModerationAction({
          action,
          ids,
          reason,
          note,
        });
        if (response.ok) {
          toast.success(
            action === "approve"
              ? `Одобрено: ${response.data.ok}`
              : `Отклонено: ${response.data.ok}`,
          );
          onSuccess();
        } else if (response.code === "unauthorized") {
          onUnauthorized();
        } else {
          toast.error("Массовое действие не удалось");
        }
      } catch (error) {
        console.error("bulk error", error);
        toast.error("Ошибка bulk");
      }
    },
    [onSuccess, onUnauthorized],
  );

  const editScran = useCallback(
    async (
      id: number,
      patch: { name: string; description: string; price: number },
    ): Promise<boolean> => {
      try {
        const response = await editScranAction({ id, ...patch });
        if (response.ok) {
          toast.success("Сохранено");
          onSuccess();
          return true;
        }
        if (response.code === "unauthorized") onUnauthorized();
        else toast.error("Не удалось сохранить");
        return false;
      } catch {
        toast.error("Ошибка сохранения");
        return false;
      }
    },
    [onSuccess, onUnauthorized],
  );

  const restoreScran = useCallback(
    async (id: number) => {
      try {
        const response = await restoreScranAction(id);
        if (response.ok) {
          toast.success("Возвращено в очередь");
          onSuccess();
        } else if (response.code === "unauthorized") {
          onUnauthorized();
        } else {
          toast.error("Не удалось восстановить");
        }
      } catch {
        toast.error("Ошибка restore");
      }
    },
    [onSuccess, onUnauthorized],
  );

  const grantDailyReentry = useCallback(
    async (ids: number[]): Promise<boolean> => {
      if (ids.length === 0) return false;
      try {
        const response = await grantAdminDailyReentry({ ids });
        if (response.ok) {
          const { grantedIds, skippedIds } = response.data;
          if (grantedIds.length > 0) {
            toast.success(
              grantedIds.length === 1
                ? `Блюдо #${grantedIds[0]} снова допущено в Daily`
                : `Повторный допуск: ${grantedIds.length}`,
              skippedIds.length > 0
                ? { description: `Пропущено: ${skippedIds.length}` }
                : undefined,
            );
          } else {
            toast.error("Нет подходящих блюд", {
              description: "Нужны одобренные блюда, уже участвовавшие в Daily",
            });
          }
          onSuccess();
          return grantedIds.length > 0;
        }
        if (response.code === "unauthorized") onUnauthorized();
        else toast.error(response.message);
      } catch (error) {
        console.error("daily reentry error", error);
        toast.error("Не удалось выдать повторный допуск");
      }
      return false;
    },
    [onSuccess, onUnauthorized],
  );

  return {
    approveScran,
    rejectScran,
    banScran,
    banUser,
    deleteScran,
    recheckSubscriber,
    bulkAction,
    editScran,
    restoreScran,
    grantDailyReentry,
  };
}
