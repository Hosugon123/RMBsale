/**
 * 沖銷正式庫中誤寫入的探測／測試儲值代付（vendor/note/reason 含「探測」且尚未沖銷）。
 *
 * 用法（針對正式庫，需明確確認）：
 *   RMBSALE_ENV=production ALLOW_PURGE_PROBE=1 npm run db:purge-probe-wallet -- --confirm
 */
import "./loadEnv.ts";
import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { getRmbsaleEnv } from "../api/_lib/databaseEnv.js";
import { getDb } from "../api/_lib/db.js";
import { specialClientWalletEntries, users } from "../api/_lib/schema.js";
import { reverseSpecialClientWalletEntry } from "../api/_lib/specialClientWallet.js";

const confirmed = process.argv.includes("--confirm");

async function main() {
  if (!confirmed) {
    console.error("請加上 --confirm 才會執行沖銷。");
    process.exit(1);
  }
  if (process.env.ALLOW_PURGE_PROBE !== "1") {
    console.error("請設定 ALLOW_PURGE_PROBE=1 才允許執行。");
    process.exit(1);
  }

  const env = getRmbsaleEnv();
  if (env !== "production") {
    console.error("此腳本僅供正式庫清理（RMBSALE_ENV=production）。本機測試庫請直接重建 rmbsale-dev。");
    process.exit(1);
  }

  const db = getDb();
  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  if (!admin) {
    throw new Error("找不到 admin 使用者，無法執行沖銷。");
  }

  const candidates = await db
    .select()
    .from(specialClientWalletEntries)
    .where(
      and(
        inArray(specialClientWalletEntries.type, ["deposit", "payout"]),
        isNull(specialClientWalletEntries.reversedAt),
        or(
          ilike(specialClientWalletEntries.vendorName, "%探測%"),
          ilike(specialClientWalletEntries.note, "%探測%"),
          ilike(specialClientWalletEntries.reverseReason, "%探測%")
        )
      )
    )
    .orderBy(specialClientWalletEntries.id);

  if (candidates.length === 0) {
    console.log("未找到尚未沖銷、且含「探測」字樣的儲值代付紀錄。");
    return;
  }

  console.log(`將沖銷 ${candidates.length} 筆探測資料…`);
  for (const row of candidates) {
    const label =
      row.type === "deposit"
        ? `儲值 ${row.grossRmb ?? "?"}`
        : `代付 ${row.payoutRmb ?? "?"} → ${row.vendorName ?? "?"}`;
    console.log(`  #${row.id} ${label}`);
    await reverseSpecialClientWalletEntry(
      { entryId: row.id, reverseReason: "清除誤寫入之探測測試資料", clientId: row.clientId },
      { id: admin.id, username: admin.username, role: admin.role }
    );
  }
  console.log("探測資料沖銷完成。已沖銷的歷史紀錄仍會保留於稽核流水。");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
