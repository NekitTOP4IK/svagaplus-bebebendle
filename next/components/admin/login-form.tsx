"use client";

import { useState, type ReactElement } from "react";
import { AuthOrDivider, TwitchAuthButton } from "@/components/auth-providers";
import { TelegramLogin } from "@/components/telegram-login";

interface LoginFormProps {
  onLogin: (data: Record<string, string>) => Promise<boolean>;
}

export function LoginForm({ onLogin }: LoginFormProps): ReactElement {
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [twitchLoading, setTwitchLoading] = useState(false);

  return (
    <div className="retro-bg relative flex min-h-dvh items-center justify-center px-4">
      <div className="retro-overlay pointer-events-none fixed inset-0" />
      <div className="pixel-container relative z-10 w-full max-w-md rounded-none border-4 border-black bg-zinc-900/95 p-8 text-center">
        <h1 className="pixel-text mb-6 text-2xl font-bold">Вход в админ-панель</h1>
        <TelegramLogin
          onAuthenticated={onLogin}
          context="admin"
          disabled={twitchLoading}
          onLoadingChange={setTelegramLoading}
        />
        <AuthOrDivider />
        <TwitchAuthButton
          href="/api/auth/twitch/start?next=%2Fadmin"
          disabled={telegramLoading}
          onLoadingChange={setTwitchLoading}
          hint="Twitch — если аккаунт привязан к Telegram в СВАГА+ и у вас есть роль mod/admin."
        />
        <p className="mt-6 text-xs text-white/50">
          Роль проверяется после входа. Нужна роль moderator или admin.
        </p>
      </div>
    </div>
  );
}
