"use client";

import { useState, useCallback } from "react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useAdminSorting } from "@/hooks/use-admin-sorting";
import { useAdminPagination } from "@/hooks/use-admin-pagination";
import { useScransData } from "@/hooks/use-scrans-data";
import { useScranMutations } from "@/hooks/use-scran-mutations";
import type { Scran } from "@/types/scran";

type SortField = "id" | "name" | "price" | "numberOfLikes" | "numberOfDislikes" | "approved";
type SortOrder = "asc" | "desc";
type ViewMode = "list" | "queue" | "users";

interface UseAdminReturn {
  isAuthenticated: boolean;
  role: "moderator" | "admin" | null;
  scrans: Scran[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  sortField: SortField;
  sortOrder: SortOrder;
  view: ViewMode;
  subscriberOnly: boolean;
  subscriberCount?: number;
  regularCount?: number;
  login: (data: Record<string, string>) => Promise<boolean>;
  logout: () => void;
  approveScran: (id: number) => Promise<void>;
  rejectScran: (id: number) => Promise<void>;
  banScran: (id: number) => Promise<void>;
  deleteScran: (id: number, comment: string) => Promise<boolean>;
  recheckSubscriber: (scranId?: number) => Promise<void>;
  handleSort: (field: SortField) => void;
  setCurrentPage: (page: number) => void;
  setView: (mode: ViewMode) => void;
  setSubscriberOnly: (only: boolean) => void;
  toggleSubscriberOnly: () => void;
  refresh: () => void;
}

export function useAdmin(): UseAdminReturn {
  // Compose smaller hooks
  const { isAuthenticated, role, login, logout } = useAdminAuth();
  const { sortField, sortOrder, handleSort } = useAdminSorting();
  const {
    currentPage,
    totalPages,
    setCurrentPage,
    setTotalItems,
  } = useAdminPagination();

  // Queue view state (Task 5 hybrid moderation queue)
  const [view, setViewState] = useState<ViewMode>("queue");
  const [subscriberOnly, setSubscriberOnlyState] = useState<boolean>(false);

  const setView = useCallback((mode: ViewMode) => {
    setViewState(mode);
    setCurrentPage(1); // reset pagination on view switch
  }, [setCurrentPage]);

  const setSubscriberOnly = useCallback((only: boolean) => {
    setSubscriberOnlyState(only);
    setCurrentPage(1);
  }, [setCurrentPage]);

  const toggleSubscriberOnly = useCallback(() => {
    setSubscriberOnlyState((prev) => {
      const next = !prev;
      setCurrentPage(1);
      return next;
    });
  }, [setCurrentPage]);

  // Data fetching with dependencies (no longer needs password; uses cookie)
  const { scrans, loading, refetch, subscriberCount, regularCount } = useScransData({
    isAuthenticated,
    currentPage,
    sortField,
    sortOrder,
    view,
    subscriberOnly,
    onUnauthorized: logout,
    onTotalItems: setTotalItems,
  });

  // Mutations (no longer needs password; uses cookie for server auth)
  const { approveScran, rejectScran, banScran, deleteScran, recheckSubscriber } =
    useScranMutations({
      onUnauthorized: logout,
      onSuccess: refetch,
    });

  return {
    isAuthenticated,
    role,
    scrans,
    loading,
    currentPage,
    totalPages,
    sortField,
    sortOrder,
    view,
    subscriberOnly,
    subscriberCount,
    regularCount,
    login,
    logout,
    approveScran,
    rejectScran,
    banScran,
    deleteScran,
    recheckSubscriber,
    handleSort,
    setCurrentPage,
    setView,
    setSubscriberOnly,
    toggleSubscriberOnly,
    refresh: refetch,
  };
}
