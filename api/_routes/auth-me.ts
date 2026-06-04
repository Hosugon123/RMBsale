import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fail, ok, requireUser } from "../_lib/http.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return fail(res, 405, "Method not allowed");
  try {
    return ok(res, { user: requireUser(req) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized" || message.includes("jwt")) {
      return ok(res, { user: null });
    }
    return fail(res, 500, message || "Auth check failed");
  }
}
