// Skeleton for the roleplay player entry.
// force-dynamic on the play route + several sequential awaits (module
// load, session count, video provider, D-ID portrait) mean this page
// takes a beat before it can render. Show the video-tile shell so the
// trainee sees the persona/self layout appearing rather than a blank.

export default function Loading() {
  return (
    <div className="px-7 pt-6 pb-8 max-w-[1400px] animate-pulse space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-4 w-32 rounded-md bg-surface-2/70" />
        <div className="h-4 w-40 rounded-md bg-surface-2/70" />
        <div className="ml-auto h-8 w-24 rounded-md bg-surface-2" />
      </div>
      <div
        className="grid gap-4 items-start"
        style={{ gridTemplateColumns: "360px minmax(0, 1fr)" }}
      >
        <div className="space-y-4">
          <div className="aspect-video rounded-[12px] border border-border bg-surface-2/60" />
          <div className="aspect-video rounded-[12px] border border-border bg-surface-2/60" />
        </div>
        <div className="space-y-4">
          <div className="h-40 rounded-[12px] border border-border bg-surface-2/50" />
          <div className="h-40 rounded-[12px] border border-border bg-surface-2/50" />
          <div className="h-16 rounded-[12px] border border-border bg-surface-2/50" />
        </div>
      </div>
    </div>
  );
}
