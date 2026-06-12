// Sidebar — ported from design_files/admin.css `.aside / .nav-group / .aitem`.
//
// Width is configurable per surface (252 admin / 224 trainee / 252 super).
// Active item = ink fill + white text, matching the prototype's `.aitem.on`.

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { Brand } from "./Brand";
import type { ShellConfig } from "./nav-types";

export function Sidebar({
  config,
  pathname,
}: {
  config: ShellConfig;
  pathname: string;
}) {
  return (
    <aside
      className="bg-surface border-r border-border sticky top-0 h-screen overflow-y-auto flex flex-col"
      style={{ width: config.sidebarWidth }}
    >
      {/* Brand */}
      <div className="px-[18px] pt-[18px] pb-[16px] border-b border-border">
        <Brand size="md" withSub sub={config.brandSub} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-3 pb-[18px]">
        {config.nav.map((group, gi) => (
          <div key={group.label} className={gi === 0 ? "mt-1" : "mt-[14px]"}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3 px-[10px] pb-[6px]">
              {group.label}
            </div>
            {group.items.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-[11px] px-[10px] py-[7px] rounded-[7px]",
                    "text-[13px] font-medium my-[1px] transition-colors",
                    isActive
                      ? "bg-ink text-white"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon
                    name={item.icon}
                    size={16}
                    className={isActive ? "opacity-100" : "opacity-90"}
                  />
                  <span className="truncate">{item.label}</span>
                  {item.badge ? (
                    <span
                      className={cn(
                        "ml-auto text-[10px] font-bold tracking-[0.02em] px-[7px] py-[1px] rounded-[8px]",
                        isActive
                          ? "bg-white/[0.18] text-white"
                          : "bg-accent-pale text-accent-strong",
                      )}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                  {item.ai ? (
                    <span
                      className={cn(
                        "ml-auto text-[10px] font-bold px-[7px] py-[1px] rounded-[8px]",
                        "bg-ai-grad text-white",
                      )}
                    >
                      AI
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
