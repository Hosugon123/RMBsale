import { and, asc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { allocateFifo, calcProfit, calcTwd, toDbMoney, toDbRate } from "./money.js";
import {
  accounts,
  auditLogs,
  channels,
  customers,
  holders,
  ledgerEntries,
  purchases,
  rmbLots,
  saleAllocations,
  sales,
  settlements,
  transfers,
  type Currency
} from "./schema.js";

type Actor = {
  id: number;
  ipAddress?: string;
  userAgent?: string;
};

export async function createPurchase(input: {
  channelName?: string;
  channelId?: number;
  paymentAccountId?: number;
  depositAccountId: number;
  rmbAmount: string;
  exchangeRate: string;
  paymentStatus: "paid" | "unpaid";
}, actor: Actor) {
  const db = getDb();
  const twdCost = calcTwd(input.rmbAmount, input.exchangeRate);

  return db.transaction(async (tx) => {
    const channelId = input.channelId ?? (input.channelName
      ? (await tx.insert(channels).values({ name: input.channelName }).onConflictDoUpdate({
          target: channels.name,
          set: { isActive: true }
        }).returning({ id: channels.id }))[0].id
      : null);

    const [purchase] = await tx.insert(purchases).values({
      channelId,
      paymentAccountId: input.paymentAccountId,
      depositAccountId: input.depositAccountId,
      rmbAmount: toDbMoney(input.rmbAmount),
      exchangeRate: toDbRate(input.exchangeRate),
      twdCost: toDbMoney(twdCost),
      paymentStatus: input.paymentStatus,
      operatorId: actor.id
    }).returning();

    await tx.insert(rmbLots).values({
      purchaseId: purchase.id,
      accountId: input.depositAccountId,
      originalRmb: toDbMoney(input.rmbAmount),
      remainingRmb: toDbMoney(input.rmbAmount),
      unitCostTwd: toDbRate(twdCost.div(input.rmbAmount)),
      exchangeRate: toDbRate(input.exchangeRate)
    });

    await addAccountDelta(tx, input.depositAccountId, "RMB", input.rmbAmount, "in", "purchase", purchase.id, actor.id, "RMB ????");

    if (input.paymentStatus === "paid" && input.paymentAccountId) {
      await addAccountDelta(tx, input.paymentAccountId, "TWD", twdCost.neg().toFixed(2), "out", "purchase", purchase.id, actor.id, "RMB ????");
    }

    await tx.insert(auditLogs).values({
      action: "CREATE_PURCHASE",
      entityType: "purchase",
      entityId: purchase.id,
      afterJson: JSON.stringify(purchase),
      operatorId: actor.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent
    });

    return purchase;
  });
}

export async function createSale(input: {
  customerName?: string;
  customerId?: number;
  rmbAccountId: number;
  rmbAmount: string;
  exchangeRate: string;
}, actor: Actor) {
  const db = getDb();
  const twdAmount = calcTwd(input.rmbAmount, input.exchangeRate);

  return db.transaction(async (tx) => {
    const customerId = input.customerId ?? (await tx.insert(customers).values({ name: input.customerName || "?????" }).onConflictDoUpdate({
      target: customers.name,
      set: { isActive: true }
    }).returning({ id: customers.id }))[0].id;

    const lots = await tx.select({
      id: rmbLots.id,
      remainingRmb: rmbLots.remainingRmb,
      unitCostTwd: rmbLots.unitCostTwd
    }).from(rmbLots)
      .where(and(eq(rmbLots.accountId, input.rmbAccountId), gt(rmbLots.remainingRmb, "0")))
      .orderBy(asc(rmbLots.createdAt), asc(rmbLots.id));

    const allocation = allocateFifo(lots, input.rmbAmount);
    const profitTwd = calcProfit(twdAmount, allocation.totalCostTwd);

    const [sale] = await tx.insert(sales).values({
      customerId,
      rmbAccountId: input.rmbAccountId,
      rmbAmount: toDbMoney(input.rmbAmount),
      exchangeRate: toDbRate(input.exchangeRate),
      twdAmount: toDbMoney(twdAmount),
      costTwd: allocation.totalCostTwd,
      profitTwd,
      operatorId: actor.id
    }).returning();

    for (const item of allocation.allocations) {
      await tx.insert(saleAllocations).values({
        saleId: sale.id,
        lotId: item.lotId,
        allocatedRmb: item.allocatedRmb,
        allocatedCostTwd: item.allocatedCostTwd
      });
      await tx.update(rmbLots).set({
        remainingRmb: sql`${rmbLots.remainingRmb} - ${item.allocatedRmb}`
      }).where(eq(rmbLots.id, item.lotId));
    }

    await tx.update(customers).set({
      receivableTwd: sql`${customers.receivableTwd} + ${toDbMoney(twdAmount)}`
    }).where(eq(customers.id, customerId));

    await addAccountDelta(tx, input.rmbAccountId, "RMB", `-${toDbMoney(input.rmbAmount)}`, "out", "sale", sale.id, actor.id, "RMB ?????");

    await tx.insert(ledgerEntries).values({
      entryType: "receivable",
      customerId,
      relatedTable: "sales",
      relatedId: sale.id,
      direction: "in",
      currency: "TWD",
      amount: toDbMoney(twdAmount),
      description: "??????",
      operatorId: actor.id
    });

    return sale;
  });
}

export async function createSettlement(input: {
  customerId: number;
  accountId: number;
  amountTwd: string;
  note?: string;
}, actor: Actor) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [settlement] = await tx.insert(settlements).values({
      customerId: input.customerId,
      accountId: input.accountId,
      amountTwd: toDbMoney(input.amountTwd),
      note: input.note,
      operatorId: actor.id
    }).returning();

    await tx.update(customers).set({
      receivableTwd: sql`${customers.receivableTwd} - ${toDbMoney(input.amountTwd)}`
    }).where(eq(customers.id, input.customerId));

    await addAccountDelta(tx, input.accountId, "TWD", input.amountTwd, "in", "settlement", settlement.id, actor.id, "????");
    return settlement;
  });
}

export async function createTransfer(input: {
  fromAccountId: number;
  toAccountId: number;
  amount: string;
  note?: string;
}, actor: Actor) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [from] = await tx.select().from(accounts).where(eq(accounts.id, input.fromAccountId));
    const [to] = await tx.select().from(accounts).where(eq(accounts.id, input.toAccountId));
    if (!from || !to) throw new Error("Account not found");
    if (from.currency !== to.currency) throw new Error("Transfers must use accounts with the same currency");

    const [transfer] = await tx.insert(transfers).values({
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: toDbMoney(input.amount),
      note: input.note,
      operatorId: actor.id
    }).returning();

    await addAccountDelta(tx, input.fromAccountId, from.currency as Currency, `-${toDbMoney(input.amount)}`, "out", "transfer", transfer.id, actor.id, "????");
    await addAccountDelta(tx, input.toAccountId, to.currency as Currency, input.amount, "in", "transfer", transfer.id, actor.id, "????");
    return transfer;
  });
}

async function addAccountDelta(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  accountId: number,
  currency: Currency,
  amount: string,
  direction: "in" | "out",
  relatedTable: string,
  relatedId: number,
  operatorId: number,
  description: string
) {
  const [before] = await tx.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.id, accountId));
  await tx.update(accounts).set({ balance: sql`${accounts.balance} + ${toDbMoney(amount)}` }).where(eq(accounts.id, accountId));
  const [after] = await tx.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.id, accountId));

  const entryTypeLabel =
    relatedTable === "purchase"
      ? "??"
      : relatedTable === "sale"
        ? "??"
        : relatedTable === "transfer"
          ? "??"
          : relatedTable === "settlement"
            ? "??"
            : relatedTable;

  await tx.insert(ledgerEntries).values({
    entryType: entryTypeLabel,
    accountId,
    relatedTable,
    relatedId,
    direction,
    currency,
    amount: toDbMoney(Math.abs(Number(amount))),
    balanceBefore: before?.balance,
    balanceAfter: after?.balance,
    description,
    operatorId
  });
}

export async function createAccountAdjustment(
  input: {
    accountId: number;
    direction: "in" | "out";
    amount: string;
    note?: string;
    withdrawType?: "capital" | "profit";
  },
  actor: Actor
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, input.accountId));
    if (!account) throw new Error("?????");
    if (Number(input.amount) <= 0) throw new Error("?????? 0");
    if (input.direction === "out" && Number(account.balance) < Number(input.amount)) {
      throw new Error("??????");
    }
    if (input.direction === "out" && input.withdrawType === "profit" && account.currency !== "TWD") {
      throw new Error("???????????");
    }

    const entryType = input.direction === "in" ? "??" : input.withdrawType === "profit" ? "??" : "??";
    const relatedTable = input.direction === "out" && input.withdrawType === "profit" ? "profit" : entryType;
    const signedAmount = input.direction === "in" ? input.amount : `-${input.amount}`;
    const note = input.note?.trim();
    const description = `${account.name} ${entryType}${note ? `?${note}` : ""}`;

    await addAccountDelta(
      tx,
      account.id,
      account.currency as Currency,
      signedAmount,
      input.direction,
      relatedTable,
      0,
      actor.id,
      description
    );

    return { entryType, amount: input.amount };
  });
}

export async function payPurchasePayment(
  input: { purchaseId: number; accountId: number; amountTwd: string },
  actor: Actor
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(purchases).where(eq(purchases.id, input.purchaseId));
    if (!purchase) throw new Error("???????");
    if (purchase.paymentStatus === "paid") throw new Error("??????");
    if (Number(input.amountTwd) <= 0) throw new Error("?????? 0");
    if (Number(input.amountTwd) > Number(purchase.twdCost)) throw new Error("??????????");

    await tx
      .update(purchases)
      .set({
        paymentStatus: Number(input.amountTwd) >= Number(purchase.twdCost) ? "paid" : "unpaid",
        paymentAccountId: input.accountId
      })
      .where(eq(purchases.id, purchase.id));

    await addAccountDelta(
      tx,
      input.accountId,
      "TWD",
      `-${input.amountTwd}`,
      "out",
      "purchase",
      purchase.id,
      actor.id,
      `????? #${purchase.id}`
    );

    return purchase;
  });
}

export async function createHolderRecord(input: { name: string }) {
  const db = getDb();
  const [holder] = await db.insert(holders).values({ name: input.name.trim() }).returning();
  return holder;
}

export async function createAccountRecord(input: { holderId: number; name: string; currency: Currency }) {
  const db = getDb();
  const [account] = await db
    .insert(accounts)
    .values({
      holderId: input.holderId,
      name: input.name.trim(),
      currency: input.currency
    })
    .returning();
  return account;
}
