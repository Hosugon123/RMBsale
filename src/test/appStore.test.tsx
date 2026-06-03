import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import * as React from "react";
import { AppStoreProvider, useAppStore } from "../features/AppStore";

function wrapper({ children }: { children: React.ReactNode }) {
  return <AppStoreProvider>{children}</AppStoreProvider>;
}

describe("AppStore commit error propagation", () => {
  it("throws on empty createCustomer without changing customer count", () => {
    const { result } = renderHook(() => useAppStore(), { wrapper });
    const countBefore = result.current.state.customers.length;

    expect(() => {
      act(() => result.current.createCustomer({ name: "   " }));
    }).toThrow("請輸入客戶名稱");

    expect(result.current.state.customers).toHaveLength(countBefore);
  });

  it("throws on empty createChannel without changing channel list", () => {
    const { result } = renderHook(() => useAppStore(), { wrapper });
    const activeBefore = result.current.state.channels.filter((c) => c.isActive).length;

    expect(() => {
      act(() => result.current.createChannel({ name: "" }));
    }).toThrow("請輸入渠道名稱");

    expect(result.current.state.channels.filter((c) => c.isActive)).toHaveLength(activeBefore);
  });

  it("throws on duplicate customer without corrupting state shape", () => {
    const { result } = renderHook(() => useAppStore(), { wrapper });

    expect(() => {
      act(() => result.current.createCustomer({ name: "阿明" }));
    }).toThrow("此客戶已存在");

    expect(result.current.state.customers.find((c) => c.name === "阿明")).toBeTruthy();
    expect(result.current.state.sessionUserId).toBeGreaterThan(0);
  });

  it("throws on insufficient inventory sale without changing RMB balance", () => {
    const { result } = renderHook(() => useAppStore(), { wrapper });
    const balanceBefore = result.current.state.accounts.find((a) => a.id === 4)?.balance;
    const salesBefore = result.current.state.sales.length;

    expect(() => {
      act(() =>
        result.current.createSale({
          customerName: "測試客戶",
          rmbAccountId: 4,
          rmbAmount: "999999",
          exchangeRate: "4.5"
        })
      );
    }).toThrow(/庫存不足/);

    expect(result.current.state.accounts.find((a) => a.id === 4)?.balance).toBe(balanceBefore);
    expect(result.current.state.sales).toHaveLength(salesBefore);
  });

  it("keeps valid AppState after createUser mutation", () => {
    const { result } = renderHook(() => useAppStore(), { wrapper });
    const countBefore = result.current.state.users.length;

    act(() =>
      result.current.createUser({
        username: "tester",
        password: "1234",
        displayName: "測試員",
        permissions: ["dashboard", "sale"]
      })
    );

    expect(result.current.state.users.length).toBe(countBefore + 1);
    expect(result.current.state.customers).toBeDefined();
    expect(result.current.state.channels).toBeDefined();
  });
});
