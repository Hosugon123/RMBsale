import "./loadEnv.js";
import express from "express";
import path from "node:path";
import { createApiRouter } from "./apiRouter.js";

/** 使用 cwd：編譯後在 dist-server/ 執行時，相對 __dirname 會指錯 dist 位置。 */
const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const PORT = Number(process.env.PORT) || 8080;
const isProduction = process.env.NODE_ENV === "production";
const useViteDev = process.env.VITE_DEV === "1" && !isProduction;

function validateProductionEnv() {
  if (!isProduction) return;
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

async function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", createApiRouter());

  if (useViteDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: rootDir,
      configFile: path.join(rootDir, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir, { index: false }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : "伺服器錯誤" });
    }
  });

  return app;
}

validateProductionEnv();
const app = await createApp();
app.listen(PORT, "0.0.0.0", () => {
  console.log(`RMBsale server listening on http://0.0.0.0:${PORT}`);
  if (useViteDev) console.log("Vite dev middleware enabled (VITE_DEV=1)");
});
