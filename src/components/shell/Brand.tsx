// Shared brand mark. One place to swap the logo so every surface
// (sidebar, login, invite) stays consistent. Save the real artwork at
// /public/upnrise-logo.png (or .svg) — height is what we constrain;
// width is whatever the image's aspect ratio dictates.

export function Brand({
  size = "md",
  withSub,
  sub,
}: {
  size?: "sm" | "md" | "lg";
  withSub?: boolean;
  sub?: string;
}) {
  const heightPx = size === "sm" ? 28 : size === "lg" ? 64 : 36;
  const maxWidthPx = size === "sm" ? 140 : size === "lg" ? 260 : 180;
  return (
    <div className="flex flex-col leading-tight">
      {/* Plain <img> + object-contain so the browser preserves the
          file's intrinsic aspect ratio no matter what the box dims are.
          height is fixed, width is bounded by maxWidth — the image will
          shrink to whichever constraint is tighter without distorting. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/upnrise-logo.png"
        alt="UPnRise"
        className="block w-auto object-contain"
        style={{
          height: `${heightPx}px`,
          maxWidth: `${maxWidthPx}px`,
        }}
      />
      {withSub && sub ? (
        <span className="text-[10.5px] text-ink-3 tracking-[0.04em] mt-1">
          {sub}
        </span>
      ) : null}
    </div>
  );
}
