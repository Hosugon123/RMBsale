import { asc, desc, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import type { DbTx } from "./db.js";
import { toDbMoney, toDbRate, toDbTwd } from "./money.js";
import { accounts, channels, purchases, rmbLots } from "./schema.js";

const INVENTORY_SYNC_CHANNEL = "庫存對齊";

function money(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

async function ensureSyncChannel(tx: DbTx) {
  const [existing] = await tx.select({ id: channels.id }).from(channels).where(eq(channels.name, INVENTORY_SYNC_CHANNEL));
  if (existing) return existing.id;
  const [created] = await tx.insert(channels).values({ name: INVENTORY_SYNC_CHANNEL }).returning({ id: channels.id });
  return created.id;
}

async function estimateGlobalUnitCost(tx: DbTx) {
  const lots = await tx
    .select({ remainingRmb: rmbLots.remainingRmb, unitCostTwd: rmbLots.unitCostTwd })
    .from(rmbLots);

  let totalRmb = new Decimal(0);
  let totalCost = new Decimal(0);
  for (const lot of lots) {
    const remaining = new Decimal(lot.remainingRmb);
    if (remaining.lte(0)) continue;
    totalRmb = totalRmb.add(remaining);
    totalCost = totalCost.add(remaining.mul(lot.unitCostTwd));
  }
  if (totalRmb.gt(0)) return toDbRate(totalCost.div(totalRmb));

  const [recentPurchase] = await tx
    .select({ exchangeRate: purchases.exchangeRate })
    .from(purchases)
    .orderBy(desc(purchases.createdAt))
    .limit(1);
  return recentPurchase ? String(recentPurchase.exchangeRate) : "4.500000";
}

async function reduceGlobalLotsFifo(tx: DbTx, amount: Decimal) {
  let remaining = amount;
  const lots = await tx.select().from(rmbLots).orderBy(asc(rmbLots.createdAt), asc(rmbLots.id));

  for (const lot of lots) {
    if (remaining.lte(0)) break;
    const available = new Decimal(lot.remainingRmb);
    if (available.lte(0)) continue;

    const reduce = Decimal.min(available, remaining);
    await tx
      .update(rmbLots)
      .set({ remainingRmb: toDbMoney(available.sub(reduce)) })
      .where(eq(rmbLots.id, lot.id));
    remaining = remaining.sub(reduce);
  }
}

/** Align the global RMB FIFO cost pool to current RMB account balances without changing account balances. */
export async function reconcileRmbLotInventory(tx: DbTx, operatorId: number) {
  const rmbAccounts = await tx
    .select({ id: accounts.id, balance: accounts.balance, isActive: accounts.isActive })
    .from(accounts)
    .where(eq(accounts.currency, "RMB"));
  if (!rmbAccounts.length) return;

  const accountTotal = rmbAccounts.reduce((sum, account) => sum.add(account.balance), new Decimal(0));
  const lotRows = await tx.select({ remainingRmb: rmbLots.remainingRmb }).from(rmbLots);
  const lotTotal = lotRows.reduce((sum, row) => sum.add(row.remainingRmb), new Decimal(0));
  const gap = accountTotal.sub(lotTotal);

  if (gap.abs().lte(0.01)) return;

  if (gap.lt(0)) {
    await reduceGlobalLotsFifo(tx, gap.abs());
    return;
  }

  const channelId = await ensureSyncChannel(tx);
  const depositAccount = rmbAccounts.find((account) => account.isActive) ?? rmbAccounts[0];
  const exchangeRate = await estimateGlobalUnitCost(tx);
  const rmbAmount = money(gap);
  const twdCost = toDbTwd(gap.mul(exchangeRate));

  const [purchase] = await tx
    .insert(purchases)
    .values({
      channelId,
      depositAccountId: depositAccount.id,
      rmbAmount: toDbMoney(rmbAmount),
      exchangeRate: toDbRate(exchangeRate),
      twdCost,
      paymentStatus: "paid",
      operatorId
    })
    .returning();

  await tx.insert(rmbLots).values({
    purchaseId: purchase.id,
    accountId: depositAccount.id,
    originalRmb: toDbMoney(rmbAmount),
    remainingRmb: toDbMoney(rmbAmount),
    unitCostTwd: toDbRate(exchangeRate),
    exchangeRate: toDbRate(exchangeRate)
  });
}

export async function transferRmbLots(
  tx: DbTx,
  input: { fromAccountId: number; toAccountId: number; amount: string; transferId: number }
) {
  void tx;
  void input;
}

export async function reverseRmbLotTransfer(tx: DbTx, transferId: number, fromAccountId: number) {
  void tx;
  void transferId;
  void fromAccountId;
}
