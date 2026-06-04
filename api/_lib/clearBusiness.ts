import { getDb } from "./db.js";
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

/** 清除所有帳務資料，保留使用者。 */
export async function clearBusinessTables() {
  const db = getDb();
  await db.delete(saleAllocations);
  await db.delete(sales);
  await db.delete(settlements);
  await db.delete(transfers);
  await db.delete(ledgerEntries);
  await db.delete(rmbLots);
  await db.delete(purchases);
  await db.delete(accounts);
  await db.delete(customers);
  await db.delete(channels);
  await db.delete(holders);
}
