import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "operator"] }).notNull().default("operator"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const holders = pgTable("holders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  receivableTwd: numeric("receivable_twd", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    holderId: integer("holder_id").notNull().references(() => holders.id),
    name: text("name").notNull(),
    currency: text("currency", { enum: ["TWD", "RMB"] }).notNull(),
    balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
    profitBalance: numeric("profit_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    holderCurrencyIdx: index("accounts_holder_currency_idx").on(table.holderId, table.currency),
    uniqueHolderAccount: uniqueIndex("accounts_holder_name_idx").on(table.holderId, table.name)
  })
);

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => channels.id),
  paymentAccountId: integer("payment_account_id").references(() => accounts.id),
  depositAccountId: integer("deposit_account_id").notNull().references(() => accounts.id),
  rmbAmount: numeric("rmb_amount", { precision: 14, scale: 2 }).notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 12, scale: 6 }).notNull(),
  twdCost: numeric("twd_cost", { precision: 14, scale: 2 }).notNull(),
  paymentStatus: text("payment_status", { enum: ["paid", "unpaid"] }).notNull().default("paid"),
  status: text("status", { enum: ["active", "reversed"] }).notNull().default("active"),
  operatorId: integer("operator_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const rmbLots = pgTable(
  "rmb_lots",
  {
    id: serial("id").primaryKey(),
    purchaseId: integer("purchase_id").notNull().references(() => purchases.id),
    accountId: integer("account_id").notNull().references(() => accounts.id),
    originalRmb: numeric("original_rmb", { precision: 14, scale: 2 }).notNull(),
    remainingRmb: numeric("remaining_rmb", { precision: 14, scale: 2 }).notNull(),
    unitCostTwd: numeric("unit_cost_twd", { precision: 14, scale: 6 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 12, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    fifoIdx: index("rmb_lots_fifo_idx").on(table.accountId, table.createdAt)
  })
);

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  rmbAccountId: integer("rmb_account_id").notNull().references(() => accounts.id),
  rmbAmount: numeric("rmb_amount", { precision: 14, scale: 2 }).notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 12, scale: 6 }).notNull(),
  twdAmount: numeric("twd_amount", { precision: 14, scale: 2 }).notNull(),
  costTwd: numeric("cost_twd", { precision: 14, scale: 2 }).notNull(),
  profitTwd: numeric("profit_twd", { precision: 14, scale: 2 }).notNull(),
  settlementStatus: text("settlement_status", { enum: ["unsettled", "partial", "settled"] }).notNull().default("unsettled"),
  status: text("status", { enum: ["active", "reversed"] }).notNull().default("active"),
  operatorId: integer("operator_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const saleAllocations = pgTable("sale_allocations", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => sales.id),
  lotId: integer("lot_id").notNull().references(() => rmbLots.id),
  allocatedRmb: numeric("allocated_rmb", { precision: 14, scale: 2 }).notNull(),
  allocatedCostTwd: numeric("allocated_cost_twd", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const settlements = pgTable("settlements", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  amountTwd: numeric("amount_twd", { precision: 14, scale: 2 }).notNull(),
  note: text("note"),
  status: text("status", { enum: ["active", "reversed"] }).notNull().default("active"),
  operatorId: integer("operator_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const transfers = pgTable("transfers", {
  id: serial("id").primaryKey(),
  fromAccountId: integer("from_account_id").notNull().references(() => accounts.id),
  toAccountId: integer("to_account_id").notNull().references(() => accounts.id),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  note: text("note"),
  status: text("status", { enum: ["active", "reversed"] }).notNull().default("active"),
  operatorId: integer("operator_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: serial("id").primaryKey(),
    entryType: text("entry_type").notNull(),
    accountId: integer("account_id").references(() => accounts.id),
    customerId: integer("customer_id").references(() => customers.id),
    relatedTable: text("related_table"),
    relatedId: integer("related_id"),
    direction: text("direction", { enum: ["in", "out", "none"] }).notNull().default("none"),
    currency: text("currency", { enum: ["TWD", "RMB"] }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    balanceBefore: numeric("balance_before", { precision: 14, scale: 2 }),
    balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }),
    description: text("description").notNull(),
    isReversal: boolean("is_reversal").notNull().default(false),
    reversesLedgerId: integer("reverses_ledger_id"),
    operatorId: integer("operator_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    ledgerCreatedIdx: index("ledger_created_idx").on(table.createdAt),
    ledgerRelatedIdx: index("ledger_related_idx").on(table.relatedTable, table.relatedId)
  })
);

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  operatorId: integer("operator_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export type UserRole = "admin" | "operator";
export type Currency = "TWD" | "RMB";
