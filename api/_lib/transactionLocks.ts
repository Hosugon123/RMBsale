import { sql } from "drizzle-orm";
import type { DbTx } from "./db.js";

/** Serialize transactions that mutate the same business resource. */
export async function lockTransactionResources(tx: DbTx, ...resources: string[]) {
  for (const key of [...new Set(["0:accounting-write", ...resources])].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
}
