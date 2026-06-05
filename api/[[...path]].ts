import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fail, methodNotAllowed, notFound } from "./_lib/http.js";
import { routes, transactionReverseHandler } from "./_routes/registry.js";

function normalizePath(req: VercelRequest): string {
  const q = req.query.path;
  if (Array.isArray(q)) return q.map(String).join("/");
  if (typeof q === "string" && q.length > 0) return q;

  const rawUrl = typeof req.url === "string" ? req.url : "";
  const pathname = rawUrl.split("?")[0] ?? "";
  const apiMatch = pathname.match(/\/api\/(.+)$/);
  if (apiMatch?.[1]) return decodeURIComponent(apiMatch[1]);

  return "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = normalizePath(req);
  const method = req.method || "GET";

  const reverseMatch = path.match(/^transactions\/(\d+)\/reverse$/);
  if (reverseMatch) {
    if (method !== "POST") return methodNotAllowed(res);
    req.query.id = reverseMatch[1];
    return transactionReverseHandler(req, res);
  }

  const route = routes[path];
  if (!route) return notFound(res);

  return route(req, res);
}
