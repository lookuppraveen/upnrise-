// UPnRise — dev seed
//
// Creates:
//   • 1 test company   — Cyberdyne Systems
//   • 3 users          — super_admin, admin (Cyberdyne), trainee (Cyberdyne)
//   • 2 trainings      — "Cold-call discovery", "Handling pricing objections"
//   • 5 modules        — including 2 roleplay modules with personas + rubrics
//   • 1 assignment     — pushes the discovery training to the trainee
//   • 5 dictionary terms
//
// All users share password `password123`. Idempotent — re-run safely.
//
// Run:  npm run db:seed

import {
  PrismaClient,
  Role,
  type Prisma,
} from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env",
  );
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "password123";

// Fixed UUIDs so re-seeds are idempotent without name-based lookups.
const IDS = {
  cyberdyne: "00000000-0000-0000-0000-000000000001",
  trainingDiscovery: "00000000-0000-0000-0000-000000000101",
  trainingPricing: "00000000-0000-0000-0000-000000000102",
  modDiscoveryVideo: "00000000-0000-0000-0000-000000000201",
  modDiscoveryRoleplay: "00000000-0000-0000-0000-000000000202",
  modDiscoveryQuiz: "00000000-0000-0000-0000-000000000203",
  modPricingVideo: "00000000-0000-0000-0000-000000000211",
  modPricingRoleplay: "00000000-0000-0000-0000-000000000212",
  // Super-admin plans
  planStarter: "00000000-0000-0000-0000-000000000301",
  planGrowth: "00000000-0000-0000-0000-000000000302",
  planEnterprise: "00000000-0000-0000-0000-000000000303",
  // Other companies
  acme: "00000000-0000-0000-0000-000000000011",
  initech: "00000000-0000-0000-0000-000000000012",
  stark: "00000000-0000-0000-0000-000000000013",
  hooli: "00000000-0000-0000-0000-000000000014",
  piedPiper: "00000000-0000-0000-0000-000000000015",
} as const;

type SeedUser = {
  email: string;
  name: string;
  role: Role;
  companyName?: string;
};

const USERS: SeedUser[] = [
  { email: "super@upnrise.local", name: "Super Admin", role: "super_admin" },
  {
    email: "admin@cyberdyne.local",
    name: "Cyberdyne Admin",
    role: "admin",
    companyName: "Cyberdyne Systems",
  },
  {
    email: "trainee@cyberdyne.local",
    name: "Cyberdyne Trainee",
    role: "trainee",
    companyName: "Cyberdyne Systems",
  },
];

// ───────────── Auth helpers ─────────────

async function ensureAuthUser(email: string, name: string): Promise<string> {
  const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (existing.error) throw existing.error;

  const found = existing.data.users.find((u) => u.email === email);
  if (found) {
    await admin.auth.admin.updateUserById(found.id, {
      password: PASSWORD,
      user_metadata: { name },
      email_confirm: true,
    });
    return found.id;
  }
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  });
  if (created.error) throw created.error;
  return created.data.user!.id;
}

// ───────────── Rubrics ─────────────
// Shape consumed by the scoring Claude call in Phase 2.4.

const DISCOVERY_RUBRIC: Prisma.InputJsonValue = {
  pass_score: 70,
  criteria: [
    {
      id: "rapport",
      label: "Built rapport",
      weight: 0.2,
      description:
        "Opened with warmth, used the buyer's name, mirrored tone.",
    },
    {
      id: "discovery",
      label: "Discovered pain",
      weight: 0.35,
      description:
        "Asked 3+ open-ended questions; named the specific business problem.",
    },
    {
      id: "qualification",
      label: "Qualified BANT",
      weight: 0.25,
      description: "Surfaced budget, authority, need, and timeline.",
    },
    {
      id: "next_step",
      label: "Secured next step",
      weight: 0.2,
      description:
        "Booked a follow-up with a specific time and decision-maker.",
    },
  ],
};

const PRICING_RUBRIC: Prisma.InputJsonValue = {
  pass_score: 70,
  criteria: [
    {
      id: "acknowledge",
      label: "Acknowledged objection",
      weight: 0.2,
      description: "Did not dismiss; reflected the buyer's concern back.",
    },
    {
      id: "value",
      label: "Reframed value",
      weight: 0.35,
      description:
        "Tied price to a quantified business outcome, not features.",
    },
    {
      id: "anchor",
      label: "Held the anchor",
      weight: 0.25,
      description: "Did not discount on first ask; preserved deal economics.",
    },
    {
      id: "close",
      label: "Asked for the close",
      weight: 0.2,
      description: "Proposed a clear path to signature within 14 days.",
    },
  ],
};

// ───────────── Main ─────────────

async function main() {
  // -------- Company --------
  console.log("→ Cyberdyne Systems");
  const cyberdyne = await prisma.company.upsert({
    where: { id: IDS.cyberdyne },
    update: {},
    create: {
      id: IDS.cyberdyne,
      name: "Cyberdyne Systems",
      logoInitials: "CY",
      brandColor: "#5b2eea",
      industry: "Robotics & AI",
      region: "AMER",
      seats: 250,
      since: new Date("2024-03-12"),
    },
  });

  // -------- Users --------
  let traineeId = "";
  for (const u of USERS) {
    const authId = await ensureAuthUser(u.email, u.name);
    const companyId =
      u.companyName === "Cyberdyne Systems" ? cyberdyne.id : null;
    await prisma.user.upsert({
      where: { id: authId },
      update: { email: u.email, name: u.name, role: u.role, companyId },
      create: {
        id: authId,
        email: u.email,
        name: u.name,
        role: u.role,
        companyId,
      },
    });
    if (u.role === "trainee") traineeId = authId;
    console.log(`  ✓ ${u.role}: ${u.email}`);
  }

  // -------- Org structure (Zone → HQ → Team) --------
  console.log("→ Org structure");
  const zones: Record<string, string> = {};
  for (const name of ["West", "South", "North", "East"]) {
    const z = await prisma.zone.upsert({
      where: { companyId_name: { companyId: cyberdyne.id, name } },
      update: {},
      create: { companyId: cyberdyne.id, name },
    });
    zones[name] = z.id;
  }

  const hqs: Record<string, string> = {};
  const hqSpec: Array<{ name: string; city: string; zone: string }> = [
    { name: "Mumbai HQ", city: "Mumbai", zone: "West" },
    { name: "Pune HQ", city: "Pune", zone: "West" },
    { name: "Bangalore HQ", city: "Bengaluru", zone: "South" },
    { name: "Chennai HQ", city: "Chennai", zone: "South" },
    { name: "Delhi HQ", city: "Delhi", zone: "North" },
    { name: "Kolkata HQ", city: "Kolkata", zone: "East" },
  ];
  for (const h of hqSpec) {
    const row = await prisma.hQ.upsert({
      where: { companyId_name: { companyId: cyberdyne.id, name: h.name } },
      update: { zoneId: zones[h.zone], city: h.city },
      create: {
        companyId: cyberdyne.id,
        name: h.name,
        city: h.city,
        zoneId: zones[h.zone],
      },
    });
    hqs[h.name] = row.id;
  }

  const teams: Record<string, string> = {};
  const teamSpec: Array<{ name: string; hq: string }> = [
    { name: "Cardio BD", hq: "Mumbai HQ" },
    { name: "Onco BD", hq: "Mumbai HQ" },
    { name: "Diabetes BD", hq: "Pune HQ" },
    { name: "Cardio BD South", hq: "Bangalore HQ" },
    { name: "Onco BD South", hq: "Bangalore HQ" },
    { name: "Hospital Sales", hq: "Chennai HQ" },
    { name: "Cardio BD North", hq: "Delhi HQ" },
    { name: "Diabetes BD East", hq: "Kolkata HQ" },
  ];
  for (const t of teamSpec) {
    const row = await prisma.team.upsert({
      where: { companyId_name: { companyId: cyberdyne.id, name: t.name } },
      update: { hqId: hqs[t.hq] },
      create: {
        companyId: cyberdyne.id,
        name: t.name,
        hqId: hqs[t.hq],
      },
    });
    teams[t.name] = row.id;
  }

  // Assign the existing Cyberdyne trainee to one team so the rollups
  // have at least one populated cell to render.
  if (traineeId) {
    await prisma.user.update({
      where: { id: traineeId },
      data: { teamId: teams["Cardio BD South"] },
    });
  }
  console.log(
    `  ✓ ${Object.keys(zones).length} zones · ${Object.keys(hqs).length} HQs · ${Object.keys(teams).length} teams`,
  );

  // -------- Trainings --------
  console.log("→ Trainings");
  const discovery = await prisma.training.upsert({
    where: { id: IDS.trainingDiscovery },
    update: {},
    create: {
      id: IDS.trainingDiscovery,
      companyId: cyberdyne.id,
      title: "Cold-call discovery",
      description:
        "Run a structured first call: build rapport, surface pain, qualify, and book the next step.",
      categories: ["Sales", "Discovery"],
      status: "published",
      houseStyleMatch: 92,
    },
  });

  const pricing = await prisma.training.upsert({
    where: { id: IDS.trainingPricing },
    update: {},
    create: {
      id: IDS.trainingPricing,
      companyId: cyberdyne.id,
      title: "Handling pricing objections",
      description:
        "When the buyer flinches at the number — reframe to value, hold the anchor, and ask for the close.",
      categories: ["Sales", "Objection handling"],
      status: "published",
      houseStyleMatch: 88,
    },
  });
  console.log(`  ✓ ${discovery.title}`);
  console.log(`  ✓ ${pricing.title}`);

  // -------- Modules --------
  console.log("→ Modules");
  await prisma.trainingModule.upsert({
    where: { id: IDS.modDiscoveryVideo },
    update: {},
    create: {
      id: IDS.modDiscoveryVideo,
      trainingId: discovery.id,
      name: "Anatomy of a great first call (video)",
      type: "video",
      order: 0,
      published: true,
      aiScore: 90,
      body: { duration_min: 7 },
    },
  });

  await prisma.trainingModule.upsert({
    where: { id: IDS.modDiscoveryRoleplay },
    update: {},
    create: {
      id: IDS.modDiscoveryRoleplay,
      trainingId: discovery.id,
      name: "Roleplay: discovery call with a skeptical buyer",
      type: "roleplay",
      order: 1,
      published: true,
      aiScore: 94,
    },
  });

  await prisma.trainingModule.upsert({
    where: { id: IDS.modDiscoveryQuiz },
    update: {},
    create: {
      id: IDS.modDiscoveryQuiz,
      trainingId: discovery.id,
      name: "Knowledge check",
      type: "quiz",
      order: 2,
      published: true,
      body: {
        questions: [
          {
            q: "Which is the strongest discovery question?",
            options: [
              "How big is your team?",
              "What does success look like 90 days from now?",
              "Do you use a CRM?",
            ],
            answer: 1,
          },
        ],
      },
    },
  });

  await prisma.trainingModule.upsert({
    where: { id: IDS.modPricingVideo },
    update: {},
    create: {
      id: IDS.modPricingVideo,
      trainingId: pricing.id,
      name: "Why prospects say 'too expensive'",
      type: "video",
      order: 0,
      published: true,
      aiScore: 87,
      body: { duration_min: 9 },
    },
  });

  await prisma.trainingModule.upsert({
    where: { id: IDS.modPricingRoleplay },
    update: {},
    create: {
      id: IDS.modPricingRoleplay,
      trainingId: pricing.id,
      name: "Roleplay: 'It's 30% over budget' — hold the line",
      type: "roleplay",
      order: 1,
      published: true,
      aiScore: 91,
    },
  });

  // -------- Roleplay configs --------
  console.log("→ Roleplay configs");
  await prisma.roleplayConfig.upsert({
    where: { moduleId: IDS.modDiscoveryRoleplay },
    update: { rubric: DISCOVERY_RUBRIC },
    create: {
      moduleId: IDS.modDiscoveryRoleplay,
      persona:
        "Priya, VP of Operations at a 400-person logistics company. Direct, time-pressured, skeptical of vendor pitches. Speaks in short sentences.",
      scenario:
        "First cold call. The learner has 5 minutes. Priya picks up because their analyst flagged the company's name in a research doc.",
      mode: "text",
      rubric: DISCOVERY_RUBRIC,
      systemPrompt:
        "Stay in character as Priya. Do not break character or coach the learner. End the call naturally after about 12 exchanges or when the learner explicitly asks for a next step.",
    },
  });

  await prisma.roleplayConfig.upsert({
    where: { moduleId: IDS.modPricingRoleplay },
    update: { rubric: PRICING_RUBRIC },
    create: {
      moduleId: IDS.modPricingRoleplay,
      persona:
        "Marcus, Director of IT at a regional bank. Cost-conscious, methodical, will quote board pressure. Asks for discount within first 3 turns.",
      scenario:
        "Mid-funnel pricing call. Learner has presented the proposal; Marcus opens by saying the number is 30% over what his board approved.",
      mode: "text",
      rubric: PRICING_RUBRIC,
      systemPrompt:
        "Stay in character as Marcus. Push back on price at least twice. Soften only if the learner reframes to a quantified business outcome.",
    },
  });

  // -------- Assignment --------
  console.log("→ Assignment for trainee");
  if (traineeId) {
    // Upsert needs a composite unique; we don't have one, so use findFirst + create.
    const existing = await prisma.assignment.findFirst({
      where: { userId: traineeId, trainingId: discovery.id },
    });
    if (!existing) {
      await prisma.assignment.create({
        data: {
          userId: traineeId,
          trainingId: discovery.id,
          status: "in_progress",
          priority: "p1",
          progress: 25,
          dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7d
          aiReason:
            "You're new to discovery calls and your last quiz on BANT scored 60%. Start here.",
        },
      });
    }
    console.log("  ✓ Cold-call discovery → trainee (p1, due in 7d)");
  }

  // -------- Dictionary --------
  console.log("→ Dictionary");
  const terms: Array<{ term: string; definition: string }> = [
    { term: "BANT", definition: "Budget, Authority, Need, Timeline — the four qualification axes." },
    { term: "MEDDIC", definition: "Metrics, Economic buyer, Decision criteria, Decision process, Identify pain, Champion." },
    { term: "ICP", definition: "Ideal Customer Profile — the segment most likely to buy and succeed." },
    { term: "House style", definition: "Cyberdyne's internal voice: direct, evidence-backed, no jargon outside acronyms in this dictionary." },
    { term: "Anchor", definition: "The first price quoted in a negotiation; sets the reference point for all subsequent moves." },
  ];
  for (const t of terms) {
    await prisma.dictionaryTerm.upsert({
      where: {
        companyId_term: { companyId: cyberdyne.id, term: t.term },
      },
      update: { definition: t.definition },
      create: { ...t, companyId: cyberdyne.id },
    });
  }
  console.log(`  ✓ ${terms.length} terms`);

  // -------- Pronunciations --------
  console.log("→ Pronunciations");
  const pronunciations: Array<{
    word: string;
    phonetic: string;
    mnemonic: string;
    notes: string | null;
    generatedByAi: boolean;
  }> = [
    {
      word: "MEDDIC",
      phonetic: "MED-ick",
      mnemonic: "Like 'medic' but with two D's. Stress the first syllable.",
      notes: "Sales qualification framework. Acronym, not a Latin word.",
      generatedByAi: false,
    },
    {
      word: "Cyberdyne",
      phonetic: "SIGH-ber-dyne",
      mnemonic: "Cyber + dyne (rhymes with 'shine').",
      notes: "Our company name. The 'dyne' is hard, not 'din'.",
      generatedByAi: false,
    },
    {
      word: "BANT",
      phonetic: "bant",
      mnemonic: "One syllable. Rhymes with 'ant'.",
      notes: null,
      generatedByAi: true,
    },
  ];
  for (const p of pronunciations) {
    await prisma.pronunciation.upsert({
      where: { companyId_word: { companyId: cyberdyne.id, word: p.word } },
      update: {
        phonetic: p.phonetic,
        mnemonic: p.mnemonic,
        notes: p.notes,
        generatedByAi: p.generatedByAi,
      },
      create: { ...p, companyId: cyberdyne.id },
    });
  }
  console.log(`  ✓ ${pronunciations.length} entries`);

  // -------- Saved reports (example shells; scheduler not wired yet) --------
  console.log("→ Saved reports");
  const adminId = (
    await prisma.user.findFirst({
      where: { companyId: cyberdyne.id, role: "admin" },
      select: { id: true },
    })
  )?.id;
  if (adminId) {
    const reports: Array<{
      name: string;
      kind: "trainings" | "learners" | "sessions" | "zone";
      cadence: "manual" | "weekly" | "monthly";
      recipients: string[];
    }> = [
      {
        name: "Weekly performance brief",
        kind: "sessions",
        cadence: "weekly",
        recipients: ["admin@cyberdyne.local"],
      },
      {
        name: "Monthly zone scorecard",
        kind: "zone",
        cadence: "monthly",
        recipients: [],
      },
    ];
    for (const r of reports) {
      const existing = await prisma.savedReport.findFirst({
        where: { companyId: cyberdyne.id, name: r.name },
        select: { id: true },
      });
      if (!existing) {
        await prisma.savedReport.create({
          data: {
            companyId: cyberdyne.id,
            createdById: adminId,
            name: r.name,
            kind: r.kind,
            cadence: r.cadence,
            recipients: r.recipients,
          },
        });
      }
    }
    console.log(`  ✓ ${reports.length} reports`);
  }

  // -------- Plans + fake tenants for Super Admin view --------
  await seedSuperAdminFixtures(cyberdyne.id);

  console.log("\n✓ Seed complete.\n");
  console.log("Test credentials (password: password123):");
  for (const u of USERS) console.log(`  ${u.role.padEnd(11)} ${u.email}`);
}

// ───────────── Super-admin fixtures ─────────────
// 3 plans + 5 fake tenants subscribed to them. Cyberdyne stays on Growth.

async function seedSuperAdminFixtures(cyberdyneId: string) {
  console.log("→ Plans");
  const starter = await prisma.plan.upsert({
    where: { id: IDS.planStarter },
    update: {},
    create: {
      id: IDS.planStarter,
      name: "Starter",
      color: "#2f80f5",
      priceCents: 4900,
      cycle: "monthly",
      setupCredits: 500,
      seatsMin: 1,
      seatsMax: 50,
      trialDays: 14,
      features: [
        "Up to 50 seats",
        "Text roleplays",
        "Standard rubrics",
        "Email support",
      ],
      limits: {
        aiMinutesPerUser: 30,
        voice: false,
        video: false,
        customPersonas: 5,
        integrations: ["slack"],
      },
      sortOrder: 1,
    },
  });
  const growth = await prisma.plan.upsert({
    where: { id: IDS.planGrowth },
    update: {},
    create: {
      id: IDS.planGrowth,
      name: "Growth",
      color: "#e85d3a",
      priceCents: 8900,
      cycle: "monthly",
      setupCredits: 2000,
      seatsMin: 25,
      seatsMax: 500,
      trialDays: 14,
      features: [
        "Up to 500 seats",
        "Text + voice roleplays",
        "Custom rubrics",
        "AI Copilot tool-use",
        "Priority support",
      ],
      limits: {
        aiMinutesPerUser: 120,
        voice: true,
        video: false,
        customPersonas: 25,
        integrations: ["slack", "salesforce", "hubspot"],
      },
      badge: "Most popular",
      sortOrder: 2,
    },
  });
  const enterprise = await prisma.plan.upsert({
    where: { id: IDS.planEnterprise },
    update: {},
    create: {
      id: IDS.planEnterprise,
      name: "Enterprise",
      color: "#1a1a1a",
      priceCents: 0, // custom
      cycle: "annual",
      setupCredits: 10000,
      seatsMin: 250,
      seatsMax: null,
      trialDays: 0,
      features: [
        "Unlimited seats",
        "Voice + video roleplays",
        "Custom personas + integrations",
        "Dedicated CSM",
        "SSO + audit log export",
      ],
      limits: {
        aiMinutesPerUser: 600,
        voice: true,
        video: true,
        customPersonas: -1,
        integrations: ["slack", "salesforce", "hubspot", "okta", "workday"],
      },
      badge: "Enterprise",
      sortOrder: 3,
    },
  });
  console.log(`  ✓ ${starter.name}, ${growth.name}, ${enterprise.name}`);

  // Cyberdyne — make sure it has commercial metadata + Growth subscription.
  console.log("→ Cyberdyne commercial");
  await prisma.company.update({
    where: { id: cyberdyneId },
    data: {
      csm: "morgan@upnrise.com",
      churnRisk: 18,
      expandScore: 72,
      growthPct: 23,
      aiSpendCents: 48000,
    },
  });
  await prisma.subscription.upsert({
    where: { companyId: cyberdyneId },
    update: {},
    create: {
      companyId: cyberdyneId,
      planId: growth.id,
      status: "active",
      seats: 220,
      startedAt: new Date("2024-03-12"),
      renewalAt: new Date("2026-09-12"),
    },
  });
  await seedCreditLedger(
    cyberdyneId,
    growth.setupCredits,
    48000, // aiSpendCents — drives demo consumption rows
  );

  // 5 fake tenants. Each gets fake trainees so user counts look real.
  const fakeTenants: Array<{
    id: string;
    name: string;
    logoInitials: string;
    brandColor: string;
    industry: string;
    region: "AMER" | "EMEA" | "APAC";
    seats: number;
    fakeTraineeCount: number;
    health: "healthy" | "watch" | "at_risk";
    csm: string;
    churnRisk: number;
    expandScore: number;
    growthPct: number;
    aiSpendCents: number;
    planId: string;
    priceOverrideCents?: number;
    status: "active" | "trialing" | "past_due";
    since: string;
    renewalIn: number; // months ahead
  }> = [
    {
      id: IDS.acme,
      name: "Acme Robotics",
      logoInitials: "AR",
      brandColor: "#2f80f5",
      industry: "Industrial robotics",
      region: "EMEA",
      seats: 640,
      fakeTraineeCount: 12,
      health: "healthy",
      csm: "kira@upnrise.com",
      churnRisk: 8,
      expandScore: 88,
      growthPct: 35,
      aiSpendCents: 124000,
      planId: enterprise.id,
      priceOverrideCents: 12500,
      status: "active",
      since: "2023-07-04",
      renewalIn: 8,
    },
    {
      id: IDS.initech,
      name: "Initech",
      logoInitials: "IN",
      brandColor: "#c97a1b",
      industry: "Banking software",
      region: "AMER",
      seats: 38,
      fakeTraineeCount: 6,
      health: "watch",
      csm: "morgan@upnrise.com",
      churnRisk: 52,
      expandScore: 34,
      growthPct: -8,
      aiSpendCents: 9200,
      planId: starter.id,
      status: "past_due",
      since: "2025-01-22",
      renewalIn: 1,
    },
    {
      id: IDS.stark,
      name: "Stark Industries",
      logoInitials: "SI",
      brandColor: "#c5392f",
      industry: "Aerospace & defense",
      region: "AMER",
      seats: 1240,
      fakeTraineeCount: 18,
      health: "healthy",
      csm: "kira@upnrise.com",
      churnRisk: 4,
      expandScore: 94,
      growthPct: 41,
      aiSpendCents: 318000,
      planId: enterprise.id,
      priceOverrideCents: 14800,
      status: "active",
      since: "2022-11-30",
      renewalIn: 5,
    },
    {
      id: IDS.hooli,
      name: "Hooli",
      logoInitials: "HO",
      brandColor: "#5b2eea",
      industry: "Consumer tech",
      region: "AMER",
      seats: 410,
      fakeTraineeCount: 10,
      health: "at_risk",
      csm: "alex@upnrise.com",
      churnRisk: 78,
      expandScore: 22,
      growthPct: -14,
      aiSpendCents: 67000,
      planId: growth.id,
      status: "active",
      since: "2024-10-08",
      renewalIn: 2,
    },
    {
      id: IDS.piedPiper,
      name: "Pied Piper",
      logoInitials: "PP",
      brandColor: "#1aa260",
      industry: "Cloud infra",
      region: "AMER",
      seats: 24,
      fakeTraineeCount: 4,
      health: "healthy",
      csm: "alex@upnrise.com",
      churnRisk: 12,
      expandScore: 68,
      growthPct: 220,
      aiSpendCents: 4800,
      planId: starter.id,
      status: "trialing",
      since: "2026-04-15",
      renewalIn: 1,
    },
  ];

  console.log("→ Fake tenants for Super Admin");
  for (const t of fakeTenants) {
    await prisma.company.upsert({
      where: { id: t.id },
      update: {
        csm: t.csm,
        churnRisk: t.churnRisk,
        expandScore: t.expandScore,
        growthPct: t.growthPct,
        aiSpendCents: t.aiSpendCents,
        health: t.health,
        seats: t.seats,
      },
      create: {
        id: t.id,
        name: t.name,
        logoInitials: t.logoInitials,
        brandColor: t.brandColor,
        industry: t.industry,
        region: t.region,
        seats: t.seats,
        health: t.health,
        since: new Date(t.since),
        csm: t.csm,
        churnRisk: t.churnRisk,
        expandScore: t.expandScore,
        growthPct: t.growthPct,
        aiSpendCents: t.aiSpendCents,
      },
    });

    await prisma.subscription.upsert({
      where: { companyId: t.id },
      update: {
        planId: t.planId,
        status: t.status,
        seats: t.seats,
        priceOverrideCents: t.priceOverrideCents ?? null,
      },
      create: {
        companyId: t.id,
        planId: t.planId,
        status: t.status,
        seats: t.seats,
        priceOverrideCents: t.priceOverrideCents ?? null,
        startedAt: new Date(t.since),
        renewalAt: new Date(
          Date.now() + t.renewalIn * 30 * 24 * 60 * 60 * 1000,
        ),
      },
    });

    // Fake trainees so user counts look right on the grid.
    // Use deterministic UUIDs prefixed by the tenant id chunk so re-runs are
    // idempotent.
    const tenantSuffix = t.id.slice(-4);
    for (let i = 0; i < t.fakeTraineeCount; i++) {
      const fakeId = `f0000000-0000-0000-0000-${tenantSuffix}${String(i).padStart(8, "0")}`;
      await prisma.user.upsert({
        where: { id: fakeId },
        update: {},
        create: {
          id: fakeId,
          email: `trainee-${i + 1}@${t.name.toLowerCase().replace(/[^a-z]/g, "")}.local`,
          name: null,
          role: "trainee",
          companyId: t.id,
        },
      });
    }
    // Credit ledger — initial setup grant + sample consumption.
    const plan = await prisma.plan.findUnique({ where: { id: t.planId } });
    if (plan) {
      await seedCreditLedger(t.id, plan.setupCredits, t.aiSpendCents);
    }

    console.log(
      `  ✓ ${t.name.padEnd(20)} ${t.region} · ${t.health.padEnd(8)} · ${t.fakeTraineeCount} fake trainees`,
    );
  }
}

/**
 * Seed an initial `setup` grant + a handful of `ai_consumption` rows so the
 * Credits & Billing surface has realistic data. Idempotent: only writes if
 * the tenant has zero ledger entries.
 *
 * Consumption total matches the legacy stub `Math.round(aiSpendCents/100 * 4)`
 * (capped at the grant) so the % used bar lands where the old derived value
 * placed it.
 */
async function seedCreditLedger(
  companyId: string,
  setupCredits: number,
  aiSpendCents: number,
) {
  const existing = await prisma.creditLedgerEntry.count({ where: { companyId } });
  if (existing > 0) return;

  // Setup grant — dated to the tenant's start. We use createdAt: now since
  // we don't backfill explicit dates here.
  await prisma.creditLedgerEntry.create({
    data: {
      companyId,
      kind: "setup",
      amount: setupCredits,
      reason: "Initial setup grant",
    },
  });

  if (setupCredits <= 0) return;

  const totalConsumed = Math.min(
    setupCredits,
    Math.round((aiSpendCents / 100) * 4),
  );
  if (totalConsumed <= 0) return;

  // Split into ~4 consumption rows for a realistic trail.
  const chunks = 4;
  const per = Math.floor(totalConsumed / chunks);
  const remainder = totalConsumed - per * chunks;
  for (let i = 0; i < chunks; i++) {
    const amount = per + (i === chunks - 1 ? remainder : 0);
    if (amount <= 0) continue;
    await prisma.creditLedgerEntry.create({
      data: {
        companyId,
        kind: "ai_consumption",
        amount: -amount,
        reason: `AI usage · period ${i + 1}/${chunks}`,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
