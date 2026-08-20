"use client";

import { useLayoutEffect, useState, type ReactElement } from "react";
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
  const {
    activatePlayback,
    restorePlaybackVolume,
    setPlaybackActivationBlocked,
  } = useAudioController();

  useLayoutEffect(() => {
    if (entered) return;

    setPlaybackActivationBlocked(true);
    return () => setPlaybackActivationBlocked(false);
  }, [entered, setPlaybackActivationBlocked]);

  return (
    <>
      <EntranceGate
        onActivate={() => {
          setPlaybackActivationBlocked(false);
          activatePlayback(true);
        }}
        onEntered={() => {
          setEntered(true);
          requestAnimationFrame(() => restorePlaybackVolume());
        }}
      />
      {entered && <AnnouncementOverlay active={announcements} />}
    </>
  );
}
