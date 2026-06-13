// Prisma 6+ config. Replaces the deprecated `package.json#prisma`
// block — same shape, different home. Anything Prisma needs at CLI
// time (seed script, schema path, future migrations options) belongs
// here from now on.
//
// dotenv is imported explicitly so prisma.config.ts itself can read
// .env values when needed (the CLI loads .env separately for actual
// commands, but importing here keeps both paths consistent).

import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
