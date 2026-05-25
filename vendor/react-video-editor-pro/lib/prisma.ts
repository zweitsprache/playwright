// Prisma client singleton for the vendor app.
// Resolves @prisma/client from the outer workspace's node_modules.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __rvePrismaPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __rvePrisma: PrismaClient | undefined;
}

const pool =
  global.__rvePrismaPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

const adapter = new PrismaPg(pool);

export const prisma =
  global.__rvePrisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__rvePrismaPool = pool;
  global.__rvePrisma = prisma;
}
