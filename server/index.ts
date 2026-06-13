import "./loadEnv.js";
import compression from "compression";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { formatDatabaseIsolationReport, assertDevOnlineDatabaseSafe } from "../api/_lib/databaseEnv.js";
import { ensureAuditBackupSchema, ensureRmbLotInventorySchema } from "../api/_lib/ensureAuditBackupSchema.js";
import { ensureProfitLedgerEntries } from "../api/_lib/profitLedger.js";
import { ensureUserProfileColumns } from "../api/_lib/ensureUserColumns.js";
import { getDb } from "../api/_lib/db.js";
import { createApiRouter } from "./apiRouter.js";
import { assertDistExists, resolveAppRoot, resolveDistDir } from "./paths.js";

const rootDir = resolveAppRoot();
const distDir = resolveDistDir(rootDir);
const PORT = Number(process.env.PORT) || 8080;
const isProduction = process.env.NODE_ENV === "production";
const useViteDev = process.env.VITE_DEV === "1" && !isProduction;
const runStartupDbMaintenance = process.env.RUN_STARTUP_DB_MAINTENANCE === "1";

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
  app.use(compression());
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", async (_req, res) => {
    if (!process.env.DATABASE_URL) {
      res.status(503).json({ ok: false, db: "missing" });
      return;
    }
    try {
      const db = getDb();
      await db.execute(sql`select 1`);
      res.json({ ok: true, db: "up" });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(503).json({ ok: false, db: "down" });
    }
  });

  const readBuildId = () => {
    try {
      const raw = fs.readFileSync(path.join(distDir, "build-meta.json"), "utf8");
      return (JSON.parse(raw) as { buildId?: string }).buildId ?? "unknown";
    } catch {
      return process.env.BUILD_ID || "unknown";
    }
  };

  app.get("/api/app-meta", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ buildId: readBuildId() });
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
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders(res, filePath) {
          const base = path.basename(filePath);
          if (base === "index.html" || base === "manifest.webmanifest" || base.endsWith(".webmanifest")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            return;
          }
          if (base.startsWith("sw") || base.startsWith("workbox-")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            return;
          }
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        }
      })
    );
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
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
if (useViteDev) {
  console.log(formatDatabaseIsolationReport());
  try {
    assertDevOnlineDatabaseSafe();
  } catch (error) {
    console.error(`\n拒絕啟動 dev:online：${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
if (isProduction && !useViteDev) {
  assertDistExists(distDir);
}
if (process.env.DATABASE_URL) {
  try {
    const backfilled = await ensureProfitLedgerEntries();
    if (backfilled > 0) {
      console.log(`Backfilled ${backfilled} missing profit ledger entries.`);
    }
  } catch (error) {
    console.error("Profit ledger backfill failed:", error);
    if (isProduction) process.exit(1);
  }
}

if (process.env.DATABASE_URL && runStartupDbMaintenance) {
  try {
    await ensureUserProfileColumns();
    await ensureAuditBackupSchema();
    await ensureRmbLotInventorySchema(1);
    console.log("Database schema check complete.");
  } catch (error) {
    console.error("Database schema migration failed:", error);
    if (isProduction) process.exit(1);
  }
} else if (process.env.DATABASE_URL) {
  console.log("Database startup maintenance skipped. Run migrations explicitly before deployment.");
}
const app = await createApp();
app.listen(PORT, "0.0.0.0", () => {
  console.log(`RMBsale server listening on http://0.0.0.0:${PORT}`);
  console.log(`App root: ${rootDir}`);
  console.log(`Static dist: ${distDir}`);
  if (useViteDev) console.log("Vite dev middleware enabled (VITE_DEV=1)");
});
