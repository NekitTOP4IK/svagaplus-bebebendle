"use client";

import { useState, useCallback, useEffect } from "react";
import type { Scran } from "@/types/scran";
import { getAdminScransAction } from "@/app/actions/admin/queries";

type SortField =
  | "id"
  | "name"
  | "price"
  | "numberOfLikes"
  | "numberOfDislikes"
  | "approved";
type SortOrder = "asc" | "desc";
export type ScranStatusFilter = "all" | "pending" | "approved" | "rejected";

interface UseScransDataParams {
  isAuthenticated: boolean;
  currentPage: number;
  sortField: SortField;
  sortOrder: SortOrder;
  view?:
    | "list"
    | "queue"
    | "users"
    | "rejected"
    | "daily"
    | "soundtrack"
    | "credits"
    | "stats"
    | "audit"
    | "duplicates"
    | "health";
  subscriberOnly?: boolean;
  searchQuery?: string;
  statusFilter?: ScranStatusFilter;
  authorTelegramId?: string;
  onUnauthorized: () => void;
  onTotalItems: (total: number) => void;
}

interface UseScransDataReturn {
  scrans: Scran[];
  loading: boolean;
  refetch: () => void;
  subscriberCount?: number;
  regularCount?: number;
}

const DATA_VIEWS = new Set(["list", "queue", "rejected"]);

export function useScransData({
  isAuthenticated,
  currentPage,
  sortField,
  sortOrder,
  view,
  subscriberOnly,
  searchQuery,
  statusFilter,
  authorTelegramId,
  onUnauthorized,
  onTotalItems,
}: UseScransDataParams): UseScransDataReturn {
  const [scrans, setScrans] = useState<Scran[]>([]);
  const [loading, setLoading] = useState(true);
  const [shouldRefetch, setShouldRefetch] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState<number | undefined>(
    undefined,
  );
  const [regularCount, setRegularCount] = useState<number | undefined>(
    undefined,
  );

  const fetchScrans = useCallback(async () => {
    if (!isAuthenticated || !view || !DATA_VIEWS.has(view)) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: "10",
        sort: sortField,
        order: sortOrder,
        view: view === "rejected" ? "rejected" : view,
      });
      if (subscriberOnly) params.set("subscriber_only", "true");
      if (searchQuery?.trim()) params.set("q", searchQuery.trim());
      if (statusFilter && statusFilter !== "all" && view === "list") {
        params.set("status", statusFilter);
      }
      if (view === "rejected") params.set("status", "rejected");
      if (authorTelegramId?.trim())
        params.set("telegram_id", authorTelegramId.trim());

      const response = await getAdminScransAction(params.toString());
      if (response.success) {
        const data = response.data as {
          scrans: Scran[];
          total: number;
          subscriberCount?: number;
          regularCount?: number;
        };
        setScrans(data.scrans);
        onTotalItems(data.total);
        setSubscriberCount(data.subscriberCount);
        setRegularCount(data.regularCount);
      } else if (response.message === "Unauthorized") {
        onUnauthorized();
      }
    } catch (error) {
      console.error("Error fetching scrans:", error);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    currentPage,
    sortField,
    sortOrder,
    view,
    subscriberOnly,
    searchQuery,
    statusFilter,
    authorTelegramId,
    onUnauthorized,
    onTotalItems,
  ]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchScrans();
    }
  }, [isAuthenticated, fetchScrans, shouldRefetch]);

  const refetch = useCallback(() => {
    setShouldRefetch((prev) => prev + 1);
  }, []);

  return {
    scrans,
    loading,
    refetch,
    subscriberCount,
    regularCount,
  };
}
