"use client";

import { useState, useEffect } from "react";

interface SplashTextProps {
  texts: string[];
}

export function SplashText({ texts }: SplashTextProps) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(texts[Math.floor(Math.random() * texts.length)]);
  }, [texts]);

  if (!text) return null;

  return (
    <p
      className="pixel-text text-center text-sm font-bold italic sm:text-base lg:text-lg 2xl:text-xl md:-rotate-15"
      style={{
        color: "#ffff55",
        textShadow: "2px 2px 0 #3f3f00, -1px -1px 0 #3f3f00",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </p>
  );
}
