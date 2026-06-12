// Prisma client singleton. In dev, HMR can create many clients; cache on globalThis.
// See https://www.prisma.io/docs/orm/more/help-and-troubleshooting/nextjs-help

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
