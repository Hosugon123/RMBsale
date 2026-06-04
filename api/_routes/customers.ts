import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../_lib/db";
import { fail, ok, readJson, requireUser } from "../_lib/http";
import { customers } from "../_lib/schema";

export async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    requireUser(req);
    const db = getDb();
    if (req.method === "POST") {
      const body = await readJson<{ name: string }>(req);
      const name = body.name.trim();
      const [existing] = await db.select().from(customers).where(eq(customers.name, name));
      if (existing) {
        if (!existing.isActive) {
          await db.update(customers).set({ isActive: true }).where(eq(customers.id, existing.id));
        }
        return ok(res, { customer: existing });
      }
      const [customer] = await db.insert(customers).values({ name }).returning();
      return ok(res, { customer }, 201);
    }
    if (req.method !== "GET") return fail(res, 405, "Method not allowed");
    return ok(res, { customers: await db.select().from(customers).orderBy(asc(customers.name)) });
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 500, error instanceof Error ? error.message : "Customers failed");
  }
}
