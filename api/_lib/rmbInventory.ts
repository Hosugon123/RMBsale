import { eq, gt } from "drizzle-orm";
import Decimal from "decimal.js";
import type { DbTx } from "./db.js";
import { accounts, rmbLots, specialClientWalletEntries } from "./schema.js";
import { lockTransactionResources } from "./transactionLocks.js";

const INVENTORY_TOLERANCE_RMB = new Decimal("0.01");

export type RmbInventoryReconcileReport = {
  accountId: number;
  accountName: string;
  balanceRmb: string;
  inventoryBeforeRmb: string;
  inventoryAfterRmb: string;
  gapRmb: string;
  action: "none" | "mismatch";
};

function fixed(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

async function getTotalRmbAccountBalance(tx: DbTx) {
  const rows = await tx.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.currency, "RMB"));
  return rows.reduce((sum, row) => sum.add(row.balance), new Decimal(0));
}

async function getGlobalInventory(tx: DbTx) {
  const rows = await tx.select({ remainingRmb: rmbLots.remainingRmb }).from(rmbLots).where(gt(rmbLots.remainingRmb, "0"));
  return rows.reduce((sum, row) => sum.add(row.remainingRmb), new Decimal(0));
}

async function getSpecialClientLiability(tx: DbTx) {
  const rows = await tx.select({
    type: specialClientWalletEntries.type,
    netCreditRmb: specialClientWalletEntries.netCreditRmb,
    payoutRmb: specialClientWalletEntries.payoutRmb
  }).from(specialClientWalletEntries);

  return rows.reduce((sum, row) => {
    if (row.type === "deposit") return sum.add(row.netCreditRmb ?? 0);
    if (row.type === "payout") return sum.sub(row.payoutRmb ?? 0);
    if (row.netCreditRmb != null) return sum.add(row.netCreditRmb);
    return sum.add(row.payoutRmb ?? 0);
  }, new Decimal(0));
}

/** Audit only. Never invent or consume FIFO lots to hide a discrepancy. */
export async function reconcileRmbLotInventory(tx: DbTx, _operatorId?: number) {
  await lockTransactionResources(tx, "inventory:global-rmb");
  const accountBalance = await getTotalRmbAccountBalance(tx);
  const clientLiability = await getSpecialClientLiability(tx);
  const ownedRmb = accountBalance.sub(clientLiability);
  const inventory = await getGlobalInventory(tx);
  const gap = ownedRmb.sub(inventory);
  const matches = gap.abs().lte(INVENTORY_TOLERANCE_RMB);

  return [{
    accountId: 0,
    accountName: "全公司 FIFO 庫存",
    balanceRmb: fixed(ownedRmb),
    inventoryBeforeRmb: fixed(inventory),
    inventoryAfterRmb: fixed(inventory),
    gapRmb: fixed(gap),
    action: matches ? "none" : "mismatch"
  } satisfies RmbInventoryReconcileReport];
}
