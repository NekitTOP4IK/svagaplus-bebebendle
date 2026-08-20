"use client";

import { useState, type ReactElement } from "react";
import type { Announcement } from "@/db/schema";
import { AnnouncementOverlay } from "@/components/announcements/announcement-overlay";
import {
  EntranceGate,
  hasEnteredCurrentDocument,
} from "@/components/entrance-gate";

type Props = Readonly<{
  announcements: Announcement[];
}>;

export function HomeOverlays({ announcements }: Props): ReactElement {
  const [entered, setEntered] = useState(hasEnteredCurrentDocument);

  return (
    <>
      <EntranceGate onEntered={() => setEntered(true)} />
      {entered && <AnnouncementOverlay active={announcements} />}
    </>
  );
}
