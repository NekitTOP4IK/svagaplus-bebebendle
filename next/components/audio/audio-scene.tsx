"use client";

import { useEffect } from "react";
import { useOptionalAudioController } from "@/components/audio/audio-provider";
import type { AudioScene } from "@/lib/audio/soundtrack-manifest";

/**
 * Declaratively claims a scene for the lifetime of the owning client surface.
 * The provider resolves overlapping claims by registration order and restores
 * its route scene when the owner unmounts.
 */
export function AudioSceneBoundary(
  props: Readonly<{ scene: AudioScene; ownerId: string }>,
): null {
  const controller = useOptionalAudioController();
  const setScene = controller?.setScene;
  const clearScene = controller?.clearScene;

  useEffect(() => {
    if (!setScene || !clearScene) return undefined;
    setScene(props.scene, props.ownerId);
    return () => clearScene(props.ownerId);
  }, [clearScene, props.ownerId, props.scene, setScene]);

  return null;
}
