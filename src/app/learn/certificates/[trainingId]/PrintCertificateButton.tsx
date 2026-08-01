"use client";

// Trigger the browser's print dialog. Split into a client component
// because window.print() can't run from a server component.

import { Button } from "@/components/ui/Button";

export function PrintCertificateButton() {
  return (
    <Button
      variant="accent"
      size="md"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
    >
      Print / Save as PDF
    </Button>
  );
}
