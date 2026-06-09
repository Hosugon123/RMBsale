import { describe, expect, it } from "vitest";
import type { AppState } from "../lib/types";
import {
  addChannel,
  addCustomer,
  addHolder,
  addPurchase,
  addSale,
  adjustAccount,
  createSeedState,
  createUser,
  deleteAccount,
  renameChannel,
  renameCustomer
} from "../lib/localStore";

function simulateCommit(current: AppState, producer: (draft: AppState) => unknown) {
  const draft = structuredClone(current) as AppState;
  try {
    producer(draft);
    return { ok: true as const, state: draft };
  } catch (err) {
    return { ok: false as const, error: err, state: current };
  }
}

function snapshotFingerprint(state: AppState) {
  return JSON.stringify({
    customers: state.customers.length,
    channels: state.channels.filter((c) => c.isActive).length,
    sales: state.sales.length,
    rmbBalance: state.accounts.find((a) => a.id === 4)?.balance,
    purchases: state.purchases.length
  });
}

describe("store error handling (no partial apply on failure)", () => {
  it("rejects empty preset names without mutating state", () => {
    const state = createSeedState();
    const before = snapshotFingerprint(state);

    expect(() => addCustomer(state, { name: "   " })).toThrow("請輸入客戶名稱");
    expect(() => addChannel(state, { name: "" })).toThrow("請輸入渠道名稱");
    expect(() => addHolder(state, { name: "  " })).toThrow("請輸入持有人名稱");

    expect(snapshotFingerprint(state)).toBe(before);
  });

  it("reuses duplicate active customer by name without error", () => {
    const state = createSeedState();
    const before = snapshotFingerprint(state);
    addCustomer(state, { name: "阿明" });
    expect(snapshotFingerprint(state)).toBe(before);
  });

  it("rejects duplicate active preset channel names", () => {
    const state = createSeedState();
    expect(() => addChannel(state, { name: "交易所 A" })).toThrow("此渠道已存在");
  });

  it("rejects sale when RMB inventory is insufficient", () => {
    const state = createSeedState();
    state.accounts.find((a) => a.id === 4)!.balance = "0.00";
    state.rmbLots = state.rmbLots.filter((lot) => lot.accountId !== 4);

    const result = simulateCommit(state, (draft) =>
      addSale(draft, {
        customerName: "測試",
        rmbAccountId: 4,
        rmbAmount: "1000",
        exchangeRate: "4.5"
      })
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toContain("RMB 庫存不足");
    expect(result.state.sales).toHaveLength(state.sales.length);
  });

  it("allows sale after purchase replenishes inventory", () => {
    const state = createSeedState();
    state.accounts.find((a) => a.id === 4)!.balance = "0.00";
    state.rmbLots = state.rmbLots.filter((lot) => lot.accountId !== 4);
    const salesBefore = state.sales.length;

    addPurchase(state, {
      channelName: "交易所 A",
      depositAccountId: 4,
      rmbAmount: "1000",
      exchangeRate: "4.4",
      paymentStatus: "unpaid"
    });

    addSale(state, {
      customerName: "測試",
      rmbAccountId: 4,
      rmbAmount: "1000",
      exchangeRate: "4.5"
    });
    expect(state.accounts.find((a) => a.id === 4)?.balance).toBe("0.00");
    expect(state.sales).toHaveLength(salesBefore + 1);
  });

  it("allows account withdrawal below zero balance", () => {
    const state = createSeedState();
    const account = state.accounts.find((a) => a.id === 1)!;
    account.balance = "100.00";

    adjustAccount(state, { accountId: 1, direction: "out", amount: "500" });
    expect(account.balance).toBe("-400.00");

    adjustAccount(state, { accountId: 1, direction: "in", amount: "200" });
    expect(account.balance).toBe("-200.00");
  });

  it("rolls back invalid rename operations", () => {
    const state = createSeedState();
    const channel = state.channels[0];

    const result = simulateCommit(state, (draft) =>
      renameChannel(draft, { channelId: channel.id, name: "   " })
    );

    expect(result.ok).toBe(false);
    expect(state.channels[0].name).toBe(channel.name);
  });

  it("still blocks deleting accounts with balance", () => {
    const state = createSeedState();
    expect(() => deleteAccount(state, { accountId: 1 })).toThrow("帳戶仍有餘額");
  });

  it("rejects invalid user creation", () => {
    const state = createSeedState();
    expect(() =>
      createUser(state, {
        username: "ds001",
        password: "1234",
        displayName: "重複",
        permissions: ["dashboard"]
      })
    ).toThrow("帳號已存在");
  });
});
