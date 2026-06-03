import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Create a Neon database and set it in Vercel.");
  }

  if (!cachedDb) {
    const sql = neon(process.env.DATABASE_URL);
    cachedDb = drizzle(sql, { schema });
  }

  return cachedDb;
}
