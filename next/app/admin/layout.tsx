import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser, isStaffRole } from "@/lib/auth-server";

type Props = Readonly<{
  children: ReactNode;
}>;

/**
 * Gate for /admin/* pages.
 * - Logged-in players (non-staff): hard deny (no UI shell leak).
 * - Anonymous: allowed through so /admin can show Telegram login.
 * - Nested staff-only routes (e.g. /admin/scrans) enforce auth in their own layout.
 */
export default async function AdminLayout({ children }: Props): Promise<ReactElement> {
  const user = await getCurrentUser();

  if (user && !isStaffRole(user.role)) {
    return (
      <div className="retro-bg relative flex min-h-dvh flex-col items-center justify-center px-4">
        <div className="retro-overlay pointer-events-none fixed inset-0" />
        <div className="pixel-container relative z-10 w-full max-w-md border-4 border-black bg-zinc-900/95 p-8 text-center text-white">
          <h1 className="pixel-text mb-3 text-2xl font-bold">Доступ запрещён</h1>
          <p className="mb-6 text-sm text-white/70">
            Админ-панель только для модераторов и администраторов.
          </p>
          <Link href="/" className="pixel-btn inline-block px-6 py-2 text-sm font-bold">
            На главную
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
