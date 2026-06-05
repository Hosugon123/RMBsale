import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppStoreProvider, useAppStore } from "../features/AppStore";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppStoreProvider>{children}</AppStoreProvider>
);

describe("AppStoreProvider", () => {
  it("loads demo state with session user", () => {
    const { result } = renderHook(() => useAppStore(), { wrapper });
    expect(result.current.sessionUser.username).toBeTruthy();
    expect(result.current.state.customers.find((c) => c.name === "阿明")).toBeTruthy();
    expect(result.current.state.sessionUserId).toBeGreaterThan(0);
  });

  it("records sale with negative RMB balance when inventory is short", () => {
    const { result } = renderHook(() => useAppStore(), { wrapper });
    act(() => {
      const account = result.current.state.accounts.find((a) => a.id === 4)!;
      account.balance = "0.00";
      result.current.state.rmbLots = result.current.state.rmbLots.filter((lot) => lot.accountId !== 4);
    });

    act(() =>
      result.current.createSale({
        customerName: "測試客戶",
        rmbAccountId: 4,
        rmbAmount: "500",
        exchangeRate: "4.5"
      })
    );

    expect(result.current.state.accounts.find((a) => a.id === 4)?.balance).toBe("-500.00");
    expect(result.current.state.sales.length).toBeGreaterThan(0);
  });

  it("keeps valid AppState after createUser mutation", () => {
    const { result } = renderHook(() => useAppStore(), { wrapper });
    const countBefore = result.current.state.users.length;

    act(() =>
      result.current.createUser({
        username: "operator2",
        password: "1234",
        displayName: "操作員二",
        permissions: ["dashboard", "sale"]
      })
    );

    expect(result.current.state.users).toHaveLength(countBefore + 1);
    expect(result.current.state.users.find((u) => u.username === "operator2")?.displayName).toBe("操作員二");
  });
});
