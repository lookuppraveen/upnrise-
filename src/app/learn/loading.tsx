// Fallback skeleton for every /learn/* route while its RSC render is
// in flight. Applied automatically by the App Router — Next renders this
// as soon as the trainee clicks a nav link, then swaps in the real page
// once the server component tree resolves. Even ~200ms of skeleton
// beats a blank page during navigation.
//
// Kept generic on purpose (single strip + card grid) so it works for
// dashboard, trainings list, assignments, history, and feedbacks
// without shipping route-specific variants. Nested routes with heavier
// content (training detail, player) get their own loading.tsx.

export default function Loading() {
  return (
    <div className="px-7 pt-6 pb-20 max-w-[1480px] space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-7 w-72 rounded-md bg-surface-2" />
        <div className="h-4 w-96 rounded-md bg-surface-2/70" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-[12px] border border-border bg-surface-2/50"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-72 rounded-[12px] border border-border bg-surface-2/50" />
        <div className="h-72 rounded-[12px] border border-border bg-surface-2/50" />
      </div>
    </div>
  );
}
