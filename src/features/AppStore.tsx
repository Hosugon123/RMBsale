import * as React from "react";
import {
  addAccount,
  addChannel,
  addCustomer,
  addHolder,
  addPurchase,
  addSale,
  addSettlement,
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
  saveState,
  totals
} from "../lib/localStore";
import { applyBusinessImport, parseBusinessImportJson, type BusinessDataImport } from "../lib/dataImport";
import type { AppState, AppUser, PermissionKey } from "../lib/types";

type AppStore = {
  state: AppState;
  sessionUser: AppUser;
  summary: ReturnType<typeof totals>;
  refresh: () => void;
  resetDemo: () => void;
  clearData: () => void;
  importBusinessData: (payload: BusinessDataImport) => void;
  createPurchase: Parameters<typeof addPurchase>[1] extends infer P ? (input: P) => void : never;
  createSale: Parameters<typeof addSale>[1] extends infer P ? (input: P) => void : never;
  createSettlement: Parameters<typeof addSettlement>[1] extends infer P ? (input: P) => void : never;
  payPurchase: Parameters<typeof payPurchase>[1] extends infer P ? (input: P) => void : never;
  adjustAccount: Parameters<typeof adjustAccount>[1] extends infer P ? (input: P) => void : never;
  createTransfer: Parameters<typeof addTransfer>[1] extends infer P ? (input: P) => void : never;
  createAccount: Parameters<typeof addAccount>[1] extends infer P ? (input: P) => void : never;
  createHolder: Parameters<typeof addHolder>[1] extends infer P ? (input: P) => void : never;
  createChannel: Parameters<typeof addChannel>[1] extends infer P ? (input: P) => void : never;
  renameChannel: Parameters<typeof renameChannel>[1] extends infer P ? (input: P) => void : never;
  deleteChannel: (channelId: number) => void;
  setChannelActive: (channelId: number, isActive: boolean) => void;
  createCustomer: Parameters<typeof addCustomer>[1] extends infer P ? (input: P) => void : never;
  renameCustomer: Parameters<typeof renameCustomer>[1] extends infer P ? (input: P) => void : never;
  deleteCustomer: (customerId: number) => void;
  renameHolder: Parameters<typeof renameHolder>[1] extends infer P ? (input: P) => void : never;
  renameAccount: Parameters<typeof renameAccount>[1] extends infer P ? (input: P) => void : never;
  deleteHolder: Parameters<typeof deleteHolder>[1] extends infer P ? (input: P) => void : never;
  deleteAccount: Parameters<typeof deleteAccount>[1] extends infer P ? (input: P) => void : never;
  createUser: (input: { username: string; password: string; displayName: string; permissions: PermissionKey[] }) => void;
  updateUser: (
    userId: number,
    input: { username: string; password?: string; displayName: string; permissions: PermissionKey[] }
  ) => void;
  setUserActive: (userId: number, isActive: boolean) => void;
};

const Context = React.createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AppState>(() => loadState());
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const applyState = React.useCallback((next: AppState) => {
    saveState(next);
    stateRef.current = next;
    setState(next);
  }, []);

  const commit = React.useCallback((producer: (draft: AppState) => unknown) => {
    const draft = structuredClone(stateRef.current) as AppState;
    try {
      producer(draft);
    } catch (err) {
      throw err;
    }
    applyState(draft);
  }, [applyState]);

  const sessionUser = React.useMemo(() => getSessionUser(state), [state]);

  const value = React.useMemo<AppStore>(() => ({
    state,
    sessionUser,
    summary: totals(state),
    refresh: () => applyState(loadState()),
    resetDemo: () => applyState(resetState()),
    clearData: () => commit((draft) => clearBusinessData(draft)),
    importBusinessData: (payload) =>
      commit((draft) => {
        const imported = applyBusinessImport(draft.sessionUserId, draft.users, payload);
        return replaceBusinessData(draft, imported);
      }),
    createPurchase: (input) => commit((draft) => addPurchase(draft, input)),
    createSale: (input) => commit((draft) => addSale(draft, input)),
    createSettlement: (input) => commit((draft) => addSettlement(draft, input)),
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
    setUserActive: (userId, isActive) => commit((draft) => setUserActive(draft, userId, isActive))
  }), [applyState, commit, sessionUser, state]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppStore() {
  const value = React.useContext(Context);
  if (!value) throw new Error("useAppStore must be used inside AppStoreProvider");
  return value;
}
