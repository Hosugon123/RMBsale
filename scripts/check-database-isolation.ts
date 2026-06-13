/**
 * 檢查本機是否誤連正式資料庫。
 * 用法：npm run db:check-isolation
 */
import "./loadEnv.ts";
import { formatDatabaseIsolationReport, isDevDatabaseHostCheckIncomplete, isLocalUsingProductionDatabase } from "../api/_lib/databaseEnv.js";

console.log(formatDatabaseIsolationReport());
if (isLocalUsingProductionDatabase() || isDevDatabaseHostCheckIncomplete()) {
  process.exit(1);
}
