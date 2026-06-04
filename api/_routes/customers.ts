import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc } from "drizzle-orm";
import { getDb } from "../_lib/db";
import { fail, ok, requireUser } from "../_lib/http";
import { customers } from "../_lib/schema";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return fail(res, 405, "Method not allowed");
  try {
    requireUser(req);
    const db = getDb();
    return ok(res, { customers: await db.select().from(customers).orderBy(asc(customers.name)) });
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 500, error instanceof Error ? error.message : "Customers failed");
  }
}
