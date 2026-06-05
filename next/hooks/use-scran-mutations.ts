"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { approveScran as approveScranAction } from "@/app/admin/actions";

interface UseScranMutationsParams {
  adminPassword: string;
  onUnauthorized: () => void;
  onSuccess: () => void;
}

interface UseScranMutationsReturn {
  approveScran: (id: number) => Promise<void>;
  banScran: (id: number) => Promise<void>;
}

export function useScranMutations({
  adminPassword,
  onUnauthorized,
  onSuccess,
}: UseScranMutationsParams): UseScranMutationsReturn {
  const approveScran = useCallback(
    async (id: number) => {
      try {
        const result = await approveScranAction(id);

        if (result.success) {
          toast.success("Блюдо одобрено! Уведомление отправлено автору.", {
            description: `ID: ${id}`,
          });
          onSuccess();
        } else {
          toast.error("Ошибка одобрения", {
            description: result.message,
          });
          console.error("Failed to approve scran:", result.message);
        }
      } catch (error) {
        console.error("Error approving scran:", error);
        toast.error("Ошибка одобрения", {
          description: "Не удалось одобрить блюдо",
        });
      }
    },
    [onSuccess]
  );

  const banScran = useCallback(
    async (id: number) => {
      try {
        const response = await fetch(`/api/admin/scrans/${id}/ban`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminPassword}`,
          },
        });

        if (response.ok) {
          onSuccess();
        } else if (response.status === 401) {
          onUnauthorized();
        }
      } catch (error) {
        console.error("Error banning scran:", error);
      }
    },
    [adminPassword, onUnauthorized, onSuccess]
  );

  return {
    approveScran,
    banScran,
  };
}
