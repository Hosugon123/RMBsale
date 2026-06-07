import * as React from "react";
import { useAuth } from "../context/AuthContext";
import { REFRESH_PROFILES, type RefreshProfile } from "../lib/bootstrapSections";
import { mergeBootstrapState } from "../lib/mergeBootstrapState";
import { serverApi } from "../lib/serverApi";
import { getSessionUser, totals } from "../lib/localStore";
import { d } from "../lib/utils";
import type { BusinessDataImport } from "../lib/dataImport";
import type { ReversalEntityType } from "../lib/reversalUi";
import type { AppState, AppUser } from "../lib/types";
import type { AppStore } from "./AppStore";
import { AppStoreContext } from "./AppStore";

type RefreshOptions = { full?: boolean; profile?: RefreshProfile };

type SettlementInput = {
  customerId: number;
  accountId: number;
  amountTwd: string;
  note?: string;
};

function money(value: unknown) {
  return d(value as never).toDecimalPlaces(2).toFixed(2);
}

function applyOptimisticSettlement(state: AppState, input: SettlementInput, sessionUser: AppUser): AppState {
  const customer = state.customers.find((item) => item.id === input.customerId);
  if (!customer) throw new Error("找不到客戶");
  const account = state.accounts.find((item) => item.id === input.accountId && item.currency === "TWD");
  if (!account) throw new Error("找不到 TWD 帳戶");
  const amount = d(input.amountTwd);
  if (amount.lte(0)) throw new Error("金額必須大於 0");
  if (d(customer.receivableTwd).lt(amount)) throw new Error("收款金額超過應收餘額");

  const amountTwd = money(amount);
  const nextReceivable = money(d(customer.receivableTwd).sub(amountTwd));
  const nextBalance = money(d(account.balance).add(amountTwd));
  const now = new Date().toISOString();
  const tempId = -Date.now();
  const note = input.note?.trim();
  const description = note ? `收帳：${customer.name}（${note}）` : `收帳：${customer.name}`;

  return {
    ...state,
    customers: state.customers.map((item) =>
      item.id === customer.id ? { ...item, receivableTwd: nextReceivable } : item
    ),
    accounts: state.accounts.map((item) =>
      item.id === account.id ? { ...item, balance: nextBalance } : item
    ),
    ledger: [
      {
        id: tempId,
        createdAt: now,
        entryType: "收帳",
        customerId: customer.id,
        direction: "out",
        currency: "TWD",
        amount: amountTwd,
        description,
        operatorName: sessionUser.displayName,
        relatedTable: "settlements",
        relatedId: tempId
      },
      {
        id: tempId - 1,
        createdAt: now,
        entryType: "收帳",
        accountId: account.id,
        direction: "in",
        currency: "TWD",
        amount: amountTwd,
        description,
        operatorName: sessionUser.displayName,
        relatedTable: "settlements",
        relatedId: tempId
      },
      ...state.ledger
    ]
  };
}

export function ServerAppStoreProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser, loading: authLoading, refresh: refreshAuth } = useAuth();
  const [state, setState] = React.useState<AppState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const refreshInFlightRef = React.useRef<Promise<void> | null>(null);

  const refresh = React.useCallback(async (options?: RefreshOptions) => {
    setLoadError("");
    if (options?.profile) {
      const sections = [...REFRESH_PROFILES[options.profile]];
      const { state: patch } = await serverApi.bootstrap({ sections });
      setState((prev) => (prev ? mergeBootstrapState(prev, patch) : (patch as AppState)));
      return;
    }
    const { state: next } = await serverApi.bootstrap();
    setState(next);
  }, []);

  const scheduleRefresh = React.useCallback(
    (profile?: RefreshProfile) => {
      if (refreshInFlightRef.current) return refreshInFlightRef.current;
      refreshInFlightRef.current = refresh(profile ? { profile } : undefined)
        .catch((err) => {
          const message = err instanceof Error ? err.message : "更新帳務資料失敗";
          setLoadError(message);
          console.error(err);
        })
        .finally(() => {
          refreshInFlightRef.current = null;
        });
      return refreshInFlightRef.current;
    },
    [refresh]
  );

  React.useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh({ full: true })
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
                void refresh({ full: true })
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

  const afterMutation = (profile: RefreshProfile, options?: { refreshSession?: boolean }) => {
    scheduleRefresh(profile);
    if (options?.refreshSession) void refreshAuth();
  };

  const value: AppStore = {
    state,
    sessionUser,
    summary: totals(state),
    refresh: () => {
      void refresh({ full: true });
    },
    resetDemo: () => {
      throw new Error("線上環境不提供重置示範資料，請使用「清除帳務資料」。");
    },
    clearData: async () => {
      await serverApi.clearBusiness();
      await refresh({ full: true });
    },
    importBusinessData: async (payload: BusinessDataImport) => {
      await serverApi.importBusiness(payload);
      await refresh({ full: true });
    },
    createPurchase: async (input) => {
      await serverApi.createPurchase(input as Record<string, unknown>);
      afterMutation("purchase");
    },
    createSale: async (input) => {
      await serverApi.createSale(input as Record<string, unknown>);
      afterMutation("sale");
    },
    createSettlement: async (input) => {
      const settlementInput = input as SettlementInput;
      const rollbackState = state;
      setState((current) =>
        current ? applyOptimisticSettlement(current, settlementInput, sessionUser) : current
      );
      void serverApi.createSettlement(settlementInput as unknown as Record<string, unknown>)
        .then(() => afterMutation("settlement"))
        .catch((err) => {
          setState(rollbackState);
          const message = err instanceof Error ? err.message : "收帳失敗，已復原畫面資料";
          setLoadError(message);
          console.error(err);
        });
    },
    payPurchase: async (input) => {
      await serverApi.payPurchase(input as Record<string, unknown>);
      afterMutation("purchasePay");
    },
    adjustAccount: async (input) => {
      await serverApi.adjustAccount(input as Record<string, unknown>);
      afterMutation("adjustment");
    },
    createTransfer: async (input) => {
      await serverApi.createTransfer(input as Record<string, unknown>);
      afterMutation("transfer");
    },
    createAccount: async (input) => {
      await serverApi.createAccount(input);
      afterMutation("accountAdmin");
    },
    createHolder: async (input) => {
      await serverApi.createHolder(input.name);
      afterMutation("holderAdmin");
    },
    createChannel: async (input) => {
      const name = input.name.trim();
      if (!name) throw new Error("請輸入渠道名稱");
      await serverApi.createChannel(name);
      afterMutation("channelAdmin");
    },
    renameChannel: async (input) => {
      await serverApi.renameChannel(input);
      afterMutation("channelAdmin");
    },
    deleteChannel: async (channelId) => {
      await serverApi.deleteChannel(channelId);
      afterMutation("channelAdmin");
    },
    setChannelActive: async (channelId, isActive) => {
      await serverApi.setChannelActive(channelId, isActive);
      afterMutation("channelAdmin");
    },
    createCustomer: async (input) => {
      const name = input.name.trim();
      if (!name) throw new Error("請輸入客戶名稱");
      await serverApi.createCustomer(name);
      afterMutation("customerAdmin");
    },
    renameCustomer: async (input) => {
      await serverApi.renameCustomer(input);
      afterMutation("customerAdmin");
    },
    deleteCustomer: async (customerId) => {
      await serverApi.deleteCustomer(customerId);
      afterMutation("customerAdmin");
    },
    renameHolder: async (input) => {
      await serverApi.renameHolder(input);
      afterMutation("holderAdmin");
    },
    renameAccount: async (input) => {
      await serverApi.renameAccount(input);
      afterMutation("accountAdmin");
    },
    deleteHolder: async (input) => {
      await serverApi.deleteHolder(input.holderId);
      afterMutation("holderAdmin");
    },
    deleteAccount: async (input) => {
      await serverApi.deleteAccount(input.accountId);
      afterMutation("accountAdmin");
    },
    createUser: async (input) => {
      await serverApi.createUser(input);
      afterMutation("userAdmin");
    },
    updateUser: async (userId, input) => {
      await serverApi.updateUser(userId, input);
      afterMutation("userAdmin", { refreshSession: userId === sessionUser.id });
    },
    setUserActive: async (userId, isActive) => {
      await serverApi.setUserActive(userId, isActive);
      afterMutation("userAdmin", { refreshSession: userId === sessionUser.id });
    },
    reverseOperation: async (input: { entityType: ReversalEntityType; entityId: number }) => {
      await serverApi.reverseOperation(input.entityType, input.entityId);
      afterMutation("reversal");
    }
  };

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}
