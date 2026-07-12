"use client";

import { useEffect, useState } from "react";

interface LoginFormProps {
  onLogin: (data: Record<string, string>) => Promise<boolean>;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  useEffect(() => {
    if (!botUsername) return;

    // Expose global callback for Telegram widget
    (window as any).onTelegramAuth = async (user: any) => {
      setError("");
      setIsLoading(true);
      try {
        // Convert Telegram user object to flat Record<string, string> for API
        const data: Record<string, string> = {};
        for (const [key, value] of Object.entries(user)) {
          if (value != null) {
            data[key] = String(value);
          }
        }

        const success = await onLogin(data);
        if (!success) {
          setError("Login failed. You may not have moderator or admin role.");
        }
      } catch {
        setError("An error occurred during Telegram login.");
      } finally {
        setIsLoading(false);
      }
    };

    // Dynamically inject Telegram widget script (avoids SSR/script issues)
    const container = document.getElementById("telegram-login-container");
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
      delete (window as any).onTelegramAuth;
    };
  }, [botUsername, onLogin]);

  if (!botUsername) {
    return (
      <div className="retro-bg flex min-h-dvh items-center justify-center">
        <div className="retro-overlay absolute inset-0" />
        <div className="pixel-container relative z-10 w-full max-w-md rounded-none border-4 border-black bg-white p-8">
          <h1 className="pixel-text mb-6 text-2xl font-bold text-black">
            Admin Login
          </h1>
          <p className="text-sm font-bold text-red-600">
            Telegram login not configured. Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME environment variable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="retro-bg flex min-h-dvh items-center justify-center">
      <div className="retro-overlay absolute inset-0" />
      <div className="pixel-container relative z-10 w-full max-w-md rounded-none border-4 border-black bg-white p-8 text-center">
        <h1 className="pixel-text mb-6 text-2xl font-bold text-black">
          Admin Login
        </h1>
        <p className="mb-4 text-sm text-black">
          Sign in with Telegram. Only users with moderator or admin role can access.
        </p>

        {error && (
          <p className="mb-4 text-sm font-bold text-red-600">{error}</p>
        )}
        {isLoading && <p className="mb-4 text-sm">Logging in via Telegram...</p>}

        <div
          id="telegram-login-container"
          className="flex min-h-[60px] justify-center"
        />

        <p className="mt-6 text-xs text-gray-600">
          Uses official Telegram Login Widget. Your Telegram ID will be used for authentication.
        </p>
      </div>
    </div>
  );
}
