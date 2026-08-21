"use client";

import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
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

const subscribeToNothing = (): (() => void) => () => undefined;
const getClientMounted = (): boolean => true;
const getServerNotMounted = (): boolean => false;

export function HomeOverlays({ announcements }: Props): ReactElement {
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    getClientMounted,
    getServerNotMounted,
  );
  const enteredBeforeMount = useSyncExternalStore(
    subscribeToNothing,
    hasEnteredCurrentDocument,
    getServerNotMounted,
  );
  const [enteredThisMount, setEnteredThisMount] = useState(false);
  const entered = enteredBeforeMount || enteredThisMount;
  const {
    activatePlayback,
    setPlaybackActivationBlocked,
  } = useAudioController();

  useLayoutEffect(() => {
    if (!mounted) return;

    setPlaybackActivationBlocked(!entered);
    return () => setPlaybackActivationBlocked(false);
  }, [entered, mounted, setPlaybackActivationBlocked]);

  return (
    <>
      {mounted && !entered && (
        <EntranceGate
          onActivate={() => {
            setPlaybackActivationBlocked(false);
            activatePlayback();
          }}
          onEntered={() => {
            setEnteredThisMount(true);
          }}
        />
      )}
      {mounted && entered && <AnnouncementOverlay active={announcements} />}
    </>
  );
}
