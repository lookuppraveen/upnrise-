// Skeleton for the training detail page.
// The real page fires many per-module queries (progress, stats, roleplay
// config); this fallback shows the header + a module-list shape while
// they resolve so the trainee gets immediate visual feedback.

export default function Loading() {
  return (
    <div className="px-7 pt-6 pb-20 max-w-[1200px] space-y-6 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3 flex-1">
          <div className="h-4 w-32 rounded-md bg-surface-2/70" />
          <div className="h-8 w-2/3 rounded-md bg-surface-2" />
          <div className="h-4 w-1/2 rounded-md bg-surface-2/70" />
        </div>
        <div className="h-10 w-36 rounded-md bg-surface-2" />
      </div>
      <div className="h-16 rounded-[12px] border border-border bg-surface-2/50" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-[12px] border border-border bg-surface-2/50"
          />
        ))}
      </div>
    </div>
  );
}
