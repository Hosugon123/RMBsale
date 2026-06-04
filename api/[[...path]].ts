import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fail } from "./_lib/http.js";
import type { RouteHandler } from "./_routes/registry.js";

function normalizePath(req: VercelRequest): string {
  const q = req.query.path;
  if (Array.isArray(q)) return q.map(String).join("/");
  if (typeof q === "string" && q.length > 0) return q;
  return "";
}

const routeLoaders: Record<string, () => Promise<{ handler: RouteHandler }>> = {
  accounts: () => import("./_routes/accounts.js"),
  adjustments: () => import("./_routes/adjustments.js"),
  dashboard: () => import("./_routes/dashboard.js"),
  customers: () => import("./_routes/customers.js"),
  ledger: () => import("./_routes/ledger.js"),
  purchases: () => import("./_routes/purchases.js"),
  receivables: () => import("./_routes/receivables.js"),
  sales: () => import("./_routes/sales.js"),
  settlements: () => import("./_routes/settlements.js"),
  transfers: () => import("./_routes/transfers.js"),
  holders: () => import("./_routes/holders.js")
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = normalizePath(req);
  const method = req.method || "GET";

  const reverseMatch = path.match(/^transactions\/(\d+)\/reverse$/);
  if (reverseMatch) {
    if (method !== "POST") return fail(res, 405, "Method not allowed");
    req.query.id = reverseMatch[1];
    const mod = await import("./_routes/transaction-reverse.js");
    return mod.handler(req, res);
  }

  const load = routeLoaders[path];
  if (!load) return fail(res, 404, "Not found");

  const mod = await load();
  return mod.handler(req, res);
}
