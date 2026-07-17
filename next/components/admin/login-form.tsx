"use client";

import type { ReactElement } from "react";
import { TelegramLogin } from "@/components/telegram-login";

interface LoginFormProps {
  onLogin: (data: Record<string, string>) => Promise<boolean>;
}

export function LoginForm({ onLogin }: LoginFormProps): ReactElement {
  return (
    <div className="retro-bg relative flex min-h-dvh items-center justify-center px-4">
      <div className="retro-overlay pointer-events-none fixed inset-0" />
      <div className="pixel-container relative z-10 w-full max-w-md rounded-none border-4 border-black bg-zinc-900/95 p-8 text-center">
        <h1 className="pixel-text mb-6 text-2xl font-bold">Вход в админ-панель</h1>
        <TelegramLogin onAuthenticated={onLogin} context="admin" />
        <p className="mt-6 text-xs text-white/50">
          Официальный виджет Telegram. Роль проверяется после входа.
        </p>
      </div>
    </div>
  );
}
