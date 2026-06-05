import { and, asc, eq, gt, sql } from "drizzle-orm";
import { getDb, type DbTx } from "./db.js";
import { allocateFifo, calcProfit, calcTwd, toDbMoney, toDbRate } from "./money.js";
import { AuditAction, writeAudit } from "./audit.js";
import { assertPurchasePayable } from "./purchaseUtils.js";
import { assertPurchaseEditable } from "./locks.js";
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
  transfers,
  type Currency
} from "./schema.js";

type Actor = {
  id: number;
  ipAddress?: string;
  userAgent?: string;
};

const DEPOSIT_CHANNEL = "入金";

async function ensureChannelId(tx: DbTx, name: string) {
  const [existing] = await tx.select({ id: channels.id }).from(channels).where(eq(channels.name, name));
  if (existing) return existing.id;
  const [created] = await tx.insert(channels).values({ name }).returning({ id: channels.id });
  return created.id;
}

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

    await addAccountDelta(
      tx,
      input.depositAccountId,
      "RMB",
      input.rmbAmount,
      "in",
      "purchase",
      purchase.id,
      actor.id,
      `買入 ${toDbMoney(input.rmbAmount)} RMB`
    );

    if (input.paymentStatus === "paid" && input.paymentAccountId) {
      await addAccountDelta(
        tx,
        input.paymentAccountId,
        "TWD",
        twdCost.neg().toFixed(2),
        "out",
        "purchase",
        purchase.id,
        actor.id,
        `支付買入成本 ${toDbMoney(twdCost)} TWD`
      );
    }

    await writeAudit(tx, {
      action: AuditAction.CREATE_PURCHASE,
      targetType: "purchase",
      targetId: purchase.id,
      after: purchase,
      actor
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
    const customerId = input.customerId ?? (await tx.insert(customers).values({ name: input.customerName || "未命名客戶" }).onConflictDoUpdate({
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

    const allocation = allocateFifo(lots, input.rmbAmount, { allowShort: true });
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

    const [customer] = await tx.select({ name: customers.name }).from(customers).where(eq(customers.id, customerId));
    const customerName = customer?.name ?? "客戶";

    await addAccountDelta(
      tx,
      input.rmbAccountId,
      "RMB",
      `-${toDbMoney(input.rmbAmount)}`,
      "out",
      "sale",
      sale.id,
      actor.id,
      `售出 RMB 給${customerName}`
    );

    await tx.insert(ledgerEntries).values({
      entryType: "receivable",
      customerId,
      relatedTable: "sales",
      relatedId: sale.id,
      direction: "in",
      currency: "TWD",
      amount: toDbMoney(twdAmount),
      description: `${customerName} 應收增加`,
      operatorId: actor.id
    });

    await writeAudit(tx, {
      action: AuditAction.CREATE_SALE,
      targetType: "sale",
      targetId: sale.id,
      after: sale,
      actor
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

    const [customer] = await tx.select({ name: customers.name }).from(customers).where(eq(customers.id, input.customerId));
    const customerName = customer?.name ?? "客戶";
    const description = input.note?.trim()
      ? `收帳：${customerName}（${input.note.trim()}）`
      : `收帳：${customerName}`;
    await addAccountDelta(tx, input.accountId, "TWD", input.amountTwd, "in", "settlement", settlement.id, actor.id, description);

    await writeAudit(tx, {
      action: AuditAction.CREATE_SETTLEMENT,
      targetType: "settlement",
      targetId: settlement.id,
      after: settlement,
      actor
    });

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
    if (!from || !to) throw new Error("找不到帳戶");
    if (from.currency !== to.currency) throw new Error("轉帳帳戶幣別必須相同");

    const [transfer] = await tx.insert(transfers).values({
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: toDbMoney(input.amount),
      note: input.note,
      operatorId: actor.id
    }).returning();

    const transferNote = input.note?.trim() ? `轉帳：${input.note.trim()}` : "帳戶轉帳";
    await addAccountDelta(tx, input.fromAccountId, from.currency as Currency, `-${toDbMoney(input.amount)}`, "out", "transfer", transfer.id, actor.id, transferNote);
    await addAccountDelta(tx, input.toAccountId, to.currency as Currency, input.amount, "in", "transfer", transfer.id, actor.id, transferNote);

    await writeAudit(tx, {
      action: AuditAction.CREATE_TRANSFER,
      targetType: "transfer",
      targetId: transfer.id,
      after: transfer,
      actor
    });

    return transfer;
  });
}

async function addAccountDelta(
  tx: DbTx,
  accountId: number,
  currency: Currency,
  amount: string,
  direction: "in" | "out",
  relatedTable: string,
  relatedId: number,
  operatorId: number,
  description: string,
  entryType?: string
) {
  const [before] = await tx.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.id, accountId));
  await tx.update(accounts).set({ balance: sql`${accounts.balance} + ${toDbMoney(amount)}` }).where(eq(accounts.id, accountId));
  const [after] = await tx.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.id, accountId));

  const entryTypeLabel =
    entryType ??
    (relatedTable === "purchase"
      ? "買入"
      : relatedTable === "sale"
        ? "售出"
        : relatedTable === "transfer"
          ? "轉帳"
          : relatedTable === "settlement"
            ? "收帳"
            : relatedTable);

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

async function rmbDepositLot(
  tx: DbTx,
  accountId: number,
  rmbAmount: string,
  exchangeRate: string,
  operatorId: number
) {
  const channelId = await ensureChannelId(tx, DEPOSIT_CHANNEL);
  const twdCost = calcTwd(rmbAmount, exchangeRate);
  const [purchase] = await tx
    .insert(purchases)
    .values({
      channelId,
      depositAccountId: accountId,
      rmbAmount: toDbMoney(rmbAmount),
      exchangeRate: toDbRate(exchangeRate),
      twdCost: toDbMoney(twdCost),
      paymentStatus: "paid",
      operatorId
    })
    .returning();

  await tx.insert(rmbLots).values({
    purchaseId: purchase.id,
    accountId,
    originalRmb: toDbMoney(rmbAmount),
    remainingRmb: toDbMoney(rmbAmount),
    unitCostTwd: toDbRate(twdCost.div(rmbAmount)),
    exchangeRate: toDbRate(exchangeRate)
  });

  return { purchase, twdCost: toDbMoney(twdCost) };
}

async function consumeRmbLotsFifo(tx: DbTx, accountId: number, rmbAmount: string) {
  const lots = await tx
    .select({
      id: rmbLots.id,
      remainingRmb: rmbLots.remainingRmb,
      unitCostTwd: rmbLots.unitCostTwd
    })
    .from(rmbLots)
    .where(and(eq(rmbLots.accountId, accountId), gt(rmbLots.remainingRmb, "0")))
    .orderBy(asc(rmbLots.createdAt), asc(rmbLots.id));

  const allocation = allocateFifo(lots, rmbAmount);
  if (Number(allocation.shortfallRmb) > 0) {
    throw new Error(`RMB 庫存不足，尚缺 ${allocation.shortfallRmb} RMB`);
  }

  for (const item of allocation.allocations) {
    await tx
      .update(rmbLots)
      .set({ remainingRmb: sql`${rmbLots.remainingRmb} - ${item.allocatedRmb}` })
      .where(eq(rmbLots.id, item.lotId));
  }

  return allocation;
}

export async function createAccountAdjustment(
  input: {
    accountId: number;
    direction: "in" | "out";
    amount: string;
    exchangeRate?: string;
    note?: string;
    withdrawType?: "capital" | "profit";
  },
  actor: Actor
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, input.accountId));
    if (!account) throw new Error("找不到帳戶");
    if (Number(input.amount) <= 0) throw new Error("金額必須大於 0");
    if (input.direction === "out" && input.withdrawType === "profit" && account.currency !== "TWD") {
      throw new Error("分潤只能從台幣帳戶提取");
    }

    const note = input.note?.trim();
    const noteSuffix = note ? `：${note}` : "";

    if (account.currency === "RMB") {
      if (!input.exchangeRate || Number(input.exchangeRate) <= 0) {
        throw new Error("人民幣入出金請填寫匯率");
      }

      if (input.direction === "in") {
        const { purchase, twdCost } = await rmbDepositLot(tx, account.id, input.amount, input.exchangeRate, actor.id);
        const description = `${account.name} 入金 @${toDbRate(input.exchangeRate)}，帳面成本 ${twdCost} TWD${noteSuffix}`;
        await addAccountDelta(
          tx,
          account.id,
          "RMB",
          input.amount,
          "in",
          "入金",
          purchase.id,
          actor.id,
          description,
          "入金"
        );
        const depositResult = { entryType: "入金", amount: input.amount, exchangeRate: input.exchangeRate, bookCostTwd: twdCost };
        await writeAudit(tx, {
          action: AuditAction.CREATE_ADJUSTMENT,
          targetType: "adjustment",
          targetId: input.accountId,
          after: depositResult,
          actor
        });
        return depositResult;
      }

      const allocation = await consumeRmbLotsFifo(tx, account.id, input.amount);
      const nominalTwd = toDbMoney(calcTwd(input.amount, input.exchangeRate));
      const description = `${account.name} 撤資 @${toDbRate(input.exchangeRate)}，FIFO 成本 ${allocation.totalCostTwd} TWD，名目 ${nominalTwd} TWD${noteSuffix}`;
      await addAccountDelta(
        tx,
        account.id,
        "RMB",
        `-${input.amount}`,
        "out",
        "撤資",
        0,
        actor.id,
        description,
        "撤資"
      );
      const withdrawResult = {
        entryType: "撤資",
        amount: input.amount,
        exchangeRate: input.exchangeRate,
        bookCostTwd: allocation.totalCostTwd,
        nominalTwd
      };
      await writeAudit(tx, {
        action: AuditAction.CREATE_ADJUSTMENT,
        targetType: "adjustment",
        targetId: input.accountId,
        after: withdrawResult,
        actor
      });
      return withdrawResult;
    }

    const entryType = input.direction === "in" ? "入金" : input.withdrawType === "profit" ? "分潤" : "撤資";
    const relatedTable = input.direction === "out" && input.withdrawType === "profit" ? "profit" : entryType;
    const signedAmount = input.direction === "in" ? input.amount : `-${input.amount}`;
    const description = `${account.name} ${entryType}${noteSuffix}`;

    await addAccountDelta(
      tx,
      account.id,
      account.currency as Currency,
      signedAmount,
      input.direction,
      relatedTable,
      0,
      actor.id,
      description,
      entryType
    );

    const result = { entryType, amount: input.amount };
    await writeAudit(tx, {
      action: AuditAction.CREATE_ADJUSTMENT,
      targetType: "adjustment",
      targetId: input.accountId,
      after: result,
      actor
    });
    return result;
  });
}

export async function payPurchasePayment(
  input: { purchaseId: number; accountId: number; amountTwd: string },
  actor: Actor
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(purchases).where(eq(purchases.id, input.purchaseId));
    if (!purchase) throw new Error("找不到買入紀錄");
    await assertPurchasePayable(tx, purchase);
    assertPurchaseEditable(purchase);
    if (purchase.paymentStatus === "paid") throw new Error("此買入已付清");
    if (Number(input.amountTwd) <= 0) throw new Error("金額必須大於 0");
    if (Number(input.amountTwd) > Number(purchase.twdCost)) throw new Error("付款金額超過應付餘額");

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
      `支付買入款 #${purchase.id}`
    );

    await writeAudit(tx, {
      action: AuditAction.CREATE_PURCHASE_PAYMENT,
      targetType: "purchase",
      targetId: purchase.id,
      after: { purchaseId: purchase.id, amountTwd: input.amountTwd, accountId: input.accountId },
      actor
    });

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
