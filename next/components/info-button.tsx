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
        className="pixel-btn inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 2xl:w-14 2xl:h-14 4xl:w-16 4xl:h-16"
        aria-label="Показать статистику"
      >
        <Info className="w-5 h-5 sm:w-6 sm:h-6 2xl:w-7 2xl:h-7 4xl:w-8 4xl:h-8" />
      </button>

      <StatsModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
