"use client";

import { useEffect, useId, useState, type ReactElement } from "react";

export type TelegramLoginUser = Readonly<{
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}>;

type Props = Readonly<{
  onAuthenticated: (data: Record<string, string>) => Promise<boolean> | boolean;
  context: "player" | "admin";
}>;

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramLoginUser) => void;
  }
}

export function TelegramLogin({ onAuthenticated, context }: Props): ReactElement {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const containerId = useId().replace(/:/g, "");
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  useEffect(() => {
    if (!botUsername) return;

    window.onTelegramAuth = async (user: TelegramLoginUser) => {
      setError("");
      setIsLoading(true);
      try {
        const data: Record<string, string> = {};
        for (const [key, value] of Object.entries(user)) {
          if (value != null) {
            data[key] = String(value);
          }
        }
        const success = await onAuthenticated(data);
        if (!success) {
          setError(
            context === "admin"
              ? "Вход выполнен, но для админ-панели нужна роль moderator или admin."
              : "Не удалось войти через Telegram.",
          );
        }
      } catch {
        setError("Ошибка при входе через Telegram.");
      } finally {
        setIsLoading(false);
      }
    };

    const container = document.getElementById(`telegram-login-${containerId}`);
    if (container) {
      container.innerHTML = "";
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.async = true;
      script.setAttribute("data-telegram-login", botUsername);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-radius", "0");
      script.setAttribute("data-onauth", "onTelegramAuth(user)");
      script.setAttribute("data-request-access", "write");
      container.appendChild(script);
    }

    return () => {
      delete window.onTelegramAuth;
    };
  }, [botUsername, containerId, context, onAuthenticated]);

  if (!botUsername) {
    return (
      <p className="text-sm font-bold text-red-600">
        Telegram login not configured. Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.
      </p>
    );
  }

  return (
    <div className="text-center">
      <p className="mb-4 text-sm text-black">
        {context === "player"
          ? "Войти через Telegram"
          : "Войдите через Telegram. Доступ к админке проверяется по роли после входа."}
      </p>
      {error && <p className="mb-4 text-sm font-bold text-red-600" role="alert">{error}</p>}
      {isLoading && <p className="mb-4 text-sm">Вход через Telegram...</p>}
      <div
        id={`telegram-login-${containerId}`}
        className="flex min-h-[60px] justify-center"
      />
    </div>
  );
}
