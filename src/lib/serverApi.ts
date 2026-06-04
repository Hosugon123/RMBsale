import type { AppState } from "./types";
import { LEVEL_PRESETS } from "./permissions";

type SessionUser = {
  id: number;
  username: string;
  role: "admin" | "operator";
};

function toSessionAppUser(user: SessionUser) {
  const preset = user.role === "admin" ? LEVEL_PRESETS.admin : LEVEL_PRESETS.operator;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.username,
    password: "",
    permissions: [...preset.permissions],
    isActive: true
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...options,
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
    const data = await request<{ user: SessionUser }>("auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    return toSessionAppUser(data.user);
  },

  logout: () => request("auth/logout", { method: "POST" }),

  me: async () => {
    const data = await request<{ user: SessionUser | null }>("auth/me");
    return data.user ? toSessionAppUser(data.user) : null;
  },

  bootstrap: () => request<{ state: AppState }>("bootstrap"),

  createPurchase: (body: Record<string, unknown>) =>
    request("purchases", { method: "POST", body: JSON.stringify(body) }),

  createSale: (body: Record<string, unknown>) =>
    request("sales", { method: "POST", body: JSON.stringify(body) }),

  createSettlement: (body: Record<string, unknown>) =>
    request("settlements", { method: "POST", body: JSON.stringify(body) }),

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
    request("customers", { method: "POST", body: JSON.stringify({ name }) })
};

export function useServerDataMode() {
  return import.meta.env.PROD || import.meta.env.VITE_USE_API === "true";
}
