import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { parseBootstrapSections } from "../_lib/bootstrapSections.js";
import { loadBootstrapState, loadFullBootstrapState } from "../_lib/bootstrap.js";
import { ok, loadAuthUser, methodNotAllowed, handleRouteError } from "../_lib/http.js";
import { withRouteTiming } from "../_lib/requestTiming.js";

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return methodNotAllowed(res);
  return withRouteTiming(req, "bootstrap", async () => {
    try {
      const user = await loadAuthUser(req);
      const sections = parseBootstrapSections(req.query.sections);
      const ledgerMode = req.query.ledgerMode === "full" ? "full" : "recent";
      const state = sections
        ? await loadBootstrapState(user.id, sections, { ledgerMode })
        : await loadFullBootstrapState(user.id);
      return ok(res, { state, user, partial: Boolean(sections) });
    } catch (error) {
      return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 500 });
    }
  });
}
