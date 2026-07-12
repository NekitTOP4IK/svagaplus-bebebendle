"use client";

import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useAdminSorting } from "@/hooks/use-admin-sorting";
import { useAdminPagination } from "@/hooks/use-admin-pagination";
import { useScransData } from "@/hooks/use-scrans-data";
import { useScranMutations } from "@/hooks/use-scran-mutations";
import type { Scran } from "@/types/scran";

type SortField = "id" | "name" | "price" | "numberOfLikes" | "numberOfDislikes" | "approved";
type SortOrder = "asc" | "desc";

interface UseAdminReturn {
  isAuthenticated: boolean;
  scrans: Scran[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  sortField: SortField;
  sortOrder: SortOrder;
  login: (data: Record<string, string>) => Promise<boolean>;
  logout: () => void;
  approveScran: (id: number) => Promise<void>;
  banScran: (id: number) => Promise<void>;
  deleteScran: (id: number, comment: string) => Promise<boolean>;
  handleSort: (field: SortField) => void;
  setCurrentPage: (page: number) => void;
  refresh: () => void;
}

export function useAdmin(): UseAdminReturn {
  // Compose smaller hooks
  const { isAuthenticated, login, logout } = useAdminAuth();
  const { sortField, sortOrder, handleSort } = useAdminSorting();
  const {
    currentPage,
    totalPages,
    setCurrentPage,
    setTotalItems,
  } = useAdminPagination();

  // Data fetching with dependencies (no longer needs password; uses cookie)
  const { scrans, loading, refetch } = useScransData({
    isAuthenticated,
    currentPage,
    sortField,
    sortOrder,
    onUnauthorized: logout,
    onTotalItems: setTotalItems,
  });

  // Mutations (no longer needs password; uses cookie for server auth)
  const { approveScran, banScran, deleteScran } = useScranMutations({
    onUnauthorized: logout,
    onSuccess: refetch,
  });

  return {
    isAuthenticated,
    scrans,
    loading,
    currentPage,
    totalPages,
    sortField,
    sortOrder,
    login,
    logout,
    approveScran,
    banScran,
    deleteScran,
    handleSort,
    setCurrentPage,
    refresh: refetch,
  };
}
