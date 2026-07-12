"use client";

import { useState, useCallback, useEffect } from "react";

interface UseAdminAuthReturn {
  isAuthenticated: boolean;
  login: (data: Record<string, string>) => Promise<boolean>;
  logout: () => void;
}

export function useAdminAuth(): UseAdminAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // On mount, try to detect existing session via check-auth (which will use cookie)
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/admin/check-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // No body needed; server will read cookie
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setIsAuthenticated(true);
          }
        }
      } catch {
        // ignore
      }
    };
    checkSession();
  }, []);

  const login = useCallback(async (data: Record<string, string>): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setIsAuthenticated(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    setIsAuthenticated(false);
    try {
      await fetch("/api/auth/telegram", { method: "DELETE" });
    } catch {
      // ignore network error on logout
    }
  }, []);

  return {
    isAuthenticated,
    login,
    logout,
  };
}
