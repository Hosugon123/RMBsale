import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc } from "drizzle-orm";
import { getDb } from "../_lib/db.js";
import { fail, ok, readJson, requireUser } from "../_lib/http.js";
import { createHolderRecord } from "../_lib/transactions.js";
import { holders } from "../_lib/schema.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    requireUser(req);
    const db = getDb();
    if (req.method === "GET") {
      return ok(res, { holders: await db.select().from(holders).orderBy(asc(holders.name)) });
    }
    if (req.method === "POST") {
      const body = await readJson<{ name: string }>(req);
      const holder = await createHolderRecord(body);
      return ok(res, { holder }, 201);
    }
    return fail(res, 405, "Method not allowed");
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 400, error instanceof Error ? error.message : "Holders failed");
  }
}
