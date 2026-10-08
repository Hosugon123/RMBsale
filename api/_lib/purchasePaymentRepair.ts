import { sql } from "drizzle-orm";
import { getDb } from "./db.js";

/** Rebuild stored payment status from actual cash-account payment rows. */
export async function repairPurchasePaymentStatuses() {
  const db = getDb();
  await db.execute(sql`
    with payment_totals as (
      select p.id, p.twd_cost,
        coalesce(sum(le.amount) filter (where
          le.direction = 'out'
          and le.currency = 'TWD'
          and le.account_id is not null
          and le.is_reversal = false
          and not exists (select 1 from ledger_entries reversal where reversal.reverses_ledger_id = le.id)
        ), 0) as total
      from purchases p
      left join ledger_entries le on le.related_table = 'purchases' and le.related_id = p.id
      where p.status = 'active'
      group by p.id, p.twd_cost
    )
    update purchases p
    set payment_status = case
      when paid.total >= p.twd_cost then 'paid'
      when paid.total > 0 then 'partial'
      else 'unpaid'
    end
    from payment_totals paid
    where p.id = paid.id
      and p.payment_status is distinct from case
        when paid.total >= p.twd_cost then 'paid'
        when paid.total > 0 then 'partial'
        else 'unpaid'
      end
  `);
}
