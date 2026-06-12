"use server";

// Credits server actions — Top up (and future: adjust). Only super_admin.
// Writes an append-only entry to credit_ledger and an audit log row.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";
import { audit } from "@/lib/audit";

const TopUpSchema = z.object({
  companyId: z.string().uuid(),
  amount: z.number().int().min(1).max(1_000_000),
  reason: z.string().max(200).optional(),
});

async function requireSuperViaAuth() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("unauthorized");
  const row = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { id: true, role: true },
  });
  if (!row || row.role !== "super_admin") throw new Error("forbidden");
  return row;
}

export async function topUpCredits(input: z.infer<typeof TopUpSchema>) {
  const operator = await requireSuperViaAuth();
  const parsed = TopUpSchema.parse(input);

  const company = await prisma.company.findUnique({
    where: { id: parsed.companyId },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("company not found");

  await prisma.creditLedgerEntry.create({
    data: {
      companyId: parsed.companyId,
      kind: "topup",
      amount: parsed.amount,
      reason: parsed.reason?.trim() || null,
      actorId: operator.id,
    },
  });

  await audit({
    actorId: operator.id,
    companyId: parsed.companyId,
    action: "credits.topup",
    target: `company:${parsed.companyId}`,
    metadata: {
      amount: parsed.amount,
      reason: parsed.reason?.trim() || undefined,
      company_name: company.name,
    },
  });

  revalidatePath("/super/credits");
  revalidatePath(`/super/companies/${parsed.companyId}`);
}
