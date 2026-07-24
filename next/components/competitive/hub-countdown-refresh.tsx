"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps, ReactElement } from "react";
import { HubCountdown } from "./hub-countdown";

/**
 * Client island: HubCountdown that calls router.refresh() once on expire.
 * Use from server components (season-hero, cta-row) for season/daily auto-refresh.
 */
export function HubCountdownRefresh(
  props: Omit<ComponentProps<typeof HubCountdown>, "onExpire">,
): ReactElement {
  const router = useRouter();
  return (
    <HubCountdown
      {...props}
      onExpire={() => {
        router.refresh();
      }}
    />
  );
}
