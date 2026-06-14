import { describe, expect, it } from "vitest";
import {
  createSpecialClientDeposit,
  createSpecialClientPayout,
  getSpecialClientWallet,
  reverseSpecialClientWalletEntry
} from "../lib/localSpecialClientWallet";
import { createSeedState, reverseOperation, totals } from "../lib/localStore";

describe("local special client wallet", () => {
  it("seeds default client and loads wallet data", () => {
    const state = createSeedState();
    const wallet = getSpecialClientWallet(state);
    expect(wallet.clients).toHaveLength(1);
    expect(wallet.clients[0]?.name).toBe("儲值客戶");
    expect(wallet.rmbAccounts.length).toBeGreaterThan(0);
  });

  it("deposit credits balance, cash account, and profit ledger", () => {
    const state = createSeedState();
    const accountId = state.accounts.find((account) => account.currency === "RMB")!.id;

    const wallet = createSpecialClientDeposit(state, {
      clientId: 1,
      entryDate: "2026-06-09",
      grossRmb: "100000",
      cashAccountId: accountId
    });

    expect(wallet.summary.balanceRmb).toBe("98900.00");
    expect(wallet.entries).toHaveLength(1);
    expect(state.accounts.find((account) => account.id === accountId)?.balance).toBe("138000.00");
    expect(totals(state).walletDepositProfitRmb).toBe("1100.00");
  });

  it("payout debits balance and cash account", () => {
    const state = createSeedState();
    const accountId = state.accounts.find((account) => account.currency === "RMB")!.id;
    createSpecialClientDeposit(state, {
      clientId: 1,
      entryDate: "2026-06-09",
      grossRmb: "100000",
      cashAccountId: accountId
    });

    const wallet = createSpecialClientPayout(state, {
      clientId: 1,
      entryDate: "2026-06-09",
      payoutRmb: "50000",
      cashAccountId: accountId,
      purpose: "廠商付款"
    });

    expect(wallet.summary.balanceRmb).toBe("48900.00");
    expect(wallet.entries.some((entry) => entry.type === "payout")).toBe(true);
  });

  it("reverse deposit restores balance and reverses profit", () => {
    const state = createSeedState();
    const accountId = state.accounts.find((account) => account.currency === "RMB")!.id;
    const deposited = createSpecialClientDeposit(state, {
      clientId: 1,
      entryDate: "2026-06-09",
      grossRmb: "100000",
      cashAccountId: accountId
    });
    const entryId = deposited.entries[0]!.id;

    const wallet = reverseSpecialClientWalletEntry(state, {
      entryId,
      reverseReason: "測試沖銷",
      clientId: 1
    });

    expect(wallet.summary.balanceRmb).toBe("0.00");
    expect(totals(state).walletDepositProfitRmb).toBe("0.00");
    expect(wallet.entries.find((entry) => entry.id === entryId)?.reversedAt).toBeTruthy();
  });

  it("reverseOperation from ledger page reverses wallet entry", () => {
    const state = createSeedState();
    const accountId = state.accounts.find((account) => account.currency === "RMB")!.id;
    const deposited = createSpecialClientDeposit(state, {
      clientId: 1,
      entryDate: "2026-06-09",
      grossRmb: "50000",
      cashAccountId: accountId
    });

    reverseOperation(state, { entityType: "specialClientWallet", entityId: deposited.entries[0]!.id });
    expect(getSpecialClientWallet(state).summary.balanceRmb).toBe("0.00");
  });
});
