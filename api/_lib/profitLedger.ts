import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, type DbTx } from "./db.js";
import { money, toDbTwd, twdMoney } from "./money.js";
import { customers, ledgerEntries, sales } from "./schema.js";

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
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.entryType, "利潤"),
        eq(ledgerEntries.relatedTable, "sales"),
        eq(ledgerEntries.relatedId, params.saleId),
        eq(ledgerEntries.isReversal, false)
      )
    )
    .limit(1);

  if (profit.lte(0)) {
    if (existing) await tx.delete(ledgerEntries).where(eq(ledgerEntries.id, existing.id));
    return;
  }

  const values = {
    customerId: params.customerId,
    amount: toDbTwd(profit),
    description: `${params.customerName} 售出利潤`,
    operatorId: params.operatorId
  };

  if (existing) {
    await tx.update(ledgerEntries).set(values).where(eq(ledgerEntries.id, existing.id));
    return;
  }

  await tx.insert(ledgerEntries).values({
    entryType: "利潤",
    relatedTable: "sales",
    relatedId: params.saleId,
    direction: "in",
    currency: "TWD",
    ...values
  });
}

/** 為歷史售出補齊遺漏的利潤流水（與本機 ensureProfitLedgerEntries 對齊）。 */
export async function ensureProfitLedgerEntries() {
  const db = getDb();
  const activeSales = await db
    .select({
      id: sales.id,
      customerId: sales.customerId,
      profitTwd: sales.profitTwd,
      operatorId: sales.operatorId,
      createdAt: sales.createdAt,
      customerName: customers.name
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(
      and(
        eq(sales.status, "active"),
        gt(sales.profitTwd, "0"),
        sql`not exists (
          select 1
          from ledger_entries le
          where le.entry_type = '利潤'
            and le.related_table = 'sales'
            and le.related_id = ${sales.id}
            and le.is_reversal = false
        )`
      )
    );

  let inserted = 0;
  await db.transaction(async (tx) => {
    for (const sale of activeSales) {
      const [existing] = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.entryType, "利潤"),
            eq(ledgerEntries.relatedTable, "sales"),
            eq(ledgerEntries.relatedId, sale.id),
            eq(ledgerEntries.isReversal, false)
          )
        )
        .limit(1);
      if (existing) continue;

      await tx.insert(ledgerEntries).values({
        entryType: "利潤",
        customerId: sale.customerId,
        relatedTable: "sales",
        relatedId: sale.id,
        direction: "in",
        currency: "TWD",
        amount: sale.profitTwd,
        description: `${sale.customerName ?? "客戶"} 售出利潤`,
        operatorId: sale.operatorId,
        createdAt: sale.createdAt
      });
      inserted += 1;
    }
  });

  return inserted;
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
        eq(ledgerEntries.isReversal, false)
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
