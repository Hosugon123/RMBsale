import { and, asc, desc, eq, isNull, lte, ne } from "drizzle-orm";
import Decimal from "decimal.js";
import type { DbTx } from "./db.js";
import { toDbMoney, toDbRate, toDbTwd } from "./money.js";
import { channels, purchases, rmbLots, accounts } from "./schema.js";

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

async function estimateAccountUnitCost(tx: DbTx, accountId: number) {
  const lots = await tx
    .select({ remainingRmb: rmbLots.remainingRmb, unitCostTwd: rmbLots.unitCostTwd })
    .from(rmbLots)
    .where(eq(rmbLots.accountId, accountId));

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
    .where(eq(purchases.depositAccountId, accountId))
    .orderBy(desc(purchases.createdAt))
    .limit(1);
  return recentPurchase ? String(recentPurchase.exchangeRate) : "4.500000";
}

/** 帳戶餘額高於 FIFO 可售量時補批次（庫存盤點／對齊）。 */
export async function reconcileRmbLotInventory(tx: DbTx, operatorId: number) {
  const channelId = await ensureSyncChannel(tx);
  const [channel] = await tx.select({ name: channels.name }).from(channels).where(eq(channels.id, channelId));
  const channelName = channel?.name ?? INVENTORY_SYNC_CHANNEL;

  const rmbAccounts = await tx
    .select({ id: accounts.id, balance: accounts.balance })
    .from(accounts)
    .where(eq(accounts.currency, "RMB"));

  for (const account of rmbAccounts) {
    const lotRows = await tx
      .select({ remainingRmb: rmbLots.remainingRmb })
      .from(rmbLots)
      .where(eq(rmbLots.accountId, account.id));
    const lotTotal = lotRows.reduce((sum, row) => sum.add(row.remainingRmb), new Decimal(0));
    const gap = new Decimal(account.balance).sub(lotTotal);
    if (gap.lte(0.01)) continue;

    const exchangeRate = await estimateAccountUnitCost(tx, account.id);
    const rmbAmount = money(gap);
    const twdCost = toDbTwd(gap.mul(exchangeRate));

    const [purchase] = await tx
      .insert(purchases)
      .values({
        channelId,
        depositAccountId: account.id,
        rmbAmount: toDbMoney(rmbAmount),
        exchangeRate: toDbRate(exchangeRate),
        twdCost: toDbTwd(twdCost),
        paymentStatus: "paid",
        operatorId
      })
      .returning();

    await tx.insert(rmbLots).values({
      purchaseId: purchase.id,
      accountId: account.id,
      originalRmb: toDbMoney(rmbAmount),
      remainingRmb: toDbMoney(rmbAmount),
      unitCostTwd: toDbRate(exchangeRate),
      exchangeRate: toDbRate(exchangeRate)
    });
  }
}

export async function transferRmbLots(
  tx: DbTx,
  input: { fromAccountId: number; toAccountId: number; amount: string; transferId: number }
) {
  let remaining = new Decimal(input.amount);
  const lots = await tx
    .select()
    .from(rmbLots)
    .where(eq(rmbLots.accountId, input.fromAccountId))
    .orderBy(asc(rmbLots.createdAt));

  for (const lot of lots) {
    if (remaining.lte(0)) break;
    const available = new Decimal(lot.remainingRmb);
    if (available.lte(0)) continue;
    const move = Decimal.min(available, remaining);
    if (move.lte(0)) continue;

    if (move.eq(available)) {
      await tx
        .update(rmbLots)
        .set({ accountId: input.toAccountId, transferId: input.transferId })
        .where(eq(rmbLots.id, lot.id));
    } else {
      await tx
        .update(rmbLots)
        .set({ remainingRmb: toDbMoney(available.sub(move)) })
        .where(eq(rmbLots.id, lot.id));
      await tx.insert(rmbLots).values({
        purchaseId: lot.purchaseId,
        accountId: input.toAccountId,
        originalRmb: toDbMoney(move),
        remainingRmb: toDbMoney(move),
        unitCostTwd: lot.unitCostTwd,
        exchangeRate: lot.exchangeRate,
        createdAt: lot.createdAt,
        transferId: input.transferId
      });
    }
    remaining = remaining.sub(move);
  }

  if (remaining.gt(0)) {
    throw new Error(
      `RMB 可轉庫存不足 ${money(remaining)} RMB。帳戶餘額與 FIFO 庫存不一致，請聯絡管理員對齊庫存`
    );
  }
}

export async function reverseRmbLotTransfer(tx: DbTx, transferId: number, fromAccountId: number) {
  const movedLots = await tx.select().from(rmbLots).where(eq(rmbLots.transferId, transferId));
  if (!movedLots.length) return;

  for (const lot of movedLots) {
    if (new Decimal(lot.remainingRmb).lt(lot.originalRmb)) {
      throw new Error("轉帳批次已被售出或動用，無法作廢轉帳");
    }

    const [sourceLot] = await tx
      .select()
      .from(rmbLots)
      .where(
        and(
          ne(rmbLots.id, lot.id),
          eq(rmbLots.purchaseId, lot.purchaseId),
          eq(rmbLots.accountId, fromAccountId),
          eq(rmbLots.unitCostTwd, lot.unitCostTwd),
          isNull(rmbLots.transferId)
        )
      )
      .limit(1);

    if (sourceLot) {
      await tx
        .update(rmbLots)
        .set({ remainingRmb: toDbMoney(new Decimal(sourceLot.remainingRmb).add(lot.remainingRmb)) })
        .where(eq(rmbLots.id, sourceLot.id));
      await tx.update(rmbLots).set({ remainingRmb: "0.00", transferId: null }).where(eq(rmbLots.id, lot.id));
    } else {
      await tx
        .update(rmbLots)
        .set({ accountId: fromAccountId, transferId: null })
        .where(eq(rmbLots.id, lot.id));
    }
  }

  await tx.delete(rmbLots).where(lte(rmbLots.remainingRmb, "0"));
}
