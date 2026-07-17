"use client";

import { useState, useCallback } from "react";

const ITEMS_PER_PAGE = 10;

interface UseAdminPaginationReturn {
  currentPage: number;
  totalItems: number;
  totalPages: number;
  setCurrentPage: (page: number) => void;
  setTotalItems: (total: number) => void;
  getPaginationParams: () => { page: number; limit: number };
}

export function useAdminPagination(): UseAdminPaginationReturn {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItemsState] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const setTotalItems = useCallback((total: number) => {
    setTotalItemsState(total);
    setTotalPages(Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)));
  }, []);

  const getPaginationParams = useCallback(
    () => ({
      page: currentPage,
      limit: ITEMS_PER_PAGE,
    }),
    [currentPage]
  );

  return {
    currentPage,
    totalItems,
    totalPages,
    setCurrentPage,
    setTotalItems,
    getPaginationParams,
  };
}
