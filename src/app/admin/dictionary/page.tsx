// Admin · Dictionary  (01_ADMIN.md §Dictionary)
//
// Server fetches the term list + the set of words that already have a
// matching Pronunciation row, and hands off to the client editor. The
// pronunciation cross-link surfaces the connection between this surface
// and /admin/pronunciations (both feed the Coach's vocabulary).

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { DictionaryEditor } from "@/components/admin/DictionaryEditor";

export default async function DictionaryPage() {
  const user = (await getSessionUser())!;
  if (!user.companyId) return null;

  const [terms, pronunciations] = await Promise.all([
    prisma.dictionaryTerm.findMany({
      where: { companyId: user.companyId },
      orderBy: { term: "asc" },
      select: {
        id: true,
        term: true,
        definition: true,
        updatedAt: true,
      },
    }),
    prisma.pronunciation.findMany({
      where: { companyId: user.companyId },
      select: { word: true },
    }),
  ]);

  const pronunciationSet = new Set(
    pronunciations.map((p) => p.word.toLowerCase()),
  );

  return (
    <div className="px-7 pt-6 pb-20 max-w-[960px]">
      <DictionaryEditor
        initial={terms}
        pronunciationSet={Array.from(pronunciationSet)}
      />
    </div>
  );
}
