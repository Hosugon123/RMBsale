import * as React from "react";
import {
  addAccount,
  addChannel,
  addCustomer,
  addHolder,
  addPurchase,
  addSale,
  addSettlement,
  updateSaleProfit as updateLocalSaleProfit,
  createOpeningReceivable as createLocalOpeningReceivable,
  createOpeningProfit as createLocalOpeningProfit,
  addTransfer,
  adjustAccount,
  createUser,
  deleteAccount,
  deleteHolder,
  getSessionUser,
  loadState,
  setUserActive,
  updateUser,
  payPurchase,
  reverseOperation,
  renameAccount,
  renameChannel,
  renameCustomer,
  renameHolder,
  deleteChannel,
  deleteCustomer,
  setChannelActive,
  clearBusinessData,
  replaceBusinessData,
  resetState,
  publishAppStateShallow,
  scheduleSaveState,
  totals
} from "../lib/localStore";
import { applyBusinessImport, type BusinessDataImport } from "../lib/dataImport";
import {
  formatImportNotice,
  isXlsxImportApplied,
  loadXlsxImportPayload,
  XLSX_APPLIED_KEY,
  XLSX_AUTO_IMPORT_VERSION,
  XLSX_IMPORT_NOTICE_KEY
} from "../lib/xlsxAutoImport";
import type { ReversalEntityType } from "../lib/reversalUi";
import type { AppState, AppUser, PermissionKey } from "../lib/types";
import type {
  SpecialClientDepositBody,
  SpecialClientPayoutBody,
  SpecialClientReverseBody,
  SpecialClientWalletData,
  SpecialClientWalletQuery
} from "../lib/specialClientWalletTypes";
import {
  createSpecialClientDeposit,
  createSpecialClientPayout,
  getSpecialClientWallet,
  reverseSpecialClientWalletEntry
} from "../lib/localSpecialClientWallet";
import { ServerAppStoreProvider } from "./ServerAppStore";
import { useServerDataMode } from "../lib/serverApi";

export type AppStore = {
  state: AppState;
  sessionUser: AppUser;
  summary: ReturnType<typeof totals>;
  refresh: () => void | Promise<void>;
  resetDemo: () => void;
  clearData: () => void | Promise<void>;
  importBusinessData: (payload: BusinessDataImport) => void | Promise<void>;
  createPurchase: Parameters<typeof addPurchase>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  createSale: Parameters<typeof addSale>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  updateSaleProfit: Parameters<typeof updateLocalSaleProfit>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  createSettlement: Parameters<typeof addSettlement>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  createOpeningReceivable: Parameters<typeof createLocalOpeningReceivable>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  createOpeningProfit: Parameters<typeof createLocalOpeningProfit>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  payPurchase: Parameters<typeof payPurchase>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  adjustAccount: Parameters<typeof adjustAccount>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  createTransfer: Parameters<typeof addTransfer>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  createAccount: Parameters<typeof addAccount>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  createHolder: Parameters<typeof addHolder>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  createChannel: Parameters<typeof addChannel>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  renameChannel: Parameters<typeof renameChannel>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  deleteChannel: (channelId: number) => void | Promise<void>;
  setChannelActive: (channelId: number, isActive: boolean) => void | Promise<void>;
  createCustomer: Parameters<typeof addCustomer>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  renameCustomer: Parameters<typeof renameCustomer>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  deleteCustomer: (customerId: number) => void | Promise<void>;
  renameHolder: Parameters<typeof renameHolder>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  renameAccount: Parameters<typeof renameAccount>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  deleteHolder: Parameters<typeof deleteHolder>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  deleteAccount: Parameters<typeof deleteAccount>[1] extends infer P ? (input: P) => void | Promise<void> : never;
  createUser: (input: {
    username: string;
    password: string;
    displayName: string;
    permissions: PermissionKey[];
  }) => void | Promise<void>;
  updateUser: (
    userId: number,
    input: { username: string; password?: string; displayName: string; permissions: PermissionKey[] }
  ) => void | Promise<void>;
  setUserActive: (userId: number, isActive: boolean) => void | Promise<void>;
  reverseOperation: (input: { entityType: ReversalEntityType; entityId: number }) => void | Promise<void>;
  loadSpecialClientWallet: (query?: SpecialClientWalletQuery) => SpecialClientWalletData | Promise<SpecialClientWalletData>;
  specialClientDeposit: (body: SpecialClientDepositBody) => SpecialClientWalletData | Promise<SpecialClientWalletData>;
  specialClientPayout: (body: SpecialClientPayoutBody) => SpecialClientWalletData | Promise<SpecialClientWalletData>;
  specialClientReverse: (body: SpecialClientReverseBody) => SpecialClientWalletData | Promise<SpecialClientWalletData>;
};

export const AppStoreContext = React.createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const serverMode = useServerDataMode();
  if (serverMode) {
    return <ServerAppStoreProvider>{children}</ServerAppStoreProvider>;
  }

  return <LocalAppStoreProvider>{children}</LocalAppStoreProvider>;
}

function LocalAppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AppState>(() => loadState());
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const applyState = React.useCallback((next: AppState) => {
    stateRef.current = next;
    const published = publishAppStateShallow(next);
    stateRef.current = published;
    setState(published);
    scheduleSaveState(published);
  }, []);

  const commit = React.useCallback((producer: (draft: AppState) => unknown) => {
    try {
      producer(stateRef.current);
    } catch (err) {
      throw err;
    }
    const published = publishAppStateShallow(stateRef.current);
    stateRef.current = published;
    setState(published);
    scheduleSaveState(published);
  }, []);

  const applyImportedState = React.useCallback((payload: BusinessDataImport) => {
    const base = clearBusinessData(stateRef.current);
    const imported = applyBusinessImport(base.sessionUserId, base.users, payload);
    const merged = replaceBusinessData(base, imported);
    const published = publishAppStateShallow(merged);
    stateRef.current = published;
    setState(published);
    scheduleSaveState(published);
  }, []);

  React.useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    if (isXlsxImportApplied()) return;
    let cancelled = false;
    void (async () => {
      try {
        const payload = await loadXlsxImportPayload();
        if (!payload || cancelled) return;
        applyImportedState(payload);
        localStorage.setItem(XLSX_APPLIED_KEY, XLSX_AUTO_IMPORT_VERSION);
        sessionStorage.setItem(XLSX_IMPORT_NOTICE_KEY, formatImportNotice(payload));
      } catch (err) {
        console.error("試算表自動匯入失敗", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyImportedState]);

  const sessionUser = React.useMemo(() => {
    const user = getSessionUser(state);
    if (!user) throw new Error("未登入");
    return user;
  }, [state]);

  const value = React.useMemo<AppStore>(() => ({
    state,
    sessionUser,
    summary: totals(state),
    refresh: () => applyState(loadState()),
    resetDemo: () => applyState(resetState()),
    clearData: () => commit((draft) => clearBusinessData(draft)),
    importBusinessData: (payload) => applyImportedState(payload),
    createPurchase: (input) => commit((draft) => addPurchase(draft, input)),
    createSale: (input) => commit((draft) => addSale(draft, input)),
    updateSaleProfit: (input) => commit((draft) => updateLocalSaleProfit(draft, input)),
    createSettlement: (input) => commit((draft) => addSettlement(draft, input)),
    createOpeningReceivable: (input) => commit((draft) => createLocalOpeningReceivable(draft, input)),
    createOpeningProfit: (input) => commit((draft) => createLocalOpeningProfit(draft, input)),
    payPurchase: (input) => commit((draft) => payPurchase(draft, input)),
    adjustAccount: (input) => commit((draft) => adjustAccount(draft, input)),
    createTransfer: (input) => commit((draft) => addTransfer(draft, input)),
    createAccount: (input) => commit((draft) => addAccount(draft, input)),
    createHolder: (input) => commit((draft) => addHolder(draft, input)),
    createChannel: (input) => {
      const name = input.name.trim();
      if (!name) throw new Error("請輸入渠道名稱");
      commit((draft) => addChannel(draft, { name }));
    },
    renameChannel: (input) => commit((draft) => renameChannel(draft, input)),
    deleteChannel: (channelId) => commit((draft) => deleteChannel(draft, { channelId })),
    setChannelActive: (channelId, isActive) => commit((draft) => setChannelActive(draft, { channelId, isActive })),
    createCustomer: (input) => {
      const name = input.name.trim();
      if (!name) throw new Error("請輸入客戶名稱");
      commit((draft) => addCustomer(draft, { name }));
    },
    renameCustomer: (input) => commit((draft) => renameCustomer(draft, input)),
    deleteCustomer: (customerId) => commit((draft) => deleteCustomer(draft, { customerId })),
    renameHolder: (input) => commit((draft) => renameHolder(draft, input)),
    renameAccount: (input) => commit((draft) => renameAccount(draft, input)),
    deleteHolder: (input) => commit((draft) => deleteHolder(draft, input)),
    deleteAccount: (input) => commit((draft) => deleteAccount(draft, input)),
    createUser: (input) => commit((draft) => createUser(draft, input)),
    updateUser: (userId, input) => commit((draft) => updateUser(draft, userId, input)),
    setUserActive: (userId, isActive) => commit((draft) => setUserActive(draft, userId, isActive)),
    reverseOperation: (input) => commit((draft) => reverseOperation(draft, input)),
    loadSpecialClientWallet: (query) => getSpecialClientWallet(state, query),
    specialClientDeposit: (body) => {
      let result!: SpecialClientWalletData;
      commit((draft) => {
        result = createSpecialClientDeposit(draft, body);
      });
      return result;
    },
    specialClientPayout: (body) => {
      let result!: SpecialClientWalletData;
      commit((draft) => {
        result = createSpecialClientPayout(draft, body);
      });
      return result;
    },
    specialClientReverse: (body) => {
      let result!: SpecialClientWalletData;
      commit((draft) => {
        result = reverseSpecialClientWalletEntry(draft, body);
      });
      return result;
    }
  }), [applyState, commit, sessionUser, state]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const value = React.useContext(AppStoreContext);
  if (!value) throw new Error("useAppStore must be used inside AppStoreProvider");
  return value;
}
