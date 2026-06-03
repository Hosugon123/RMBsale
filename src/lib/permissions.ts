import type { AppUser, PermissionKey, UserLevel } from "./types";

export const PERMISSION_GROUPS = [
  {
    title: "業務操作",
    items: [
      { key: "dashboard", label: "儀表板" },
      { key: "purchase", label: "買入 RMB" },
      { key: "sale", label: "售出 RMB" },
      { key: "receivables", label: "應收應付" },
      { key: "accounts", label: "帳戶金流" },
      { key: "transfer", label: "帳戶轉帳" }
    ] as const
  },
  {
    title: "查詢分析",
    items: [
      { key: "ledger", label: "現金流水" },
      { key: "inventory", label: "FIFO 庫存" }
    ] as const
  },
  {
    title: "系統管理",
    items: [{ key: "admin", label: "管理後台" }] as const
  }
] as const;

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) =>
  group.items.map((item) => item.key)
) as PermissionKey[];

export const LEVEL_PRESETS: Record<Exclude<UserLevel, "custom">, { label: string; permissions: PermissionKey[] }> = {
  admin: {
    label: "管理員",
    permissions: [...ALL_PERMISSIONS]
  },
  operator: {
    label: "操作員",
    permissions: ["dashboard", "purchase", "sale", "receivables", "accounts", "transfer", "ledger", "inventory"]
  },
  readonly: {
    label: "唯讀",
    permissions: ["dashboard", "ledger", "inventory"]
  }
};

const ROUTE_PERMISSION: Record<string, PermissionKey> = {
  "/": "dashboard",
  "/purchase": "purchase",
  "/sale": "sale",
  "/receivables": "receivables",
  "/accounts": "accounts",
  "/account": "accounts",
  "/ledger": "ledger",
  "/inventory": "inventory",
  "/admin": "admin"
};

export function permissionForPath(pathname: string) {
  if (pathname === "/" || pathname === "") return "dashboard" as PermissionKey;
  return ROUTE_PERMISSION[pathname];
}

export function hasPermission(user: AppUser, permission: PermissionKey) {
  if (!user.isActive) return false;
  return user.permissions.includes(permission);
}

export function canAccessPath(user: AppUser, pathname: string) {
  const permission = permissionForPath(pathname);
  return permission ? hasPermission(user, permission) : true;
}

export function detectLevel(permissions: PermissionKey[]): UserLevel {
  const sorted = [...permissions].sort().join(",");
  for (const [level, preset] of Object.entries(LEVEL_PRESETS) as [Exclude<UserLevel, "custom">, (typeof LEVEL_PRESETS)[keyof typeof LEVEL_PRESETS]][]) {
    if ([...preset.permissions].sort().join(",") === sorted) return level;
  }
  return "custom";
}

export function levelLabel(level: UserLevel) {
  if (level === "custom") return "自訂";
  return LEVEL_PRESETS[level].label;
}

export function permissionsSummary(permissions: PermissionKey[]) {
  const level = detectLevel(permissions);
  if (level !== "custom") return levelLabel(level);
  return `${permissions.length} 項權限`;
}

export function deriveRole(permissions: PermissionKey[]): AppUser["role"] {
  return permissions.includes("admin") ? "admin" : "operator";
}
