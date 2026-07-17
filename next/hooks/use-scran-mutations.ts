"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";

interface UseScranMutationsParams {
  onUnauthorized: () => void;
  onSuccess: () => void;
}

interface UseScranMutationsReturn {
  approveScran: (id: number) => Promise<void>;
  rejectScran: (id: number) => Promise<void>;
  banScran: (id: number) => Promise<void>;
  deleteScran: (id: number, comment: string) => Promise<boolean>;
}

export function useScranMutations({
  onUnauthorized,
  onSuccess,
}: UseScranMutationsParams): UseScranMutationsReturn {
  const approveScran = useCallback(
    async (id: number) => {
      try {
        const response = await apiFetch(`/api/admin/scrans/${id}/approve`, {
          method: "POST",
        });

        if (response.ok) {
          toast.success("Блюдо одобрено! Уведомление отправлено автору.", {
            description: `ID: ${id}`,
          });
          onSuccess();
        } else if (response.status === 401) {
          onUnauthorized();
        } else {
          const data = await response.json().catch(() => ({}));
          toast.error("Ошибка одобрения", {
            description: (data as { error?: string }).error ?? "Не удалось одобрить блюдо",
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
    async (id: number) => {
      try {
        const response = await apiFetch(`/api/admin/scrans/${id}/reject`, {
          method: "POST",
        });

        if (response.ok) {
          toast.success("Блюдо отклонено", { description: `ID: ${id}` });
          onSuccess();
        } else if (response.status === 401) {
          onUnauthorized();
        } else {
          const data = await response.json().catch(() => ({}));
          toast.error("Ошибка отклонения", {
            description: (data as { error?: string }).error ?? "Не удалось отклонить",
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
        const response = await apiFetch(`/api/admin/scrans/${id}/ban`, {
          method: "POST",
        });

        if (response.ok) {
          toast.success("Публикация снята", { description: `ID: ${id}` });
          onSuccess();
        } else if (response.status === 401) {
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

  const deleteScran = useCallback(
    async (id: number, comment: string): Promise<boolean> => {
      try {
        const response = await apiFetch(`/api/admin/scrans/${id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment }),
        });

        if (response.ok) {
          toast.success("Блюдо удалено! Уведомление отправлено автору.", {
            description: `ID: ${id}`,
          });
          onSuccess();
          return true;
        }

        if (response.status === 401) {
          onUnauthorized();
          return false;
        }

        const data = await response.json().catch(() => ({}));
        toast.error("Ошибка удаления", {
          description: (data as { error?: string }).error ?? "Не удалось удалить блюдо",
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

  return {
    approveScran,
    rejectScran,
    banScran,
    deleteScran,
  };
}
