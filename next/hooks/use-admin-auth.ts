"use client";

import { useState, useCallback, useEffect } from "react";

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
            setRole(data.role as AdminRole | null);
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
        // Verify with role check (Telegram login succeeds for players too; admin panel requires mod/admin role)
        try {
          const checkRes = await fetch("/api/admin/check-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.authenticated && checkData.role) {
              setIsAuthenticated(true);
              setRole(checkData.role as AdminRole);
              return true;
            }
          }
        } catch {
          // fallthrough
        }
        return false;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    setIsAuthenticated(false);
    setRole(null);
    try {
      await fetch("/api/auth/telegram", { method: "DELETE" });
    } catch {
      // ignore network error on logout
    }
  }, []);

  return {
    isAuthenticated,
    role,
    login,
    logout,
  };
}
