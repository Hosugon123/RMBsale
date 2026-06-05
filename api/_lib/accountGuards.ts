import { and, eq, gt } from "drizzle-orm";
import { getDb, type DbTx } from "./db.js";
import { accounts, rmbLots } from "./schema.js";
import { money } from "./money.js";

export async function assertAccountDeletable(accountId: number, tx?: DbTx) {
  const db = tx ?? getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new Error("找不到帳戶");
  if (!money(account.balance).eq(0) || !money(account.profitBalance).eq(0)) {
    throw new Error("帳戶仍有餘額，無法刪除");
  }
  const [lot] = await db
    .select({ id: rmbLots.id })
    .from(rmbLots)
    .where(and(eq(rmbLots.accountId, accountId), gt(rmbLots.remainingRmb, "0")))
    .limit(1);
  if (lot) throw new Error("帳戶仍有人民幣庫存，無法刪除");
}
