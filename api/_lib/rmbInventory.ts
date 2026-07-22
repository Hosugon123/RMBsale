import { and, asc, desc, eq, gt } from "drizzle-orm";
import Decimal from "decimal.js";
import type { DbTx } from "./db.js";
import { toDbMoney, toDbRate, toDbTwd } from "./money.js";
import { accounts, channels, purchases, rmbLots } from "./schema.js";

const INVENTORY_SYNC_CHANNEL = "庫存同步";
const INVENTORY_SYNC_TOLERANCE_RMB = new Decimal("0.01");

export type RmbInventoryReconcileReport = {
  accountId: number;
  accountName: string;
  balanceRmb: string;
  inventoryBeforeRmb: string;
  inventoryAfterRmb: string;
  gapRmb: string;
  action: "none" | "created_lot" | "reduced_lots";
};

function money(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function nonNegativeMoney(value: Decimal.Value) {
  const amount = new Decimal(value);
  return amount.lt(0) ? new Decimal(0) : amount;
}

async function ensureSyncChannel(tx: DbTx) {
  const [existing] = await tx.select({ id: channels.id }).from(channels).where(eq(channels.name, INVENTORY_SYNC_CHANNEL));
  if (existing) return existing.id;
  const [created] = await tx.insert(channels).values({ name: INVENTORY_SYNC_CHANNEL }).returning({ id: channels.id });
  return created.id;
}

async function estimateUnitCost(tx: DbTx, accountId: number) {
  const accountLots = await tx
    .select({ remainingRmb: rmbLots.remainingRmb, unitCostTwd: rmbLots.unitCostTwd })
    .from(rmbLots)
    .where(and(eq(rmbLots.accountId, accountId), gt(rmbLots.remainingRmb, "0")));

  const accountCost = weightedUnitCost(accountLots);
  if (accountCost) return accountCost;

  const globalLots = await tx
    .select({ remainingRmb: rmbLots.remainingRmb, unitCostTwd: rmbLots.unitCostTwd })
    .from(rmbLots)
    .where(gt(rmbLots.remainingRmb, "0"));

  const globalCost = weightedUnitCost(globalLots);
  if (globalCost) return globalCost;

  const [recentPurchase] = await tx
    .select({ exchangeRate: purchases.exchangeRate })
    .from(purchases)
    .orderBy(desc(purchases.createdAt))
    .limit(1);

  return recentPurchase ? toDbRate(recentPurchase.exchangeRate) : "4.500000";
}

function weightedUnitCost(lots: Array<{ remainingRmb: string; unitCostTwd: string }>) {
  let totalRmb = new Decimal(0);
  let totalCost = new Decimal(0);

  for (const lot of lots) {
    const remaining = new Decimal(lot.remainingRmb);
    if (remaining.lte(0)) continue;
    totalRmb = totalRmb.add(remaining);
    totalCost = totalCost.add(remaining.mul(lot.unitCostTwd));
  }

  return totalRmb.gt(0) ? toDbRate(totalCost.div(totalRmb)) : null;
}

async function getAccountInventory(tx: DbTx, accountId: number) {
  const rows = await tx
    .select({ remainingRmb: rmbLots.remainingRmb })
    .from(rmbLots)
    .where(eq(rmbLots.accountId, accountId));

  return rows.reduce((sum, row) => sum.add(row.remainingRmb), new Decimal(0));
}

async function reduceAccountLotsFifo(tx: DbTx, accountId: number, amount: Decimal) {
  let remaining = amount;
  const lots = await tx
    .select({ id: rmbLots.id, remainingRmb: rmbLots.remainingRmb })
    .from(rmbLots)
    .where(and(eq(rmbLots.accountId, accountId), gt(rmbLots.remainingRmb, "0")))
    .orderBy(asc(rmbLots.createdAt), asc(rmbLots.id));

  for (const lot of lots) {
    if (remaining.lte(0)) break;
    const available = new Decimal(lot.remainingRmb);
    const reduce = Decimal.min(available, remaining);
    await tx
      .update(rmbLots)
      .set({ remainingRmb: toDbMoney(available.sub(reduce)) })
      .where(eq(rmbLots.id, lot.id));
    remaining = remaining.sub(reduce);
  }
}

async function createInventorySyncLot(tx: DbTx, accountId: number, amount: Decimal, operatorId: number) {
  const channelId = await ensureSyncChannel(tx);
  const exchangeRate = await estimateUnitCost(tx, accountId);
  const rmbAmount = money(amount);
  const twdCost = toDbTwd(new Decimal(rmbAmount).mul(exchangeRate));

  const [purchase] = await tx
    .insert(purchases)
    .values({
      channelId,
      depositAccountId: accountId,
      rmbAmount: toDbMoney(rmbAmount),
      exchangeRate: toDbRate(exchangeRate),
      twdCost,
      paymentStatus: "paid",
      operatorId
    })
    .returning();

  await tx.insert(rmbLots).values({
    purchaseId: purchase.id,
    accountId,
    originalRmb: toDbMoney(rmbAmount),
    remainingRmb: toDbMoney(rmbAmount),
    unitCostTwd: toDbRate(exchangeRate),
    exchangeRate: toDbRate(exchangeRate)
  });
}

async function reconcileRmbAccountInventory(
  tx: DbTx,
  account: { id: number; name: string; balance: string },
  operatorId: number
): Promise<RmbInventoryReconcileReport> {
  const targetInventory = nonNegativeMoney(account.balance);
  const inventoryBefore = await getAccountInventory(tx, account.id);
  const gap = targetInventory.sub(inventoryBefore);

  let action: RmbInventoryReconcileReport["action"] = "none";
  if (gap.gt(INVENTORY_SYNC_TOLERANCE_RMB)) {
    await createInventorySyncLot(tx, account.id, gap, operatorId);
    action = "created_lot";
  } else if (gap.lt(INVENTORY_SYNC_TOLERANCE_RMB.neg())) {
    await reduceAccountLotsFifo(tx, account.id, gap.abs());
    action = "reduced_lots";
  }

  const inventoryAfter = action === "none" ? inventoryBefore : await getAccountInventory(tx, account.id);
  return {
    accountId: account.id,
    accountName: account.name,
    balanceRmb: money(targetInventory),
    inventoryBeforeRmb: money(inventoryBefore),
    inventoryAfterRmb: money(inventoryAfter),
    gapRmb: money(gap),
    action
  };
}

/**
 * Align every RMB account's FIFO inventory to its account balance without changing account balances.
 * This is intentionally account-level, not global, because sales and withdrawals must consume the
 * same RMB account the operator selected.
 */
export async function reconcileRmbLotInventory(tx: DbTx, operatorId: number) {
  const rmbAccounts = await tx
    .select({ id: accounts.id, name: accounts.name, balance: accounts.balance })
    .from(accounts)
    .where(eq(accounts.currency, "RMB"))
    .orderBy(asc(accounts.id));

  const reports: RmbInventoryReconcileReport[] = [];
  for (const account of rmbAccounts) {
    reports.push(await reconcileRmbAccountInventory(tx, account, operatorId));
  }
  return reports;
}
