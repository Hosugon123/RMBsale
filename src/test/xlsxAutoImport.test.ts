import { afterEach, describe, expect, it, vi } from "vitest";
import { loadXlsxImportPayload } from "../lib/xlsxAutoImport";

describe("xlsx auto import", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ignores vite html fallback when optional import json is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<!doctype html><html></html>", {
        headers: { "content-type": "text/html" },
        status: 200
      }))
    );

    await expect(loadXlsxImportPayload()).resolves.toBeNull();
  });

  it("loads json payload when the optional import file exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ accounts: [] }), {
        headers: { "content-type": "application/json" },
        status: 200
      }))
    );

    await expect(loadXlsxImportPayload()).resolves.toMatchObject({ accounts: [] });
  });
});
