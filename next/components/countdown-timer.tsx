"use client";

import { useState, useEffect } from "react";
import { formatTimeUntilMidnightUTC } from "@/lib/utils";

export function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState<string>("00:00:00");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initialize = () => {
      setMounted(true);
      setTimeLeft(formatTimeUntilMidnightUTC());
    };

    const initTimeout = setTimeout(initialize, 0);

    const timer = setInterval(() => {
      setTimeLeft(formatTimeUntilMidnightUTC());
    }, 1000);

    return () => {
      clearTimeout(initTimeout);
      clearInterval(timer);
    };
  }, []);

  const textShadowStyle = {
    fontFamily: "var(--font-pixel), monospace",
    color: "white",
    textShadow:
      "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000",
  };

  if (!mounted) {
    return (
      <div className="text-center">
        <p
          className="text-sm sm:text-base md:text-lg 2xl:text-xl 4xl:text-2xl font-medium mb-1 2xl:mb-2"
          style={textShadowStyle}
        >
          До следующего дейлика:
        </p>
        <p
          className="text-xl sm:text-2xl md:text-3xl 2xl:text-4xl 4xl:text-5xl font-black"
          style={textShadowStyle}
        >
          00:00:00
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p
        className="pixel-text text-left text-[10px] leading-tight text-white/90 sm:text-xs md:text-sm 2xl:text-base 4xl:text-lg"
        style={textShadowStyle}
      >
        До следующего дейлика: {timeLeft}
      </p>
    </div>
  );
}
