import { and, eq, gt } from "drizzle-orm";
import { getDb, type DbTx } from "./db.js";
import { money, toDbMoney } from "./money.js";
import { customers, ledgerEntries, sales } from "./schema.js";

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
  if (money(params.profitTwd).lte(0)) return;

  await tx.insert(ledgerEntries).values({
    entryType: "利潤",
    customerId: params.customerId,
    relatedTable: "sales",
    relatedId: params.saleId,
    direction: "in",
    currency: "TWD",
    amount: toDbMoney(params.profitTwd),
    description: `${params.customerName} 售出利潤`,
    operatorId: params.operatorId
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
    .where(and(eq(sales.status, "active"), gt(sales.profitTwd, "0")));

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

export async function getAvailableProfitTwd(tx: DbTx) {
  const activeSales = await tx
    .select({ profitTwd: sales.profitTwd })
    .from(sales)
    .where(eq(sales.status, "active"));
  const earned = activeSales.reduce((sum, row) => sum.add(row.profitTwd), money(0));

  const withdrawals = await tx
    .select({ amount: ledgerEntries.amount })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.relatedTable, "profit"),
        eq(ledgerEntries.direction, "out"),
        eq(ledgerEntries.currency, "TWD"),
        eq(ledgerEntries.isReversal, false)
      )
    );
  const withdrawn = withdrawals.reduce((sum, row) => sum.add(row.amount), money(0));

  return earned.sub(withdrawn);
}
