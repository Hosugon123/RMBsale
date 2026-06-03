import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSale } from "./_lib/transactions";
import { fail, getClientMeta, ok, readJson, requireUser } from "./_lib/http";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  try {
    const user = requireUser(req);
    const sale = await createSale(await readJson(req), { id: user.id, ...getClientMeta(req) });
    return ok(res, { sale }, 201);
  } catch (error) {
    return fail(res, error instanceof Error && error.message === "Unauthorized" ? 401 : 400, error instanceof Error ? error.message : "Sale failed");
  }
}
