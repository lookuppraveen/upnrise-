"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/Button";
import type { PlayerMode } from "@/lib/roleplay/additional-settings";

// PreSessionModal enumerates media devices via navigator.mediaDevices
// on mount; there's no reason to ship it (or run it) on the training
// detail page until the trainee actually clicks Start. Dynamic-import
// with ssr:false so it never lands in the initial page bundle.
const PreSessionModal = dynamic(
  () =>
    import("@/components/roleplay/PreSessionModal").then(
      (m) => m.PreSessionModal,
    ),
  { ssr: false },
);

type Props = {
  trainingId: string;
  moduleId: string;
  moduleName: string;
  hasAttempts: boolean;
  scenario: string;
  keywords: string[];
  minDurationMin: number;
  maxDurationMin: number;
  attemptsKind: "unlimited" | "limited";
  attemptsLimit: number;
  attemptsUsed: number;
  hintsKind: "yes" | "no" | "limited";
  hintsLimit: number;
  availableModes: PlayerMode[];
  availableLanguages: string[];
};

export function ModuleStartButton({
  trainingId,
  moduleId,
  moduleName,
  hasAttempts,
  scenario,
  keywords,
  minDurationMin,
  maxDurationMin,
  attemptsKind,
  attemptsLimit,
  attemptsUsed,
  hintsKind,
  hintsLimit,
  availableModes,
  availableLanguages,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="accent"
        size="sm"
        onClick={() => setOpen(true)}
        suppressHydrationWarning
      >
        {hasAttempts ? "Retry" : "Start"}
      </Button>

      {open ? (
        <PreSessionModal
          open={open}
          onClose={() => setOpen(false)}
          trainingId={trainingId}
          moduleId={moduleId}
          moduleName={moduleName}
          scenario={scenario}
          keywords={keywords}
          minDurationMin={minDurationMin}
          maxDurationMin={maxDurationMin}
          attemptsKind={attemptsKind}
          attemptsLimit={attemptsLimit}
          attemptsUsed={attemptsUsed}
          hintsKind={hintsKind}
          hintsLimit={hintsLimit}
          availableModes={availableModes}
          availableLanguages={availableLanguages}
        />
      ) : null}
    </>
  );
}
