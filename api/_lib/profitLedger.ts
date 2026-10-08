import { and, eq, sql } from "drizzle-orm";
import { getDb, type DbTx } from "./db.js";
import { money, toDbTwd, twdMoney } from "./money.js";
import { ledgerEntries, sales } from "./schema.js";

type DbReader = DbTx | ReturnType<typeof getDb>;

export async function insertSaleProfitLedger(
  tx: DbTx,
  params: {
    saleId: number;
    customerId: number;
    customerName: string;
    profitTwd: string;
    operatorId: number;
  }
) {
  if (twdMoney(params.profitTwd).lte(0)) return;

  await tx.insert(ledgerEntries).values({
    entryType: "利潤",
    customerId: params.customerId,
    relatedTable: "sales",
    relatedId: params.saleId,
    direction: "in",
    currency: "TWD",
    amount: toDbTwd(params.profitTwd),
    description: `${params.customerName} 售出利潤`,
    operatorId: params.operatorId
  });
}

export async function syncSaleProfitLedger(
  tx: DbTx,
  params: {
    saleId: number;
    customerId: number;
    customerName: string;
    profitTwd: string;
    operatorId: number;
  }
) {
  const profit = twdMoney(params.profitTwd);
  if (profit.lt(0)) throw new Error("利潤不可小於 0");

  const [existing] = await tx
    .select({ id: ledgerEntries.id, amount: ledgerEntries.amount })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.entryType, "利潤"),
        eq(ledgerEntries.relatedTable, "sales"),
        eq(ledgerEntries.relatedId, params.saleId),
        eq(ledgerEntries.isReversal, false),
        sql`not exists (
          select 1 from ledger_entries reversal
          where reversal.reverses_ledger_id = ${ledgerEntries.id}
            and reversal.is_reversal = true
        )`
      )
    )
    .limit(1);

  if (existing && money(existing.amount).eq(profit)) return;

  if (existing) {
    await tx.insert(ledgerEntries).values({
      entryType: "利潤調整",
      customerId: params.customerId,
      relatedTable: "sales",
      relatedId: params.saleId,
      direction: "out",
      currency: "TWD",
      amount: existing.amount,
      description: `${params.customerName} 售出利潤調整（沖銷原金額）`,
      isReversal: true,
      reversesLedgerId: existing.id,
      operatorId: params.operatorId
    });
  }

  if (profit.lte(0)) return;

  const values = {
    customerId: params.customerId,
    amount: toDbTwd(profit),
    description: `${params.customerName} 售出利潤`,
    operatorId: params.operatorId
  };

  await tx.insert(ledgerEntries).values({
    entryType: "利潤",
    relatedTable: "sales",
    relatedId: params.saleId,
    direction: "in",
    currency: "TWD",
    ...values
  });
}

export async function getAvailableProfitTwd(tx: DbReader) {
  const activeSales = await tx
    .select({ profitTwd: sales.profitTwd })
    .from(sales)
    .where(eq(sales.status, "active"));
  const saleEarned = activeSales.reduce((sum, row) => sum.add(row.profitTwd), money(0));

  const openingProfits = await tx
    .select({ amount: ledgerEntries.amount })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.relatedTable, "opening_profit"),
        eq(ledgerEntries.direction, "in"),
        eq(ledgerEntries.currency, "TWD"),
        eq(ledgerEntries.isReversal, false),
        sql`not exists (
          select 1 from ledger_entries reversal
          where reversal.reverses_ledger_id = ${ledgerEntries.id}
            and reversal.is_reversal = true
        )`
      )
    );
  const openingEarned = openingProfits.reduce((sum, row) => sum.add(row.amount), money(0));

  const interestEntries = await tx
    .select({ amount: ledgerEntries.amount, direction: ledgerEntries.direction })
    .from(ledgerEntries)
    .where(and(
      eq(ledgerEntries.relatedTable, "interest_receivable"),
      eq(ledgerEntries.currency, "TWD"),
      sql`${ledgerEntries.entryType} in ('interest', 'interest_reversal')`
    ));
  const interestEarned = interestEntries.reduce(
    (sum, row) => row.direction === "in" ? sum.add(row.amount) : sum.sub(row.amount), money(0)
  );

  const withdrawals = await tx
    .select({ amount: ledgerEntries.amount })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.relatedTable, "profit"),
        eq(ledgerEntries.direction, "out"),
        eq(ledgerEntries.currency, "TWD"),
        eq(ledgerEntries.isReversal, false),
        sql`not exists (
          select 1
          from ledger_entries reversal
          where reversal.reverses_ledger_id = ${ledgerEntries.id}
            and reversal.is_reversal = true
        )`
      )
    );
  const withdrawn = withdrawals.reduce((sum, row) => sum.add(row.amount), money(0));

  return saleEarned.add(openingEarned).add(interestEarned).sub(withdrawn);
}
