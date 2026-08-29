"use client";

import { useState, useCallback } from "react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useAdminSorting } from "@/hooks/use-admin-sorting";
import { useAdminPagination } from "@/hooks/use-admin-pagination";
import { useScransData, type ScranStatusFilter } from "@/hooks/use-scrans-data";
import { useScranMutations } from "@/hooks/use-scran-mutations";
import type { Scran } from "@/types/scran";
import type { RejectReasonCode } from "@/lib/reject-reasons";

type SortField = "id" | "name" | "price" | "numberOfLikes" | "numberOfDislikes" | "approved";
type SortOrder = "asc" | "desc";
export type ViewMode =
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

interface UseAdminReturn {
  isAuthenticated: boolean;
  role: "moderator" | "admin" | null;
  scrans: Scran[];
  loading: boolean;
  currentPage: number;
  totalItems: number;
  totalPages: number;
  sortField: SortField;
  sortOrder: SortOrder;
  view: ViewMode;
  subscriberOnly: boolean;
  subscriberCount?: number;
  regularCount?: number;
  searchQuery: string;
  statusFilter: ScranStatusFilter;
  authorTelegramId: string;
  login: (data: Record<string, string>) => Promise<boolean>;
  logout: () => void;
  approveScran: (id: number) => Promise<void>;
  rejectScran: (id: number, reason?: RejectReasonCode, note?: string) => Promise<void>;
  banScran: (id: number) => Promise<void>;
  banUser: (
    telegramId: string,
    reasonCode: import("@/lib/ban-reasons").BanReasonCode,
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
  handleSort: (field: SortField) => void;
  setCurrentPage: (page: number) => void;
  setView: (mode: ViewMode) => void;
  setSubscriberOnly: (only: boolean) => void;
  toggleSubscriberOnly: () => void;
  setSearchQuery: (q: string) => void;
  setStatusFilter: (s: ScranStatusFilter) => void;
  setAuthorTelegramId: (id: string) => void;
  refresh: () => void;
}

export function useAdmin(): UseAdminReturn {
  const { isAuthenticated, role, login, logout } = useAdminAuth();
  const { sortField, sortOrder, handleSort } = useAdminSorting();
  const { currentPage, totalItems, totalPages, setCurrentPage, setTotalItems } =
    useAdminPagination();

  const [view, setViewState] = useState<ViewMode>("queue");
  const [subscriberOnly, setSubscriberOnlyState] = useState(false);
  const [searchQuery, setSearchQueryState] = useState("");
  const [statusFilter, setStatusFilterState] = useState<ScranStatusFilter>("all");
  const [authorTelegramId, setAuthorTelegramIdState] = useState("");

  const setView = useCallback(
    (mode: ViewMode) => {
      setViewState(mode);
      setCurrentPage(1);
    },
    [setCurrentPage],
  );

  const setSubscriberOnly = useCallback(
    (only: boolean) => {
      setSubscriberOnlyState(only);
      setCurrentPage(1);
    },
    [setCurrentPage],
  );

  const toggleSubscriberOnly = useCallback(() => {
    setSubscriberOnlyState((prev) => {
      setCurrentPage(1);
      return !prev;
    });
  }, [setCurrentPage]);

  const setSearchQuery = useCallback(
    (q: string) => {
      setSearchQueryState(q);
      setCurrentPage(1);
    },
    [setCurrentPage],
  );

  const setStatusFilter = useCallback(
    (s: ScranStatusFilter) => {
      setStatusFilterState(s);
      setCurrentPage(1);
    },
    [setCurrentPage],
  );

  const setAuthorTelegramId = useCallback(
    (id: string) => {
      setAuthorTelegramIdState(id);
      setCurrentPage(1);
    },
    [setCurrentPage],
  );

  const { scrans, loading, refetch, subscriberCount, regularCount } = useScransData({
    isAuthenticated,
    currentPage,
    sortField,
    sortOrder,
    view,
    subscriberOnly,
    searchQuery,
    statusFilter,
    authorTelegramId,
    onUnauthorized: logout,
    onTotalItems: setTotalItems,
  });

  const {
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
  } = useScranMutations({
    onUnauthorized: logout,
    onSuccess: refetch,
  });

  return {
    isAuthenticated,
    role,
    scrans,
    loading,
    currentPage,
    totalItems,
    totalPages,
    sortField,
    sortOrder,
    view,
    subscriberOnly,
    subscriberCount,
    regularCount,
    searchQuery,
    statusFilter,
    authorTelegramId,
    login,
    logout,
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
    handleSort,
    setCurrentPage,
    setView,
    setSubscriberOnly,
    toggleSubscriberOnly,
    setSearchQuery,
    setStatusFilter,
    setAuthorTelegramId,
    refresh: refetch,
  };
}
