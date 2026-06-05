import type { Request, Response } from "express";
import type { HttpRequest, HttpResponse } from "../api/_lib/request.js";

function normalizeQuery(req: Request, pathOverride?: string): Record<string, string | string[] | undefined> {
  const query: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (value === undefined) continue;
    query[key] = Array.isArray(value) ? value.map(String) : String(value);
  }
  if (pathOverride !== undefined) query.path = pathOverride;
  return query;
}

export function asHttpRequest(req: Request, pathOverride?: string): HttpRequest {
  return {
    method: req.method,
    url: req.originalUrl || req.url,
    headers: req.headers as Record<string, string | string[] | undefined>,
    body: req.body,
    query: normalizeQuery(req, pathOverride),
    socket: { remoteAddress: req.socket.remoteAddress ?? null }
  };
}

export function asHttpResponse(res: Response): HttpResponse {
  return res as unknown as HttpResponse;
}
