import { eq } from "drizzle-orm";
import type { DbTx } from "./db.js";
import { accounts, customers, holders, ledgerEntries } from "./schema.js";

export async function insertAccountDeleteLedger(
  tx: DbTx,
  account: typeof accounts.$inferSelect,
  operatorId: number
) {
  const [holder] = await tx.select({ name: holders.name }).from(holders).where(eq(holders.id, account.holderId));
  const holderName = holder?.name ?? "持有人";
  await tx.insert(ledgerEntries).values({
    entryType: "刪除帳戶",
    accountId: account.id,
    relatedTable: "accounts",
    relatedId: account.id,
    direction: "none",
    currency: account.currency,
    amount: "0.00",
    balanceBefore: account.balance,
    balanceAfter: account.balance,
    description: `${holderName} / ${account.name} 刪除帳戶`,
    operatorId
  });
}

export async function insertCustomerDeleteLedger(
  tx: DbTx,
  customer: typeof customers.$inferSelect,
  operatorId: number
) {
  await tx.insert(ledgerEntries).values({
    entryType: "刪除客戶",
    customerId: customer.id,
    relatedTable: "customers",
    relatedId: customer.id,
    direction: "none",
    currency: "TWD",
    amount: "0.00",
    description: `從常用清單移除：${customer.name}`,
    operatorId
  });
}
