import * as React from "react";
import { useAuth } from "../context/AuthContext";
import { serverApi } from "../lib/serverApi";
import { getSessionUser, totals } from "../lib/localStore";
import type { AppState } from "../lib/types";
import type { AppStore } from "./AppStore";
import { AppStoreContext } from "./AppStore";

const unsupported = () => {
  throw new Error("線上版暫不支援此操作，請使用買入、售出、收帳、轉帳或入出金。");
};

export function ServerAppStoreProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser, loading: authLoading } = useAuth();
  const [state, setState] = React.useState<AppState | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const { state: next } = await serverApi.bootstrap();
    setState(next);
  }, []);

  React.useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh()
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [authUser, authLoading, refresh]);

  if (authLoading || loading || !state || !authUser) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        {authLoading || loading ? "載入共用帳務資料…" : "請先登入"}
      </div>
    );
  }

  const sessionUser = getSessionUser(state);

  const value: AppStore = {
    state,
    sessionUser,
    summary: totals(state),
    refresh: () => {
      void refresh();
    },
    resetDemo: unsupported,
    clearData: unsupported,
    importBusinessData: unsupported,
    createPurchase: async (input) => {
      await serverApi.createPurchase(input);
      await refresh();
    },
    createSale: async (input) => {
      await serverApi.createSale(input);
      await refresh();
    },
    createSettlement: async (input) => {
      await serverApi.createSettlement(input);
      await refresh();
    },
    payPurchase: async (input) => {
      await serverApi.payPurchase(input);
      await refresh();
    },
    adjustAccount: async (input) => {
      await serverApi.adjustAccount(input);
      await refresh();
    },
    createTransfer: async (input) => {
      await serverApi.createTransfer(input);
      await refresh();
    },
    createAccount: async (input) => {
      await serverApi.createAccount(input);
      await refresh();
    },
    createHolder: async (input) => {
      await serverApi.createHolder(input.name);
      await refresh();
    },
    createChannel: (input) => {
      const name = input.name.trim();
      if (!name) throw new Error("請輸入渠道名稱");
      unsupported();
    },
    renameChannel: () => unsupported(),
    deleteChannel: () => unsupported(),
    setChannelActive: () => unsupported(),
    createCustomer: async (input) => {
      const name = input.name.trim();
      if (!name) throw new Error("請輸入客戶名稱");
      await serverApi.createCustomer(name);
      await refresh();
    },
    renameCustomer: () => unsupported(),
    deleteCustomer: () => unsupported(),
    renameHolder: () => unsupported(),
    renameAccount: () => unsupported(),
    deleteHolder: () => unsupported(),
    deleteAccount: () => unsupported(),
    createUser: () => unsupported(),
    updateUser: () => unsupported(),
    setUserActive: () => unsupported()
  };

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}
