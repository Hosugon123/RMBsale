import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema.js";

/** Neon HTTP driver does not support transactions; all app code must use this Pool-backed client. */
neonConfig.webSocketConstructor = ws;

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;
export type DbTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

let cachedPool: Pool | null = null;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Set PostgreSQL connection string in environment variables.");
  }

  if (!cachedDb) {
    cachedPool = new Pool({ connectionString: process.env.DATABASE_URL });
    cachedDb = drizzle(cachedPool, { schema });
  }

  return cachedDb;
}
