import { describe, expect, it } from "vitest";
import type { AppState } from "../lib/types";
import {
  addChannel,
  addCustomer,
  addHolder,
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

  it("rejects duplicate active preset names", () => {
    const state = createSeedState();
    expect(() => addCustomer(state, { name: "阿明" })).toThrow("此客戶已存在");
    expect(() => addChannel(state, { name: "交易所 A" })).toThrow("此渠道已存在");
  });

  it("rolls back failed sale when inventory is insufficient", () => {
    const state = createSeedState();
    const before = snapshotFingerprint(state);

    const result = simulateCommit(state, (draft) =>
      addSale(draft, {
        customerName: "測試",
        rmbAccountId: 4,
        rmbAmount: "999999",
        exchangeRate: "4.5"
      })
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toMatch(/庫存不足/);
    expect(snapshotFingerprint(result.state)).toBe(before);
  });

  it("rolls back failed account adjustment", () => {
    const state = createSeedState();
    const before = state.accounts.find((a) => a.id === 1)?.balance;

    const result = simulateCommit(state, (draft) =>
      adjustAccount(draft, { accountId: 1, direction: "out", amount: "999999" })
    );

    expect(result.ok).toBe(false);
    expect(result.state.accounts.find((a) => a.id === 1)?.balance).toBe(before);
  });

  it("rolls back invalid rename operations", () => {
    const state = createSeedState();
    const channel = state.channels[0];

    const result = simulateCommit(state, (draft) =>
      renameChannel(draft, { channelId: channel.id, name: "   " })
    );
    expect(result.ok).toBe(false);
    expect(channel.name).toBe(result.state.channels.find((c) => c.id === channel.id)?.name);

    const customer = state.customers[0];
    const dup = simulateCommit(state, (draft) =>
      renameCustomer(draft, { customerId: customer.id, name: state.customers[1].name })
    );
    expect(dup.ok).toBe(false);
  });

  it("rolls back invalid user creation", () => {
    const state = createSeedState();
    const countBefore = state.users.length;

    const result = simulateCommit(state, (draft) =>
      createUser(draft, {
        username: "",
        password: "1234",
        displayName: "x",
        permissions: ["dashboard"]
      })
    );

    expect(result.ok).toBe(false);
    expect(result.state.users).toHaveLength(countBefore);
  });

  it("still blocks deleting accounts with balance", () => {
    const state = createSeedState();
    expect(() => deleteAccount(state, { accountId: 1 })).toThrow("帳戶仍有餘額");
  });
});
