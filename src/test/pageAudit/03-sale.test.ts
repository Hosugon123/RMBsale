import { describe, expect, it } from "vitest";
import {
  accountFifoRmb,
  addSale,
  addSettlement,
  createSeedState,
  previewSaleProfit,
  reverseOperation,
  sortedProfitLedgerWithBalances,
  sortedReceivableLedgerWithBalances
} from "../../lib/localStore";
import { d } from "../../lib/utils";
import {
  assertAccountFifoMatchesLots,
  assertCustomerReceivableLedger,
  assertDashboardTotals
} from "./_helpers";

/** Part 3／8：售出錄入 — 售出、應收、利潤、FIFO */
describe("page audit 3/8 售出錄入", () => {
  it("creates sale with receivable, profit, and fifo consumption", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    const fifoBefore = d(accountFifoRmb(state, rmbAccount.id));

    const preview = previewSaleProfit(state, {
      rmbAccountId: rmbAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.6"
    });
    expect(preview?.twdAmount).toBe("4600.00");
    expect(d(preview?.profitTwd ?? 0).gte(0)).toBe(true);

    addSale(state, {
      customerName: "售出稽核",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.6"
    });
    const customer = state.customers.find((item) => item.name === "售出稽核")!;
    const sale = state.sales[0];
    expect(customer.receivableTwd).toBe("4600.00");
    expect(sale.settlementStatus).toBe("unsettled");
    expect(d(accountFifoRmb(state, rmbAccount.id)).eq(fifoBefore.sub("1000"))).toBe(true);
    assertAccountFifoMatchesLots(state, rmbAccount.id);
    assertCustomerReceivableLedger(state, customer.id);
    assertDashboardTotals(state);
  });

  it("records paired receivable and profit ledger for sale", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    addSale(state, {
      customerName: "流水稽核",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "500",
      exchangeRate: "4.6"
    });
    const sale = state.sales[0];
    const receivableRow = sortedReceivableLedgerWithBalances(state).find(
      (entry) => entry.relatedId === sale.id && entry.entryType === "應收"
    );
    const profitRow = sortedProfitLedgerWithBalances(state).find(
      (entry) => entry.relatedId === sale.id && entry.entryType === "利潤"
    );
    expect(receivableRow?.direction).toBe("in");
    expect(receivableRow?.amount).toBe(sale.twdAmount);
    expect(profitRow?.amount).toBe(sale.profitTwd);
  });

  it("rejects sale reversal after settlement", () => {
    const state = createSeedState();
    const sale = state.sales[0];
    addSettlement(state, { customerId: sale.customerId, accountId: 1, amountTwd: "1000" });
    expect(() => reverseOperation(state, { entityType: "sale", entityId: sale.id })).toThrow(
      "此售出已收款，請先作廢相關收帳"
    );
  });

  it("allows sale reversal when unsettled and restores fifo", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.id === 4)!;
    const fifoBefore = accountFifoRmb(state, rmbAccount.id);
    addSale(state, {
      customerName: "作廢售出",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "200",
      exchangeRate: "4.6"
    });
    const sale = state.sales[0];
    reverseOperation(state, { entityType: "sale", entityId: sale.id });
    expect(sale.status).toBe("reversed");
    expect(accountFifoRmb(state, rmbAccount.id)).toBe(fifoBefore);
  });
});
