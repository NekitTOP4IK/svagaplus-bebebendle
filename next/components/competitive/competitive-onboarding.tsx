"use client";

import { useMemo, useState, type ReactElement } from "react";
import type { HubOnboarding } from "@/lib/competitive/hub";
import { CompetitiveIntroModal } from "./competitive-intro-modal";
import { CompetitiveNickPrompt } from "./competitive-nick-prompt";

type Props = Readonly<{
  competitiveDisplayName: string | null;
  onboarding: HubOnboarding;
}>;

/**
 * Modal queue for first Ranked visit:
 * 1) nick prompt (if needed)
 * 2) admin intro (last)
 */
export function CompetitiveOnboarding({
  competitiveDisplayName,
  onboarding,
}: Props): ReactElement | null {
  const needsNick = useMemo(() => {
    if (competitiveDisplayName?.trim()) return false;
    if (onboarding.nickPromptDismissed) return false;
    return true;
  }, [competitiveDisplayName, onboarding.nickPromptDismissed]);

  // Skip nick phase entirely when not needed → intro can show immediately.
  const [nickDone, setNickDone] = useState(!needsNick);
  const [introDone, setIntroDone] = useState(false);

  if (!nickDone && needsNick) {
    return (
      <CompetitiveNickPrompt
        competitiveDisplayName={competitiveDisplayName}
        serverDismissed={onboarding.nickPromptDismissed}
        onFinished={() => setNickDone(true)}
      />
    );
  }

  if (
    nickDone &&
    !introDone &&
    onboarding.intro.shouldShow
  ) {
    return (
      <CompetitiveIntroModal
        title={onboarding.intro.title}
        body={onboarding.intro.body}
        onDismissed={() => setIntroDone(true)}
      />
    );
  }

  return null;
}
