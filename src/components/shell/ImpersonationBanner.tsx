// Persistent banner shown across all admin / learn pages while a super_admin
// is impersonating. Always-visible, hard-to-miss, with a clear Stop action.
//
// The banner sits at the very top of the page (above the topbar) so it can't
// be confused with normal app chrome.

import { stopImpersonation } from "@/app/super/companies/[id]/impersonate-actions";
import { Icon } from "@/components/ui/Icon";

export function ImpersonationBanner({
  asRole,
  companyName,
  impersonatorEmail,
}: {
  asRole: "admin" | "trainee";
  companyName: string;
  impersonatorEmail: string;
}) {
  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-warn text-white px-4 py-2"
      style={{
        boxShadow: "0 2px 6px rgba(201, 122, 27, 0.35)",
      }}
    >
      <div className="flex items-center gap-3 max-w-[1600px] mx-auto">
        <Icon name="shield" size={14} />
        <div className="flex-1 text-[12.5px] leading-snug">
          <span className="font-semibold">Impersonating</span> · {companyName}{" "}
          as <span className="font-semibold uppercase">{asRole}</span>
          <span className="hidden md:inline text-white/80">
            {" "}
            · acting on behalf of {impersonatorEmail}, expires in ≤60 min
          </span>
        </div>
        <form action={stopImpersonation}>
          <button
            type="submit"
            className="h-7 px-2.5 rounded-md bg-white/15 hover:bg-white/25 text-[12px] font-semibold whitespace-nowrap"
          >
            Stop impersonating
          </button>
        </form>
      </div>
    </div>
  );
}
