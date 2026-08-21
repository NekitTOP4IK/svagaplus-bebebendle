"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { StatsModal } from "@/components/stats-modal";

export function InfoButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="pixel-btn inline-flex h-10 w-10 items-center justify-center sm:h-12 sm:w-12"
        aria-label="Показать статистику"
      >
        <Info className="h-5 w-5 sm:h-6 sm:w-6" />
      </button>

      <StatsModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
