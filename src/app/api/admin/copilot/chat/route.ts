// POST /api/admin/copilot/chat
//
// Body: { messages: [...], currentPath?: string }
// Resp: { reply: string, actions: [...] }
//
// Non-streaming for Phase 3.3 (tool rounds make streaming complex). Client
// shows "thinking…" until the response arrives.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { runCopilotTurn } from "@/lib/ai/admin-copilot";

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
  if (user.role !== "admin")
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  if (!user.companyId)
    return NextResponse.json({ error: "no tenant" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { name: true },
  });

  const result = await runCopilotTurn({
    user,
    companyName: company?.name ?? null,
    currentPath: parsed.data.currentPath ?? null,
    messages: parsed.data.messages,
  });

  return NextResponse.json(result);
}
