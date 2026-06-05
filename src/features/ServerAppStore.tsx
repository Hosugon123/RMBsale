import * as React from "react";
import { useAuth } from "../context/AuthContext";
import { serverApi } from "../lib/serverApi";
import { getSessionUser, totals } from "../lib/localStore";
import type { BusinessDataImport } from "../lib/dataImport";
import type { ReversalEntityType } from "../lib/reversalUi";
import type { AppState } from "../lib/types";
import type { AppStore } from "./AppStore";
import { AppStoreContext } from "./AppStore";

export function ServerAppStoreProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser, loading: authLoading, refresh: refreshAuth } = useAuth();
  const [state, setState] = React.useState<AppState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const refreshInFlightRef = React.useRef<Promise<void> | null>(null);

  const refresh = React.useCallback(async (options?: { lite?: boolean }) => {
    setLoadError("");
    const { state: next } = await serverApi.bootstrap(options);
    setState(next);
  }, []);

  const scheduleRefresh = React.useCallback(() => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    refreshInFlightRef.current = refresh({ lite: true })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "更新帳務資料失敗";
        setLoadError(message);
        console.error(err);
      })
      .finally(() => {
        refreshInFlightRef.current = null;
      });
    return refreshInFlightRef.current;
  }, [refresh]);

  React.useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh()
      .catch((err) => {
        const message = err instanceof Error ? err.message : "載入帳務資料失敗";
        setLoadError(message);
        setState(null);
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [authUser, authLoading, refresh]);

  if (authLoading || loading || !state || !authUser) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
        {authLoading || loading ? (
          "載入共用帳務資料…"
        ) : loadError ? (
          <>
            <p className="text-destructive">{loadError}</p>
            <button
              type="button"
              className="text-primary underline"
              onClick={() => {
                setLoading(true);
                void refresh()
                  .catch((err) => setLoadError(err instanceof Error ? err.message : "載入失敗"))
                  .finally(() => setLoading(false));
              }}
            >
              重試
            </button>
          </>
        ) : (
          "請先登入"
        )}
      </div>
    );
  }

  const sessionUser = getSessionUser(state);
  if (!sessionUser) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        請先登入
      </div>
    );
  }

  const afterMutation = (options?: { refreshSession?: boolean }) => {
    scheduleRefresh();
    if (options?.refreshSession) void refreshAuth();
  };

  const value: AppStore = {
    state,
    sessionUser,
    summary: totals(state),
    refresh: () => refresh({ lite: true }),
    resetDemo: () => {
      throw new Error("線上環境不提供重置示範資料，請使用「清除帳務資料」。");
    },
    clearData: async () => {
      await serverApi.clearBusiness();
      await refresh();
    },
    importBusinessData: async (payload: BusinessDataImport) => {
      await serverApi.importBusiness(payload);
      await refresh();
    },
    createPurchase: async (input) => {
      await serverApi.createPurchase(input as Record<string, unknown>);
      afterMutation();
    },
    createSale: async (input) => {
      await serverApi.createSale(input as Record<string, unknown>);
      afterMutation();
    },
    createSettlement: async (input) => {
      await serverApi.createSettlement(input as Record<string, unknown>);
      afterMutation();
    },
    payPurchase: async (input) => {
      await serverApi.payPurchase(input as Record<string, unknown>);
      afterMutation();
    },
    adjustAccount: async (input) => {
      await serverApi.adjustAccount(input as Record<string, unknown>);
      afterMutation();
    },
    createTransfer: async (input) => {
      await serverApi.createTransfer(input as Record<string, unknown>);
      afterMutation();
    },
    createAccount: async (input) => {
      await serverApi.createAccount(input);
      afterMutation();
    },
    createHolder: async (input) => {
      await serverApi.createHolder(input.name);
      afterMutation();
    },
    createChannel: async (input) => {
      const name = input.name.trim();
      if (!name) throw new Error("請輸入渠道名稱");
      await serverApi.createChannel(name);
      afterMutation();
    },
    renameChannel: async (input) => {
      await serverApi.renameChannel(input);
      afterMutation();
    },
    deleteChannel: async (channelId) => {
      await serverApi.deleteChannel(channelId);
      afterMutation();
    },
    setChannelActive: async (channelId, isActive) => {
      await serverApi.setChannelActive(channelId, isActive);
      afterMutation();
    },
    createCustomer: async (input) => {
      const name = input.name.trim();
      if (!name) throw new Error("請輸入客戶名稱");
      await serverApi.createCustomer(name);
      afterMutation();
    },
    renameCustomer: async (input) => {
      await serverApi.renameCustomer(input);
      afterMutation();
    },
    deleteCustomer: async (customerId) => {
      await serverApi.deleteCustomer(customerId);
      afterMutation();
    },
    renameHolder: async (input) => {
      await serverApi.renameHolder(input);
      afterMutation();
    },
    renameAccount: async (input) => {
      await serverApi.renameAccount(input);
      afterMutation();
    },
    deleteHolder: async (input) => {
      await serverApi.deleteHolder(input.holderId);
      afterMutation();
    },
    deleteAccount: async (input) => {
      await serverApi.deleteAccount(input.accountId);
      afterMutation();
    },
    createUser: async (input) => {
      await serverApi.createUser(input);
      afterMutation();
    },
    updateUser: async (userId, input) => {
      await serverApi.updateUser(userId, input);
      afterMutation({ refreshSession: userId === sessionUser.id });
    },
    setUserActive: async (userId, isActive) => {
      await serverApi.setUserActive(userId, isActive);
      afterMutation({ refreshSession: userId === sessionUser.id });
    },
    reverseOperation: async (input: { entityType: ReversalEntityType; entityId: number }) => {
      await serverApi.reverseOperation(input.entityType, input.entityId);
      afterMutation();
    }
  };

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}
