import type { DbTx } from "./db.js";
import { getDb } from "./db.js";
import { auditLogs } from "./schema.js";

export const AuditAction = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  CREATE_SALE: "CREATE_SALE",
  UPDATE_SALE: "UPDATE_SALE",
  DELETE_SALE: "DELETE_SALE",
  CREATE_OPENING_RECEIVABLE: "CREATE_OPENING_RECEIVABLE",
  CREATE_OPENING_PROFIT: "CREATE_OPENING_PROFIT",
  CREATE_PURCHASE: "CREATE_PURCHASE",
  UPDATE_PURCHASE: "UPDATE_PURCHASE",
  DELETE_PURCHASE: "DELETE_PURCHASE",
  CREATE_SETTLEMENT: "CREATE_SETTLEMENT",
  CREATE_PURCHASE_PAYMENT: "CREATE_PURCHASE_PAYMENT",
  CREATE_TRANSFER: "CREATE_TRANSFER",
  CREATE_ADJUSTMENT: "CREATE_ADJUSTMENT",
  REVERSE_OPERATION: "REVERSE_OPERATION",
  USER_CREATE: "USER_CREATE",
  USER_UPDATE: "USER_UPDATE",
  USER_DEACTIVATE: "USER_DEACTIVATE",
  HOLDER_UPDATE: "HOLDER_UPDATE",
  ACCOUNT_UPDATE: "ACCOUNT_UPDATE",
  CUSTOMER_UPDATE: "CUSTOMER_UPDATE",
  CHANNEL_UPDATE: "CHANNEL_UPDATE",
  CLEAR_BUSINESS: "CLEAR_BUSINESS",
  IMPORT_DATA: "IMPORT_DATA",
  EXPORT_REPORT: "EXPORT_REPORT",
  CREATE_SNAPSHOT: "CREATE_SNAPSHOT",
  RUN_BACKUP: "RUN_BACKUP",
  SCHEDULED_BACKUP: "SCHEDULED_BACKUP",
  CREATE_SPECIAL_CLIENT: "CREATE_SPECIAL_CLIENT",
  CREATE_SPECIAL_CLIENT_DEPOSIT: "CREATE_SPECIAL_CLIENT_DEPOSIT",
  CREATE_SPECIAL_CLIENT_PAYOUT: "CREATE_SPECIAL_CLIENT_PAYOUT",
  REVERSE_SPECIAL_CLIENT_WALLET: "REVERSE_SPECIAL_CLIENT_WALLET",
  EXPORT_SPECIAL_CLIENT_WALLET: "EXPORT_SPECIAL_CLIENT_WALLET"
} as const;

export type AuditActor = {
  id?: number | null;
  username?: string | null;
  ipAddress?: string;
  userAgent?: string;
};

type WriteAuditInput = {
  action: string;
  targetType: string;
  targetId?: number | null;
  before?: unknown;
  after?: unknown;
  actor?: AuditActor;
};

type DbLike = DbTx | ReturnType<typeof getDb>;

export async function writeAudit(db: DbLike, input: WriteAuditInput) {
  const actor = input.actor ?? {};
  await db.insert(auditLogs).values({
    action: input.action,
    entityType: input.targetType,
    entityId: input.targetId ?? null,
    username: actor.username ?? null,
    operatorId: actor.id ?? null,
    beforeJson: input.before !== undefined ? JSON.stringify(input.before) : null,
    afterJson: input.after !== undefined ? JSON.stringify(input.after) : null,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null
  });
}

export function formatAuditLog(row: typeof auditLogs.$inferSelect) {
  return {
    id: row.id,
    userId: row.operatorId,
    username: row.username,
    action: row.action,
    targetType: row.entityType,
    targetId: row.entityId,
    beforeData: row.beforeJson ? safeParseJson(row.beforeJson) : null,
    afterData: row.afterJson ? safeParseJson(row.afterJson) : null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt
  };
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
