import { describe, expect, it } from "vitest";
import {
  addSale,
  addSettlement,
  createOpeningProfit,
  createSeedState,
  sortedCashLedgerWithBalances,
  sortedProfitLedgerWithBalances,
  totals
} from "../../lib/localStore";
import { sumPendingReceivable } from "../../lib/receivableDisplay";
import { d } from "../../lib/utils";
import {
  assertDashboardTotals,
  topPendingReceivableCustomers
} from "./_helpers";

/** Part 1／8：儀表板 — 帳務總覽、待收清單、流水摘要 */
describe("page audit 1/8 儀表板", () => {
  it("seed state summary matches account, receivable, inventory totals", () => {
    const state = createSeedState();
    assertDashboardTotals(state);
    expect(Number(totals(state).profit)).toBeGreaterThan(0);
  });

  it("excludes overpaid customers from receivable summary and top list", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;
    const pendingBefore = sumPendingReceivable(state.customers);
    addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "50000" });
    assertDashboardTotals(state);
    expect(topPendingReceivableCustomers(state).some((item) => item.id === customer.id)).toBe(false);
    expect(sumPendingReceivable(state.customers)).toBe(
      d(pendingBefore).sub("15800.05").toFixed(2)
    );
  });

  it("profit metric reflects sale profit plus opening profit", () => {
    const state = createSeedState();
    const before = totals(state);
    createOpeningProfit(state, { amountTwd: "500", note: "期初" });
    expect(totals(state).profit).toBe(d(before.profit).add("500").toFixed(2));
    assertDashboardTotals(state);
  });

  it("cash ledger excludes profit-only rows shown in profit ledger modal", () => {
    const state = createSeedState();
    const cashRows = sortedCashLedgerWithBalances(state);
    const profitRows = sortedProfitLedgerWithBalances(state);
    expect(cashRows.some((entry) => entry.entryType === "利潤")).toBe(false);
    expect(profitRows.some((entry) => entry.entryType === "利潤")).toBe(true);
  });

  it("top receivable list sorts by balance descending", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    addSale(state, { customerName: "大戶", rmbAccountId: rmbAccount.id, rmbAmount: "5000", exchangeRate: "4.6" });
    addSale(state, { customerName: "小戶", rmbAccountId: rmbAccount.id, rmbAmount: "100", exchangeRate: "4.6" });
    const top = topPendingReceivableCustomers(state);
    expect(top[0]?.name).toBe("大戶");
    expect(Number(top[0]?.receivableTwd)).toBeGreaterThan(Number(top[1]?.receivableTwd ?? 0));
  });
});
