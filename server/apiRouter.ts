import { Router } from "express";
import { routes, transactionReverseHandler } from "../api/_routes/registry.js";
import { methodNotAllowed, notFound } from "../api/_lib/http.js";
import { asHttpRequest, asHttpResponse } from "./httpAdapter.js";

export function createApiRouter() {
  const router = Router();

  router.post("/transactions/:id/reverse", async (req, res, next) => {
    try {
      if (req.method !== "POST") {
        methodNotAllowed(asHttpResponse(res));
        return;
      }
      req.query.id = req.params.id;
      await transactionReverseHandler(asHttpRequest(req), asHttpResponse(res));
    } catch (error) {
      next(error);
    }
  });

  for (const [path, handler] of Object.entries(routes)) {
    router.all(`/${path}`, async (req, res, next) => {
      try {
        await handler(asHttpRequest(req, path), asHttpResponse(res));
      } catch (error) {
        next(error);
      }
    });
  }

  router.use((_req, res) => {
    notFound(asHttpResponse(res));
  });

  return router;
}
