"use client";

import type { ReactElement } from "react";
import { TelegramLogin } from "@/components/telegram-login";

interface LoginFormProps {
  onLogin: (data: Record<string, string>) => Promise<boolean>;
}

export function LoginForm({ onLogin }: LoginFormProps): ReactElement {
  return (
    <div className="retro-bg flex min-h-dvh items-center justify-center">
      <div className="retro-overlay absolute inset-0" />
      <div className="pixel-card relative z-10 w-full max-w-md rounded-none p-8 text-center text-zinc-900">
        <h1 className="pixel-text-on-light mb-6 text-2xl font-bold">
          Вход в админ-панель
        </h1>
        <TelegramLogin onAuthenticated={onLogin} context="admin" />
        <p className="mt-6 text-xs text-zinc-600">
          Официальный Telegram Login Widget. Роль проверяется после аутентификации.
        </p>
      </div>
    </div>
  );
}
