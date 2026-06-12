// POST /api/super/copilot/chat
//
// Body: { messages: [...], currentPath?: string }
// Resp: { reply: string, actions: [...] }
//
// Super-admin only. Non-streaming (tool rounds make streaming complex).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { runPlatformCopilotTurn } from "@/lib/ai/platform-copilot";

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
  currentPath: z.string().max(200).optional().nullable(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Reject impersonating super_admins too — the Platform Copilot is for
  // operators acting as themselves, not under a tenant persona.
  if (user.role !== "super_admin" || user.isImpersonating)
    return NextResponse.json({ error: "super admin only" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const result = await runPlatformCopilotTurn({
    user,
    currentPath: parsed.data.currentPath ?? null,
    messages: parsed.data.messages,
  });
  return NextResponse.json(result);
}
