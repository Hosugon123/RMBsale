import { asc, desc, eq, gt } from "drizzle-orm";
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
  void accountId;

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

async function getGlobalInventory(tx: DbTx) {
  const rows = await tx
    .select({ remainingRmb: rmbLots.remainingRmb })
    .from(rmbLots);

  return rows.reduce((sum, row) => sum.add(row.remainingRmb), new Decimal(0));
}

async function getTotalRmbAccountBalance(tx: DbTx) {
  const rows = await tx
    .select({ balance: accounts.balance })
    .from(accounts)
    .where(eq(accounts.currency, "RMB"));

  return rows.reduce((sum, row) => sum.add(nonNegativeMoney(row.balance)), new Decimal(0));
}

async function reduceGlobalLotsFifo(tx: DbTx, amount: Decimal) {
  let remaining = amount;
  const lots = await tx
    .select({ id: rmbLots.id, remainingRmb: rmbLots.remainingRmb })
    .from(rmbLots)
    .where(gt(rmbLots.remainingRmb, "0"))
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

async function chooseSyncAccountId(tx: DbTx) {
  const [account] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.currency, "RMB"))
    .orderBy(desc(accounts.isActive), asc(accounts.id))
    .limit(1);
  if (!account) throw new Error("找不到 RMB 帳戶，無法建立庫存同步批次");
  return account.id;
}

async function createInventorySyncLot(tx: DbTx, amount: Decimal, operatorId: number) {
  const accountId = await chooseSyncAccountId(tx);
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

async function reconcileGlobalRmbInventory(tx: DbTx, operatorId: number): Promise<RmbInventoryReconcileReport> {
  const targetInventory = await getTotalRmbAccountBalance(tx);
  const inventoryBefore = await getGlobalInventory(tx);
  const gap = targetInventory.sub(inventoryBefore);

  let action: RmbInventoryReconcileReport["action"] = "none";
  if (gap.gt(INVENTORY_SYNC_TOLERANCE_RMB)) {
    await createInventorySyncLot(tx, gap, operatorId);
    action = "created_lot";
  } else if (gap.lt(INVENTORY_SYNC_TOLERANCE_RMB.neg())) {
    await reduceGlobalLotsFifo(tx, gap.abs());
    action = "reduced_lots";
  }

  const inventoryAfter = action === "none" ? inventoryBefore : await getGlobalInventory(tx);
  return {
    accountId: 0,
    accountName: "全公司 FIFO 庫存",
    balanceRmb: money(targetInventory),
    inventoryBeforeRmb: money(inventoryBefore),
    inventoryAfterRmb: money(inventoryAfter),
    gapRmb: money(gap),
    action
  };
}

/**
 * Align the company-wide FIFO inventory to the total RMB account balance without changing account balances.
 * RMB accounts track where cash is held; FIFO lots track the company's cost pool.
 */
export async function reconcileRmbLotInventory(tx: DbTx, operatorId: number) {
  return [await reconcileGlobalRmbInventory(tx, operatorId)];
}
