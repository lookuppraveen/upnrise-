// Trainee · Certificate render page.
//
// Rendered as a full-page print-optimized certificate. The learner
// arrives via the "View Certificate" button on the training detail
// page (only shown when they've hit 100% AND the admin turned on
// "Issue certificate" in Step 4 Settings).
//
// No PDF library — the browser's print dialog does the export.
// `@media print` rules hide the download banner, force landscape
// letter, and drop the browser chrome. Trainees click "Print" →
// "Save as PDF" for a portable file.
//
// Gate order:
//   1. Auth + tenant scope
//   2. Training exists and is published
//   3. Admin has issueCertificate=true on the training
//   4. Learner is at 100% completion (uses the same progress helper
//      the rest of the app uses)
// Any failing gate → notFound() so certificate URLs aren't guessable.

import { notFound } from "next/navigation";
import { createHash } from "crypto";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getTrainingProgressForPairs } from "@/lib/db/queries";
import { PrintCertificateButton } from "./PrintCertificateButton";

export const dynamic = "force-dynamic";

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ trainingId: string }>;
}) {
  const { trainingId } = await params;
  const user = (await getSessionUser())!;
  if (!user.companyId) notFound();

  const training = await prisma.training.findFirst({
    where: {
      id: trainingId,
      companyId: user.companyId,
      status: "published",
    },
    select: {
      id: true,
      title: true,
      description: true,
      issueCertificate: true,
      company: {
        select: { name: true, brandColor: true, logoInitials: true },
      },
    },
  });
  if (!training) notFound();
  if (!training.issueCertificate) notFound();

  // 100% completion check — reuses the batched progress helper so we
  // don't reimplement completion semantics here.
  const progressMap = await getTrainingProgressForPairs([
    { userId: user.id, trainingId },
  ]);
  const progress = progressMap.get(`${user.id}:${trainingId}`) ?? 0;
  if (progress < 100) notFound();

  const issuedAt = new Date();
  const certNumber = certificateNumber(user.id, trainingId);
  const learnerName = user.name ?? user.email.split("@")[0];
  const brandColor = training.company.brandColor || "#e85d3a";

  return (
    <div className="min-h-screen bg-surface-2 py-10 px-6 print:bg-white print:p-0">
      {/* Screen-only action bar */}
      <div className="max-w-[1100px] mx-auto mb-6 flex items-center justify-between print:hidden">
        <div>
          <h1 className="font-display text-[22px] leading-none -tracking-[0.01em]">
            Your certificate
          </h1>
          <p className="text-ink-2 text-[13px] mt-1">
            Save it, share it, print it. The browser's print dialog will
            offer "Save as PDF" as an output.
          </p>
        </div>
        <PrintCertificateButton />
      </div>

      {/* The certificate itself */}
      <div className="max-w-[1100px] mx-auto print:max-w-none">
        <div
          className="relative bg-white border border-border shadow-lg rounded-md aspect-[1.414/1] p-16 print:shadow-none print:border-0 print:rounded-none print:aspect-auto print:h-screen"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, rgba(232,93,58,0.06) 0%, transparent 40%), radial-gradient(circle at 85% 80%, rgba(124,92,214,0.06) 0%, transparent 40%)",
          }}
        >
          {/* Corner ornaments */}
          <div
            className="absolute top-6 left-6 w-16 h-16 border-t-4 border-l-4 rounded-tl-lg"
            style={{ borderColor: brandColor }}
            aria-hidden
          />
          <div
            className="absolute top-6 right-6 w-16 h-16 border-t-4 border-r-4 rounded-tr-lg"
            style={{ borderColor: brandColor }}
            aria-hidden
          />
          <div
            className="absolute bottom-6 left-6 w-16 h-16 border-b-4 border-l-4 rounded-bl-lg"
            style={{ borderColor: brandColor }}
            aria-hidden
          />
          <div
            className="absolute bottom-6 right-6 w-16 h-16 border-b-4 border-r-4 rounded-br-lg"
            style={{ borderColor: brandColor }}
            aria-hidden
          />

          <div className="h-full flex flex-col items-center justify-between text-center relative">
            {/* Header — tenant brand chip */}
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-md grid place-items-center text-white font-bold text-[13px]"
                style={{ background: brandColor }}
              >
                {training.company.logoInitials}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-ink-3">
                {training.company.name}
              </div>
            </div>

            {/* Body */}
            <div className="space-y-6 max-w-[720px]">
              <div className="text-[13px] font-semibold uppercase tracking-[0.28em] text-ink-3">
                Certificate of Completion
              </div>
              <div className="text-[15px] text-ink-2">
                This is to certify that
              </div>
              <div
                className="font-display text-[52px] leading-none -tracking-[0.02em]"
                style={{ color: brandColor }}
              >
                {learnerName}
              </div>
              <div className="text-[15px] text-ink-2 leading-[1.6]">
                has successfully completed the training
              </div>
              <div className="font-display text-[28px] leading-tight -tracking-[0.01em] text-ink">
                {training.title}
              </div>
            </div>

            {/* Footer — date + certificate number + signature line */}
            <div className="w-full flex items-end justify-between text-[11.5px] text-ink-3">
              <div className="text-left">
                <div className="border-t border-ink-3/40 pt-1 w-[220px]">
                  Issued
                </div>
                <div className="font-mono text-ink mt-0.5">
                  {issuedAt.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
              <div className="text-right">
                <div className="border-t border-ink-3/40 pt-1 w-[220px] ml-auto">
                  Certificate ID
                </div>
                <div className="font-mono text-ink mt-0.5">{certNumber}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print-only page setup */}
      <style>
        {`
          @media print {
            @page { size: landscape; margin: 0; }
            body { background: white !important; }
          }
        `}
      </style>
    </div>
  );
}

// Deterministic 12-char verification number so the same (user, training)
// pair always renders the same certificate ID — safe to reload without
// generating a fresh cert every visit.
function certificateNumber(userId: string, trainingId: string): string {
  const hash = createHash("sha256")
    .update(`${userId}:${trainingId}:upnrise-cert`)
    .digest("hex");
  return hash.slice(0, 12).toUpperCase();
}
