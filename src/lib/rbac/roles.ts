// Role definitions and route-group guards. Wiring middleware lives in Phase 1.
// See BUILD_PLAN.md §2.

export type Role = "super_admin" | "admin" | "trainee";

export const ROLE_SCOPES: Record<Role, { home: string }> = {
  super_admin: { home: "/super/overview" },
  admin: { home: "/admin/dashboard" },
  trainee: { home: "/learn/dashboard" },
};

export function canAccess(role: Role, path: string): boolean {
  if (path.startsWith("/super")) return role === "super_admin";
  if (path.startsWith("/admin")) return role === "admin";
  if (path.startsWith("/learn")) return role === "trainee";
  return true; // marketing / login etc
}
