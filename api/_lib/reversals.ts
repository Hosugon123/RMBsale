import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, type DbTx } from "./db.js";
import { calcTwd, toDbMoney, toDbRate } from "./money.js";
import { AuditAction, writeAudit } from "./audit.js";
import { assertNotReversedStatus, assertSaleEditable } from "./locks.js";
import { reverseRmbLotTransfer } from "./rmbInventory.js";
import {
  accounts,
  channels,
  customers,
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

export type ReversalEntityType = "purchase" | "sale" | "settlement" | "transfer" | "adjustment";

const DEPOSIT_CHANNEL = "入金";

async function assertNotReversed(tx: DbTx, ledgerId: number) {
  const [existing] = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.reversesLedgerId, ledgerId))
    .limit(1);
  if (existing) throw new Error("此筆操作已作廢");
}

async function postReversalDelta(
  tx: DbTx,
  accountId: number,
  currency: Currency,
  signedAmount: string,
  direction: "in" | "out",
  relatedTable: string,
  relatedId: number,
  operatorId: number,
  description: string,
  reversesLedgerId: number,
  entryType?: string
) {
  const [before] = await tx.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.id, accountId));
  const [after] = await tx
    .update(accounts)
    .set({ balance: sql`${accounts.balance} + ${toDbMoney(signedAmount)}` })
    .where(eq(accounts.id, accountId))
    .returning({ balance: accounts.balance });

  await tx.insert(ledgerEntries).values({
    entryType: entryType ?? "作廢",
    accountId,
    relatedTable,
    relatedId,
    direction,
    currency,
    amount: toDbMoney(Math.abs(Number(signedAmount))),
    balanceBefore: before?.balance,
    balanceAfter: after?.balance,
    description,
    isReversal: true,
    reversesLedgerId,
    operatorId
  });
}

export async function reversePurchase(purchaseId: number, actor: Actor) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId));
    if (!purchase) throw new Error("找不到買入紀錄或已作廢");
    assertNotReversedStatus(purchase.status, "進貨單");

    const [lot] = await tx.select().from(rmbLots).where(eq(rmbLots.purchaseId, purchaseId));
    if (!lot) throw new Error("找不到對應庫存批次");
    if (Number(lot.remainingRmb) !== Number(lot.originalRmb)) {
      throw new Error("此買入的庫存已被動用，請先作廢相關售出或出金");
    }

    const [rmbLedger] = await tx
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.relatedTable, "purchase"), eq(ledgerEntries.relatedId, purchaseId), eq(ledgerEntries.isReversal, false)))
      .orderBy(asc(ledgerEntries.id))
      .limit(1);

    if (rmbLedger?.accountId) {
      await postReversalDelta(
        tx,
        rmbLedger.accountId,
        "RMB",
        `-${purchase.rmbAmount}`,
        "out",
        "purchase",
        purchaseId,
        actor.id,
        `作廢買入 #${purchaseId}`,
        rmbLedger.id,
        "買入作廢"
      );
    }

    if (purchase.paymentStatus === "paid" && purchase.paymentAccountId) {
      const [payLedger] = await tx
        .select()
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.relatedTable, "purchase"),
            eq(ledgerEntries.relatedId, purchaseId),
            eq(ledgerEntries.accountId, purchase.paymentAccountId),
            eq(ledgerEntries.direction, "out"),
            eq(ledgerEntries.isReversal, false)
          )
        )
        .limit(1);
      if (payLedger?.accountId) {
        await postReversalDelta(
          tx,
          payLedger.accountId,
          "TWD",
          purchase.twdCost,
          "in",
          "purchase",
          purchaseId,
          actor.id,
          `作廢買入退款 #${purchaseId}`,
          payLedger.id,
          "買入作廢"
        );
      }
    }

    await tx.update(rmbLots).set({ remainingRmb: "0.00" }).where(eq(rmbLots.id, lot.id));
    await tx
      .update(purchases)
      .set({
        status: "reversed",
        deletedAt: new Date(),
        deletedBy: actor.id,
        deleteReason: "作廢進貨單"
      })
      .where(eq(purchases.id, purchaseId));

    await writeAudit(tx, {
      action: AuditAction.DELETE_PURCHASE,
      targetType: "purchase",
      targetId: purchaseId,
      before: purchase,
      after: { status: "reversed" },
      actor
    });

    return purchase;
  });
}

export async function reverseSale(saleId: number, actor: Actor) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId));
    if (!sale) throw new Error("找不到售出紀錄或已作廢");
    assertSaleEditable(sale);
    assertNotReversedStatus(sale.status, "銷貨單");
    if (sale.settlementStatus !== "unsettled") {
      throw new Error("此售出已收款或部分收款，請先作廢相關收帳");
    }

    const allocations = await tx.select().from(saleAllocations).where(eq(saleAllocations.saleId, saleId));
    for (const item of allocations) {
      await tx
        .update(rmbLots)
        .set({ remainingRmb: sql`${rmbLots.remainingRmb} + ${item.allocatedRmb}` })
        .where(eq(rmbLots.id, item.lotId));
    }

    await tx
      .update(customers)
      .set({ receivableTwd: sql`${customers.receivableTwd} - ${sale.twdAmount}` })
      .where(eq(customers.id, sale.customerId));

    const [rmbLedger] = await tx
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.relatedTable, "sale"), eq(ledgerEntries.relatedId, saleId), eq(ledgerEntries.isReversal, false)))
      .limit(1);
    if (rmbLedger?.accountId) {
      await postReversalDelta(
        tx,
        rmbLedger.accountId,
        "RMB",
        sale.rmbAmount,
        "in",
        "sale",
        saleId,
        actor.id,
        `作廢售出 #${saleId}`,
        rmbLedger.id,
        "售出作廢"
      );
    }

    const receivableLedgers = await tx
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.customerId, sale.customerId),
          eq(ledgerEntries.relatedTable, "sales"),
          eq(ledgerEntries.relatedId, saleId),
          eq(ledgerEntries.isReversal, false)
        )
      );
    for (const row of receivableLedgers) {
      await tx.insert(ledgerEntries).values({
        entryType: "作廢",
        customerId: row.customerId,
        relatedTable: row.relatedTable,
        relatedId: row.relatedId,
        direction: row.direction === "in" ? "out" : "in",
        currency: row.currency,
        amount: row.amount,
        description: `作廢售出應收 #${saleId}`,
        isReversal: true,
        reversesLedgerId: row.id,
        operatorId: actor.id
      });
    }

    await tx
      .update(sales)
      .set({
        status: "reversed",
        deletedAt: new Date(),
        deletedBy: actor.id,
        deleteReason: "作廢銷貨單"
      })
      .where(eq(sales.id, saleId));

    await writeAudit(tx, {
      action: AuditAction.DELETE_SALE,
      targetType: "sale",
      targetId: saleId,
      before: sale,
      after: { status: "reversed" },
      actor
    });

    return sale;
  });
}

export async function reverseSettlement(settlementId: number, actor: Actor) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [settlement] = await tx.select().from(settlements).where(eq(settlements.id, settlementId));
    if (!settlement) throw new Error("找不到收帳紀錄或已作廢");
    assertNotReversedStatus(settlement.status, "收帳紀錄");

    await tx
      .update(customers)
      .set({ receivableTwd: sql`${customers.receivableTwd} + ${settlement.amountTwd}` })
      .where(eq(customers.id, settlement.customerId));

    const [ledger] = await tx
      .select()
      .from(ledgerEntries)
      .where(
        and(eq(ledgerEntries.relatedTable, "settlement"), eq(ledgerEntries.relatedId, settlementId), eq(ledgerEntries.isReversal, false))
      )
      .limit(1);
    if (ledger?.accountId) {
      await postReversalDelta(
        tx,
        ledger.accountId,
        "TWD",
        `-${settlement.amountTwd}`,
        "out",
        "settlement",
        settlementId,
        actor.id,
        `作廢收帳 #${settlementId}`,
        ledger.id,
        "收帳作廢"
      );
    }

    await tx
      .update(settlements)
      .set({
        status: "reversed",
        deletedAt: new Date(),
        deletedBy: actor.id,
        deleteReason: "作廢收帳"
      })
      .where(eq(settlements.id, settlementId));

    await writeAudit(tx, {
      action: AuditAction.REVERSE_OPERATION,
      targetType: "settlement",
      targetId: settlementId,
      before: settlement,
      after: { status: "reversed" },
      actor
    });

    return settlement;
  });
}

export async function reverseTransfer(transferId: number, actor: Actor) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(transfers).where(eq(transfers.id, transferId));
    if (!transfer) throw new Error("找不到轉帳紀錄或已作廢");
    assertNotReversedStatus(transfer.status, "轉帳紀錄");

    const [fromAccount] = await tx
      .select({ currency: accounts.currency })
      .from(accounts)
      .where(eq(accounts.id, transfer.fromAccountId));
    if (fromAccount?.currency === "RMB") {
      await reverseRmbLotTransfer(tx, transferId, transfer.fromAccountId);
    }

    const ledgers = await tx
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.relatedTable, "transfer"), eq(ledgerEntries.relatedId, transferId), eq(ledgerEntries.isReversal, false)));

    for (const row of ledgers) {
      if (!row.accountId) continue;
      const [account] = await tx.select({ currency: accounts.currency }).from(accounts).where(eq(accounts.id, row.accountId));
      if (!account) continue;
      const signed = row.direction === "in" ? `-${row.amount}` : row.amount;
      const direction = row.direction === "in" ? "out" : "in";
      await postReversalDelta(
        tx,
        row.accountId,
        account.currency as Currency,
        signed,
        direction,
        "transfer",
        transferId,
        actor.id,
        `作廢轉帳 #${transferId}`,
        row.id,
        "轉帳作廢"
      );
    }

    await tx
      .update(transfers)
      .set({
        status: "reversed",
        deletedAt: new Date(),
        deletedBy: actor.id,
        deleteReason: "作廢轉帳"
      })
      .where(eq(transfers.id, transferId));

    await writeAudit(tx, {
      action: AuditAction.REVERSE_OPERATION,
      targetType: "transfer",
      targetId: transferId,
      before: transfer,
      after: { status: "reversed" },
      actor
    });

    return transfer;
  });
}

async function isDepositChannelPurchase(tx: DbTx, purchaseId: number) {
  const [purchase] = await tx
    .select({ channelId: purchases.channelId })
    .from(purchases)
    .where(eq(purchases.id, purchaseId));
  if (!purchase?.channelId) return false;
  const [channel] = await tx.select({ name: channels.name }).from(channels).where(eq(channels.id, purchase.channelId));
  return channel?.name === DEPOSIT_CHANNEL;
}

export async function reverseAdjustment(ledgerEntryId: number, actor: Actor) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.id, ledgerEntryId));
    if (!entry || entry.isReversal) throw new Error("找不到流水紀錄");
    await assertNotReversed(tx, ledgerEntryId);

    if (entry.entryType === "入金" && entry.relatedTable === "入金" && entry.relatedId && entry.accountId) {
      const purchaseId = entry.relatedId;
      const [purchase] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId));
      if (purchase && purchase.status !== "reversed" && (await isDepositChannelPurchase(tx, purchaseId))) {
        const [lot] = await tx.select().from(rmbLots).where(eq(rmbLots.purchaseId, purchaseId));
        if (!lot || Number(lot.remainingRmb) !== Number(lot.originalRmb)) {
          throw new Error("此入金的庫存已被動用，無法作廢");
        }
        await postReversalDelta(
          tx,
          entry.accountId,
          "RMB",
          `-${entry.amount}`,
          "out",
          "入金",
          purchaseId,
          actor.id,
          `作廢入金 #${purchaseId}`,
          ledgerEntryId,
          "入金作廢"
        );
        await tx.update(rmbLots).set({ remainingRmb: "0.00" }).where(eq(rmbLots.id, lot.id));
        await tx
          .update(purchases)
          .set({
            status: "reversed",
            deletedAt: new Date(),
            deletedBy: actor.id,
            deleteReason: "作廢入金"
          })
          .where(eq(purchases.id, purchaseId));
        await writeAudit(tx, {
          action: AuditAction.REVERSE_OPERATION,
          targetType: "ledger",
          targetId: ledgerEntryId,
          before: entry,
          actor
        });
        return entry;
      }
    }

    if (!entry.accountId) throw new Error("此流水無法作廢");

    if (entry.entryType === "撤資" && entry.currency === "RMB" && entry.direction === "out") {
      const rateMatch = entry.description.match(/@([\d.]+)/);
      const exchangeRate = rateMatch?.[1];
      if (!exchangeRate) throw new Error("無法還原人民幣撤資匯率，請聯絡管理員");
      const channelId = await (async () => {
        const [existing] = await tx.select({ id: channels.id }).from(channels).where(eq(channels.name, DEPOSIT_CHANNEL));
        if (existing) return existing.id;
        const [created] = await tx.insert(channels).values({ name: DEPOSIT_CHANNEL }).returning({ id: channels.id });
        return created.id;
      })();
      const twdCost = calcTwd(entry.amount, exchangeRate);
      const [purchase] = await tx
        .insert(purchases)
        .values({
          channelId,
          depositAccountId: entry.accountId,
          rmbAmount: entry.amount,
          exchangeRate: toDbRate(exchangeRate),
          twdCost: toDbMoney(twdCost),
          paymentStatus: "paid",
          operatorId: actor.id
        })
        .returning();
      await tx.insert(rmbLots).values({
        purchaseId: purchase.id,
        accountId: entry.accountId,
        originalRmb: entry.amount,
        remainingRmb: entry.amount,
        unitCostTwd: toDbRate(twdCost.div(entry.amount)),
        exchangeRate: toDbRate(exchangeRate)
      });
    }

    const signed = entry.direction === "in" ? `-${entry.amount}` : entry.amount;
    const direction = entry.direction === "in" ? "out" : "in";
    await postReversalDelta(
      tx,
      entry.accountId,
      entry.currency as Currency,
      signed,
      direction,
      entry.relatedTable ?? "adjustment",
      entry.relatedId ?? ledgerEntryId,
      actor.id,
      `作廢：${entry.description}`,
      ledgerEntryId,
      `${entry.entryType}作廢`
    );

    await writeAudit(tx, {
      action: AuditAction.REVERSE_OPERATION,
      targetType: "ledger",
      targetId: ledgerEntryId,
      before: entry,
      actor
    });

    return entry;
  });
}

export async function reverseOperation(
  input: { entityType: ReversalEntityType; entityId: number },
  actor: Actor
) {
  switch (input.entityType) {
    case "purchase":
      return reversePurchase(input.entityId, actor);
    case "sale":
      return reverseSale(input.entityId, actor);
    case "settlement":
      return reverseSettlement(input.entityId, actor);
    case "transfer":
      return reverseTransfer(input.entityId, actor);
    case "adjustment":
      return reverseAdjustment(input.entityId, actor);
    default:
      throw new Error("不支援的作廢類型");
  }
}

/** 由流水列判斷可否作廢（每組業務操作只顯示一次按鈕） */
export function resolveReversalTarget(relatedTable?: string | null, relatedId?: number | null, entryType?: string) {
  if (!relatedTable || relatedId == null) {
    if (entryType && ["入金", "撤資", "分潤"].includes(entryType)) {
      return null;
    }
    return null;
  }
  if (relatedTable === "purchase") return { entityType: "purchase" as const, entityId: relatedId };
  if (relatedTable === "sale") return { entityType: "sale" as const, entityId: relatedId };
  if (relatedTable === "settlement") return { entityType: "settlement" as const, entityId: relatedId };
  if (relatedTable === "transfer") return { entityType: "transfer" as const, entityId: relatedId };
  if (relatedTable === "入金" || relatedTable === "撤資" || relatedTable === "profit" || relatedTable === "分潤") {
    return null;
  }
  return null;
}
