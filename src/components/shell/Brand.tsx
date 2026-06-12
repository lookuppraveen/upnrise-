// Shared brand mark. One place to swap the logo so every surface
// (sidebar, login, invite) stays consistent. Save the real artwork at
// /public/upnrise-logo.png (or .svg) — height is what we constrain;
// width is whatever the image's aspect ratio dictates.

import Image from "next/image";

export function Brand({
  size = "md",
  withSub,
  sub,
}: {
  size?: "sm" | "md" | "lg";
  withSub?: boolean;
  sub?: string;
}) {
  const heightPx = size === "sm" ? 24 : size === "lg" ? 56 : 32;
  return (
    <div className="flex flex-col leading-tight">
      <Image
        src="/logo.png"
        alt="UPnRise"
        width={heightPx * 4}
        height={heightPx}
        priority
        className="block w-auto"
        style={{ height: `${heightPx}px` }}
      />
      {withSub && sub ? (
        <span className="text-[10.5px] text-ink-3 tracking-[0.04em] mt-1">
          {sub}
        </span>
      ) : null}
    </div>
  );
}
