import { describe, expect, it } from "vitest";
import {
  accountFifoRmb,
  addPurchase,
  addSale,
  addTransfer,
  createSeedState,
  reconcileLocalRmbLotInventory,
  totals
} from "../../lib/localStore";
import { d } from "../../lib/utils";
import { assertAccountFifoMatchesLots, assertDashboardTotals } from "./_helpers";

/** Part 8／8：FIFO 庫存 — 批次、消耗、內轉、帳戶餘額一致 */
describe("page audit 8/8 FIFO 庫存", () => {
  it("purchase creates lot with remaining equal to original", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;
    addPurchase(state, {
      channelName: "庫存渠道",
      depositAccountId: rmbAccount.id,
      rmbAmount: "3000",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    const lot = state.rmbLots.find((item) => item.purchaseId === state.purchases[0].id);
    expect(lot?.originalRmb).toBe("3000.00");
    expect(lot?.remainingRmb).toBe("3000.00");
    expect(totals(state).inventory).toBe(
      state.rmbLots.reduce((sum, item) => sum.add(item.remainingRmb), d(0)).toFixed(2)
    );
  });

  it("sale consumes oldest lot first (FIFO)", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.id === 4)!;
    const lotsBefore = state.rmbLots
      .filter((lot) => lot.accountId === rmbAccount.id && d(lot.remainingRmb).gt(0))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const oldest = lotsBefore[0];
    const remainingBefore = oldest.remainingRmb;
    addSale(state, {
      customerName: "FIFO客戶",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.6"
    });
    const oldestAfter = state.rmbLots.find((lot) => lot.id === oldest.id);
    expect(d(oldestAfter?.remainingRmb ?? 0).lt(remainingBefore)).toBe(true);
    assertAccountFifoMatchesLots(state, rmbAccount.id);
  });

  it("sale allocation links sale to purchase lot", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.id === 4)!;
    addSale(state, {
      customerName: "分配客戶",
      rmbAccountId: rmbAccount.id,
      rmbAmount: "500",
      exchangeRate: "4.6"
    });
    const sale = state.sales[0];
    const allocation = state.saleAllocations.find((item) => item.saleId === sale.id);
    expect(allocation?.allocatedRmb).toBe("500.00");
    expect(allocation?.purchaseId).toBeTruthy();
  });

  it("RMB transfer moves lot quantities between accounts", () => {
    const state = createSeedState();
    const from = state.accounts.find((account) => account.id === 4)!;
    const to = state.accounts.find((account) => account.id === 2)!;
    const fromBefore = accountFifoRmb(state, from.id);
    const toBefore = accountFifoRmb(state, to.id);
    addTransfer(state, { fromAccountId: from.id, toAccountId: to.id, amount: "1000" });
    expect(accountFifoRmb(state, from.id)).toBe(d(fromBefore).sub("1000").toFixed(2));
    expect(accountFifoRmb(state, to.id)).toBe(d(toBefore).add("1000").toFixed(2));
    assertAccountFifoMatchesLots(state, from.id);
    assertAccountFifoMatchesLots(state, to.id);
    assertDashboardTotals(state);
  });

  it("reconcile keeps account fifo aligned with lots", () => {
    const state = createSeedState();
    reconcileLocalRmbLotInventory(state);
    for (const account of state.accounts.filter((item) => item.currency === "RMB")) {
      assertAccountFifoMatchesLots(state, account.id);
    }
  });
});
