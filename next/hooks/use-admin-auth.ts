"use client";

import { useState, useCallback, useEffect } from "react";
import {
  getAdminSessionSnapshot,
  loginWithTelegram,
  logoutCurrentSession,
} from "@/app/actions/auth";

type AdminRole = "moderator" | "admin";

interface UseAdminAuthReturn {
  isAuthenticated: boolean;
  role: AdminRole | null;
  login: (data: Record<string, string>) => Promise<boolean>;
  logout: () => void;
}

export function useAdminAuth(): UseAdminAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const snapshot = await getAdminSessionSnapshot();
        if (snapshot.authenticated) {
          setIsAuthenticated(true);
          setRole(snapshot.role);
        }
      } catch {
        // ignore
      }
    };
    void checkSession();
  }, []);

  const login = useCallback(async (data: Record<string, string>): Promise<boolean> => {
    try {
      const loginResult = await loginWithTelegram(data);
      if (!loginResult.ok) {
        return false;
      }
      const snapshot = await getAdminSessionSnapshot();
      if (!snapshot.authenticated || !snapshot.role) {
        return false;
      }
      setIsAuthenticated(true);
      setRole(snapshot.role);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    setIsAuthenticated(false);
    setRole(null);
    await logoutCurrentSession();
  }, []);

  return {
    isAuthenticated,
    role,
    login,
    logout,
  };
}
