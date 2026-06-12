"use server";

// Server actions for the Dictionary CRUD.
// All actions validate that the caller is admin of the term's tenant.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin" || !user.companyId) {
    throw new Error("forbidden");
  }
  return user;
}

const TermSchema = z.object({
  term: z.string().min(1).max(80).trim(),
  definition: z.string().min(2).max(1000).trim(),
});

export async function createTerm(data: z.infer<typeof TermSchema>) {
  const user = await requireAdmin();
  const parsed = TermSchema.parse(data);
  await prisma.dictionaryTerm.upsert({
    where: {
      companyId_term: { companyId: user.companyId!, term: parsed.term },
    },
    update: { definition: parsed.definition },
    create: { ...parsed, companyId: user.companyId! },
  });
  revalidatePath("/admin/dictionary");
  revalidatePath("/learn/dictionary");
}

export async function updateTerm(
  id: string,
  data: z.infer<typeof TermSchema>,
) {
  const user = await requireAdmin();
  const parsed = TermSchema.parse(data);
  // Re-verify ownership.
  const existing = await prisma.dictionaryTerm.findFirst({
    where: { id, companyId: user.companyId! },
    select: { id: true },
  });
  if (!existing) throw new Error("not found");
  await prisma.dictionaryTerm.update({
    where: { id },
    data: parsed,
  });
  revalidatePath("/admin/dictionary");
  revalidatePath("/learn/dictionary");
}

export async function deleteTerm(id: string) {
  const user = await requireAdmin();
  const existing = await prisma.dictionaryTerm.findFirst({
    where: { id, companyId: user.companyId! },
    select: { id: true },
  });
  if (!existing) throw new Error("not found");
  await prisma.dictionaryTerm.delete({ where: { id } });
  revalidatePath("/admin/dictionary");
  revalidatePath("/learn/dictionary");
}
