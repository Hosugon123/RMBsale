/** Express / Cloud Run 共用的 HTTP 型別（取代 @vercel/node）。 */
export interface HttpRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
}

export interface HttpResponse {
  status(code: number): HttpResponse;
  json(data: unknown): unknown;
  send(data: string): unknown;
  setHeader(name: string, value: string | string[]): void;
}

/** 與既有 handler 簽名相容的別名 */
export type VercelRequest = HttpRequest;
export type VercelResponse = HttpResponse;
