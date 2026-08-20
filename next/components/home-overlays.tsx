"use client";

import { useState, type ReactElement } from "react";
import type { Announcement } from "@/db/schema";
import { AnnouncementOverlay } from "@/components/announcements/announcement-overlay";
import {
  EntranceGate,
  hasEnteredCurrentDocument,
} from "@/components/entrance-gate";
import { useAudioController } from "@/components/audio/audio-provider";

type Props = Readonly<{
  announcements: Announcement[];
}>;

export function HomeOverlays({ announcements }: Props): ReactElement {
  const [entered, setEntered] = useState(hasEnteredCurrentDocument);
  const audio = useAudioController();

  return (
    <>
      <EntranceGate
        onActivate={() => audio.activatePlayback(true)}
        onEntered={() => {
          audio.restorePlaybackVolume();
          setEntered(true);
        }}
      />
      {entered && <AnnouncementOverlay active={announcements} />}
    </>
  );
}
