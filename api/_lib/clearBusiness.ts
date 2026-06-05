import { getDb, type DbTx } from "./db.js";
import {
  accounts,
  channels,
  customers,
  holders,
  ledgerEntries,
  purchases,
  rmbLots,
  saleAllocations,
  sales,
  settlements,
  transfers
} from "./schema.js";

export async function clearBusinessTablesInTx(tx: DbTx) {
  await tx.delete(saleAllocations);
  await tx.delete(sales);
  await tx.delete(settlements);
  await tx.delete(transfers);
  await tx.delete(ledgerEntries);
  await tx.delete(rmbLots);
  await tx.delete(purchases);
  await tx.delete(accounts);
  await tx.delete(customers);
  await tx.delete(channels);
  await tx.delete(holders);
}

/** 清除所有帳務資料，保留使用者。 */
export async function clearBusinessTables() {
  const db = getDb();
  return db.transaction(async (tx) => clearBusinessTablesInTx(tx));
}
