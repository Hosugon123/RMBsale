import type { AppState, AppUser, PermissionKey } from "./types";
import type { BootstrapSection } from "./bootstrapSections";
import type { BusinessDataImport } from "./dataImport";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>)
    },
    credentials: "include"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `請求失敗 (${res.status})`);
  }
  return data as T;
}

export const serverApi = {
  login: async (username: string, password: string) => {
    const data = await request<{ user: AppUser }>("auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    return data.user;
  },

  logout: () => request("auth/logout", { method: "POST" }),

  me: async () => {
    const data = await request<{ user: AppUser | null }>("auth/me");
    return data.user;
  },

  bootstrap: (options?: { sections?: BootstrapSection[] }) => {
    const query = options?.sections?.length ? `?sections=${options.sections.join(",")}` : "";
    return request<{ state: AppState; partial?: boolean }>(`bootstrap${query}`);
  },

  createPurchase: (body: Record<string, unknown>) =>
    request("purchases", { method: "POST", body: JSON.stringify(body) }),

  createSale: (body: Record<string, unknown>) =>
    request("sales", { method: "POST", body: JSON.stringify(body) }),

  updateSaleProfit: (body: { saleId: number; profitTwd: string }) =>
    request("sales", { method: "PATCH", body: JSON.stringify({ id: body.saleId, profitTwd: body.profitTwd }) }),

  createSettlement: (body: Record<string, unknown>) =>
    request("settlements", { method: "POST", body: JSON.stringify(body) }),

  createOpeningReceivable: (body: { customerName: string; amountTwd: string; note?: string }) =>
    request("receivables", { method: "POST", body: JSON.stringify(body) }),

  payPurchase: (body: Record<string, unknown>) =>
    request("purchases/pay", { method: "POST", body: JSON.stringify(body) }),

  createTransfer: (body: Record<string, unknown>) =>
    request("transfers", { method: "POST", body: JSON.stringify(body) }),

  adjustAccount: (body: Record<string, unknown>) =>
    request("adjustments", { method: "POST", body: JSON.stringify(body) }),

  createHolder: (name: string) =>
    request("holders", { method: "POST", body: JSON.stringify({ name }) }),

  createAccount: (body: { holderId: number; name: string; currency: "TWD" | "RMB" }) =>
    request("accounts", { method: "POST", body: JSON.stringify(body) }),

  createCustomer: (name: string) =>
    request("customers", { method: "POST", body: JSON.stringify({ name }) }),

  createChannel: (name: string) =>
    request("admin/channels", { method: "POST", body: JSON.stringify({ name }) }),

  renameChannel: (body: { channelId: number; name: string }) =>
    request("admin/channels", { method: "PATCH", body: JSON.stringify({ id: body.channelId, name: body.name }) }),

  deleteChannel: (channelId: number) =>
    request("admin/channels", { method: "PATCH", body: JSON.stringify({ id: channelId, isActive: false }) }),

  setChannelActive: (channelId: number, isActive: boolean) =>
    request("admin/channels", { method: "PATCH", body: JSON.stringify({ id: channelId, isActive }) }),

  renameCustomer: (body: { customerId: number; name: string }) =>
    request("customers", { method: "PATCH", body: JSON.stringify({ id: body.customerId, name: body.name }) }),

  deleteCustomer: (customerId: number) =>
    request("customers", { method: "PATCH", body: JSON.stringify({ id: customerId, isActive: false }) }),

  renameHolder: (body: { holderId: number; name: string }) =>
    request("admin/holders", { method: "PATCH", body: JSON.stringify({ id: body.holderId, name: body.name }) }),

  renameAccount: (body: { accountId: number; name: string }) =>
    request("admin/accounts", { method: "PATCH", body: JSON.stringify({ id: body.accountId, name: body.name }) }),

  deleteHolder: (holderId: number) =>
    request("admin/holders", { method: "PATCH", body: JSON.stringify({ id: holderId, isActive: false }) }),

  deleteAccount: (accountId: number) =>
    request("admin/accounts", { method: "PATCH", body: JSON.stringify({ id: accountId, isActive: false }) }),

  createUser: (input: { username: string; password: string; displayName: string; permissions: PermissionKey[] }) =>
    request("admin/users", {
      method: "POST",
      body: JSON.stringify(input)
    }),

  updateUser: (
    userId: number,
    input: { username: string; password?: string; displayName: string; permissions: PermissionKey[] }
  ) =>
    request("admin/users", {
      method: "PATCH",
      body: JSON.stringify({ id: userId, ...input })
    }),

  setUserActive: (userId: number, isActive: boolean) =>
    request("admin/users", {
      method: "PATCH",
      body: JSON.stringify({ id: userId, isActive })
    }),

  clearBusiness: () => request("admin/clear-business", { method: "POST" }),

  importBusiness: (payload: BusinessDataImport) =>
    request("admin/import", { method: "POST", body: JSON.stringify(payload) }),

  reverseOperation: (entityType: string, entityId: number) =>
    request("reversals", {
      method: "POST",
      body: JSON.stringify({ entityType, entityId })
    }),

  listAuditLogs: (limit = 200) =>
    request<{
      auditLogs: Array<{
        id: number;
        username?: string | null;
        action: string;
        targetType: string;
        targetId?: number | null;
        createdAt: string;
      }>;
    }>(`admin/audit-logs?limit=${limit}`),

  listSnapshots: () =>
    request<{
      snapshots: Array<{
        id: number;
        snapshotDate: string;
        totalTwdBalance: string;
        totalRmbBalance: string;
        totalReceivablesTwd: string;
        openSalesCount: number;
        openPurchasesCount: number;
        ledgerEntriesCount: number;
        checksum: string;
      }>;
    }>("admin/snapshots"),

  createSnapshot: () => request("admin/snapshots/create", { method: "POST" }),

  compareSnapshots: (from: string, to: string) =>
    request<Record<string, unknown>>(`admin/snapshots?from=${from}&to=${to}`),

  listBackups: () =>
    request<{
      storageMode: string;
      runs: Array<{
        id: number;
        type: string;
        status: string;
        startedAt: string;
        finishedAt?: string | null;
        fileName?: string | null;
        fileSize?: number | null;
        storageTarget: string;
        errorMessage?: string | null;
      }>;
    }>("admin/backups"),

  runBackup: () => request("admin/backups/run", { method: "POST" }),

  backupDownloadUrl: (id: number) => `/api/admin/backups/download?id=${id}`
};

/** 正式站用 API；本機 `npm run dev`（demo 模式）用 localStorage。 */
export function useServerDataMode() {
  if (import.meta.env.MODE === "test" || import.meta.env.MODE === "demo") return false;
  if (import.meta.env.VITE_USE_DEMO === "true") return false;
  return true;
}
