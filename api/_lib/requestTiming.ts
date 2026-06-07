import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "./request.js";

export function routeTimingLabel(req: VercelRequest, routePath?: string) {
  const method = req.method ?? "GET";
  const path = routePath ?? String(req.query.path ?? req.url ?? "unknown");
  return `[api] ${method} ${path}`;
}

export function withRouteTiming<T>(
  req: VercelRequest,
  routePath: string | undefined,
  run: () => Promise<T>
): Promise<T> {
  const label = routeTimingLabel(req, routePath);
  console.time(label);
  return run().finally(() => {
    console.timeEnd(label);
  });
}

export function attachApiTimingMiddleware(
  handler: (req: VercelRequest, res: VercelResponse, routePath: string) => Promise<unknown>
) {
  return async (req: VercelRequest, res: VercelResponse, routePath: string) => {
    return withRouteTiming(req, routePath, () => handler(req, res, routePath));
  };
}
