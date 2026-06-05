import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 解析專案根目錄（含 dist/ 的那一層）。
 * - 編譯後：/app/dist-server/server/index.js → /app
 * - 本機 tsx：/app/server/index.ts → /app
 * 不依賴 process.cwd()，避免 Cloud Run 工作目錄不一致。
 */
export function resolveAppRoot(): string {
  if (process.env.APP_ROOT) {
    return path.resolve(process.env.APP_ROOT);
  }

  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const parentName = path.basename(path.dirname(serverDir));

  if (parentName === "dist-server") {
    return path.resolve(serverDir, "../..");
  }

  return path.resolve(serverDir, "..");
}

export function resolveDistDir(rootDir = resolveAppRoot()): string {
  return path.join(rootDir, "dist");
}

export function assertDistExists(distDir: string): void {
  const indexHtml = path.join(distDir, "index.html");
  if (!existsSync(indexHtml)) {
    console.error(`Frontend build not found: ${indexHtml}`);
    console.error("Run npm run build before starting in production mode.");
    process.exit(1);
  }
}
