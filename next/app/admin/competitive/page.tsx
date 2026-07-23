"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { CompetitivePanel } from "@/components/admin/competitive-panel";

export default function AdminCompetitivePage(): ReactElement {
  return (
    <div className="retro-bg relative min-h-dvh">
      <div className="retro-overlay pointer-events-none fixed inset-0" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="pixel-text text-2xl font-bold text-white">
              Competitive Daily
            </h1>
            <p className="mt-1 text-sm text-white/60">
              Флаг, сезоны, пул и генерация
            </p>
          </div>
          <Link href="/admin" className="pixel-btn px-3 py-2 text-sm font-bold">
            ← Админ-панель
          </Link>
        </div>
        <CompetitivePanel />
      </div>
    </div>
  );
}
