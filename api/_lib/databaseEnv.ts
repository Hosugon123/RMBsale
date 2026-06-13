export type RmbsaleEnv = "development" | "production";

export function getRmbsaleEnv(): RmbsaleEnv {
  const explicit = process.env.RMBSALE_ENV?.trim().toLowerCase();
  if (explicit === "development" || explicit === "dev") return "development";
  if (explicit === "production" || explicit === "prod") return "production";
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function getDatabaseHost(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  try {
    const normalized = url.replace(/^postgres(ql)?:\/\//, "http://");
    return new URL(normalized).hostname || null;
  } catch {
    return null;
  }
}

/** 本機 .env.local 是否誤連到正式庫 host（需設定 RMBSALE_PRODUCTION_DB_HOST） */
export function isLocalUsingProductionDatabase(): boolean {
  if (getRmbsaleEnv() === "production") return false;
  const prodHost = process.env.RMBSALE_PRODUCTION_DB_HOST?.trim();
  const currentHost = getDatabaseHost();
  if (!prodHost || !currentHost) return false;
  return prodHost === currentHost;
}

/** 本機 development 模式是否因未設定正式 host 而無法比對 */
export function isDevDatabaseHostCheckIncomplete(): boolean {
  if (getRmbsaleEnv() === "production") return false;
  if (!process.env.DATABASE_URL?.trim()) return false;
  return !process.env.RMBSALE_PRODUCTION_DB_HOST?.trim();
}

export function assertNotProductionDatabaseForDevOps(action: string) {
  if (getRmbsaleEnv() !== "production" && isLocalUsingProductionDatabase()) {
    throw new Error(
      `${action} 拒絕執行：本機 DATABASE_URL 與 RMBSALE_PRODUCTION_DB_HOST 相同，表示測試連到正式庫。` +
        "請建立獨立 dev Neon（scripts/setup-neon-dev.ps1），並在 .env.local 設定 RMBSALE_ENV=development。"
    );
  }
  if (getRmbsaleEnv() !== "production" && isDevDatabaseHostCheckIncomplete()) {
    throw new Error(
      `${action} 拒絕執行：已設定 DATABASE_URL 但未設定 RMBSALE_PRODUCTION_DB_HOST，無法確認是否誤連正式庫。` +
        "請在 .env.local 填入正式 Neon host，或執行 scripts/setup-neon-prod.ps1 取得 host。"
    );
  }
}

export function assertDevOnlineDatabaseSafe() {
  if (getRmbsaleEnv() === "production") return;
  if (isLocalUsingProductionDatabase()) {
    throw new Error(
      "本機 DATABASE_URL 與 RMBSALE_PRODUCTION_DB_HOST 相同，測試會寫進正式庫。" +
        "請執行 scripts/setup-neon-dev.ps1 建立 rmbsale-dev。"
    );
  }
  if (isDevDatabaseHostCheckIncomplete() && process.env.RMBSALE_ALLOW_UNKNOWN_DB !== "1") {
    throw new Error(
      "未設定 RMBSALE_PRODUCTION_DB_HOST，無法確認本機是否誤連正式庫。" +
        "請在 .env.local 填入正式 Neon host，或暫時設定 RMBSALE_ALLOW_UNKNOWN_DB=1（不建議）。"
    );
  }
}

export function assertProbeTargetAllowed(baseUrl: string) {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    throw new Error(`無效的 PROBE_BASE_URL：${baseUrl}`);
  }
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  if (isLocal) return;
  if (process.env.ALLOW_PROBE_REMOTE === "1") {
    console.warn("⚠ ALLOW_PROBE_REMOTE=1：正在對非本機 URL 探測，可能寫入正式資料庫！");
    return;
  }
  throw new Error(
    `探測腳本只能指向本機 http://127.0.0.1:8080，目前為 ${baseUrl}。` +
      "請勿對 Cloud Run / Vercel 正式網址執行探測。"
  );
}

export function formatDatabaseIsolationReport(): string {
  const env = getRmbsaleEnv();
  const host = getDatabaseHost() ?? "(未設定 DATABASE_URL)";
  const prodHost = process.env.RMBSALE_PRODUCTION_DB_HOST?.trim() || "(未設定，無法比對正式庫)";
  const lines = [
    `RMBSALE_ENV: ${env}`,
    `NODE_ENV: ${process.env.NODE_ENV ?? "(未設定)"}`,
    `DATABASE_URL host: ${host}`,
    `RMBSALE_PRODUCTION_DB_HOST: ${prodHost}`
  ];
  if (isLocalUsingProductionDatabase()) {
    lines.push("⚠ 危險：本機連線指向正式庫 host，測試資料會寫進正式版！");
    lines.push("  → 請執行 scripts/setup-neon-dev.ps1 建立 rmbsale-dev，並更新 .env.local");
  } else if (isDevDatabaseHostCheckIncomplete()) {
    lines.push("⚠ 無法比對：請在 .env.local 設定 RMBSALE_PRODUCTION_DB_HOST（正式 Neon host）");
  } else if (env === "development") {
    lines.push("✓ 本機標記為 development，且未偵測到與正式 host 相同");
  } else {
    lines.push("正式環境模式（Cloud Run / NODE_ENV=production）");
  }
  return lines.join("\n");
}
