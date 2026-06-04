export const ALL_PERMISSIONS = [
  "dashboard",
  "purchase",
  "sale",
  "receivables",
  "accounts",
  "transfer",
  "ledger",
  "inventory",
  "admin"
] as const;

export type PermissionKey = (typeof ALL_PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function deriveRole(permissions: PermissionKey[]): "admin" | "operator" {
  return permissions.includes("admin") ? "admin" : "operator";
}

export function presetForRole(role: string): PermissionKey[] {
  if (role === "admin") return [...ALL_PERMISSIONS];
  return [
    "dashboard",
    "purchase",
    "sale",
    "receivables",
    "accounts",
    "transfer",
    "ledger",
    "inventory"
  ];
}

export function parsePermissionsJson(json: string | null | undefined, role: string): PermissionKey[] {
  if (json?.trim()) {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (Array.isArray(parsed)) {
        const keys = parsed.filter((item): item is PermissionKey => typeof item === "string" && PERMISSION_SET.has(item));
        if (keys.length) return [...new Set(keys)];
      }
    } catch {
      /* fall through */
    }
  }
  return presetForRole(role);
}

export function serializePermissions(permissions: PermissionKey[]): string {
  return JSON.stringify(permissions);
}

export function normalizePermissionsInput(raw: unknown): PermissionKey[] {
  if (!Array.isArray(raw) || !raw.length) throw new Error("請至少勾選一項權限");
  const keys = raw.filter((item): item is PermissionKey => typeof item === "string" && PERMISSION_SET.has(item));
  if (!keys.length) throw new Error("請至少勾選一項權限");
  return [...new Set(keys)];
}

export function toAppUser(row: {
  id: number;
  username: string;
  role: string;
  displayName: string | null;
  permissionsJson: string | null;
  isActive: boolean;
}) {
  const permissions = parsePermissionsJson(row.permissionsJson, row.role);
  return {
    id: row.id,
    username: row.username,
    role: deriveRole(permissions),
    displayName: row.displayName?.trim() || row.username,
    password: "",
    permissions,
    isActive: row.isActive
  };
}
