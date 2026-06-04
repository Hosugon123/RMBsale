import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fail } from "./_lib/http";
import { routes, transactionReverseHandler } from "./_routes/registry";

function normalizePath(req: VercelRequest): string {
  const q = req.query.path;
  if (Array.isArray(q)) return q.map(String).join("/");
  if (typeof q === "string" && q.length > 0) return q;
  return "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = normalizePath(req);
  const method = req.method || "GET";

  const reverseMatch = path.match(/^transactions\/(\d+)\/reverse$/);
  if (reverseMatch) {
    if (method !== "POST") return fail(res, 405, "Method not allowed");
    req.query.id = reverseMatch[1];
    return transactionReverseHandler(req, res);
  }

  const route = routes[path];
  if (!route) return fail(res, 404, "Not found");

  return route(req, res);
}
