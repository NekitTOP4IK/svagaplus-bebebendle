"use client";

import { useState, useCallback, useEffect } from "react";
import type { Scran } from "@/types/scran";

type SortField = "id" | "name" | "price" | "numberOfLikes" | "numberOfDislikes" | "approved";
type SortOrder = "asc" | "desc";

interface UseScransDataParams {
  isAuthenticated: boolean;
  currentPage: number;
  sortField: SortField;
  sortOrder: SortOrder;
  view?: "list" | "queue";
  subscriberOnly?: boolean;
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

export function useScransData({
  isAuthenticated,
  currentPage,
  sortField,
  sortOrder,
  view,
  subscriberOnly,
  onUnauthorized,
  onTotalItems,
}: UseScransDataParams): UseScransDataReturn {
  const [scrans, setScrans] = useState<Scran[]>([]);
  const [loading, setLoading] = useState(true);
  const [shouldRefetch, setShouldRefetch] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState<number | undefined>(undefined);
  const [regularCount, setRegularCount] = useState<number | undefined>(undefined);

  const fetchScrans = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      const viewParam = view ? `&view=${view}` : "";
      const subParam = subscriberOnly ? `&subscriber_only=true` : "";
      const response = await fetch(
        `/api/admin/scrans?page=${currentPage}&limit=10&sort=${sortField}&order=${sortOrder}${viewParam}${subParam}`
        // Cookie sent automatically; server validates via getCurrentUser + role
      );

      if (response.ok) {
        const data = await response.json();
        setScrans(data.scrans);
        onTotalItems(data.total);
        setSubscriberCount(data.subscriberCount);
        setRegularCount(data.regularCount);
      } else if (response.status === 401) {
        onUnauthorized();
      }
    } catch (error) {
      console.error("Error fetching scrans:", error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, currentPage, sortField, sortOrder, view, subscriberOnly, onUnauthorized, onTotalItems]);

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
