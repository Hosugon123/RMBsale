import { and, desc, eq, gte, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import { AuditAction, writeAudit, type AuditActor } from "./audit.js";
import { getDb, type DbTx } from "./db.js";
import { money, toDbMoney, toDbRate } from "./money.js";
import {
  accounts,
  ledgerEntries,
  specialClientWalletEntries,
  specialClients,
  users,
  type Currency
} from "./schema.js";
import { calcDepositBreakdown, calcPeriodSummary, formatFeeRatePercent } from "./specialClientWalletCalc.js";
import {
  entryTypeLabel,
  profitLedgerStatusLabel,
  reversalStatusLabel
} from "./specialClientWalletLabels.js";

export type WalletEntryTypeFilter = "all" | "deposit" | "payout" | "reversal";

export type WalletQueryParams = {
  clientId?: number;
  dateFrom?: string;
  dateTo?: string;
  entryType?: WalletEntryTypeFilter;
};

type DepositInput = {
  clientId: number;
  entryDate: string;
  usdAmount?: string | null;
  usdToRmbRate?: string | null;
  grossRmb: string;
  feeRate?: string;
  cashAccountId: number;
  note?: string;
};

type PayoutInput = {
  clientId: number;
  entryDate: string;
  payoutRmb: string;
  vendorName?: string;
  cashAccountId: number;
  purpose?: string;
  note?: string;
};

export type WalletEntryRow = {
  id: number;
  clientId: number;
  clientName: string;
  type: "deposit" | "payout" | "reversal";
  entryDate: string;
  usdAmount: string | null;
  usdToRmbRate: string | null;
  grossRmb: string | null;
  feeRate: string | null;
  feeRmb: string | null;
  netCreditRmb: string | null;
  payoutRmb: string | null;
  vendorName: string | null;
  purpose: string | null;
  cashAccountId: number;
  cashAccountName: string;
  cashAccountDelta: string;
  balanceAfterRmb: string;
  profitLedgerId: number | null;
  note: string | null;
  createdBy: number;
  operatorName: string | null;
  operatorUsername: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversedBy: number | null;
  reverseReason: string | null;
  originalEntryId: number | null;
  reversalEntryId: number | null;
};

function todayEntryDate() {
  return new Date().toISOString().slice(0, 10);
}

async function getClientBalanceInTx(tx: DbTx | ReturnType<typeof getDb>, clientId: number) {
  const [last] = await tx
    .select({ balanceAfterRmb: specialClientWalletEntries.balanceAfterRmb })
    .from(specialClientWalletEntries)
    .where(eq(specialClientWalletEntries.clientId, clientId))
    .orderBy(desc(specialClientWalletEntries.id))
    .limit(1);
  return last?.balanceAfterRmb ?? "0";
}

async function assertActiveRmbAccount(tx: DbTx, accountId: number) {
  const [account] = await tx
    .select({
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      isActive: accounts.isActive,
      deletedAt: accounts.deletedAt
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account || !account.isActive || account.deletedAt) throw new Error("找不到可用的公司 RMB 帳戶");
  if (account.currency !== "RMB") throw new Error("請選擇 RMB 帳戶");
  return account;
}

async function assertActiveClient(tx: DbTx, clientId: number) {
  const [client] = await tx
    .select({ id: specialClients.id, name: specialClients.name, feeRate: specialClients.feeRate, isActive: specialClients.isActive })
    .from(specialClients)
    .where(eq(specialClients.id, clientId))
    .limit(1);
  if (!client || !client.isActive) throw new Error("找不到可用的特殊客戶");
  return client;
}

async function assertProfitLedgerNotReversed(tx: DbTx, profitLedgerId: number) {
  const [existing] = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.reversesLedgerId, profitLedgerId))
    .limit(1);
  if (existing) throw new Error("此筆利潤流水已沖銷");
}

async function applyCashAccountDelta(
  tx: DbTx,
  accountId: number,
  amount: string,
  direction: "in" | "out",
  relatedId: number,
  operatorId: number,
  description: string,
  entryType: string,
  reversesLedgerId?: number
) {
  const [before] = await tx.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.id, accountId));
  const [after] = await tx
    .update(accounts)
    .set({ balance: sql`${accounts.balance} + ${toDbMoney(amount)}` })
    .where(eq(accounts.id, accountId))
    .returning({ balance: accounts.balance });

  await tx.insert(ledgerEntries).values({
    entryType,
    accountId,
    relatedTable: "special_client_wallet",
    relatedId,
    direction,
    currency: "RMB" satisfies Currency,
    amount: toDbMoney(Math.abs(Number(amount))),
    balanceBefore: before?.balance,
    balanceAfter: after?.balance,
    description,
    isReversal: reversesLedgerId !== undefined,
    reversesLedgerId: reversesLedgerId ?? null,
    operatorId
  });
}

function fmtRmbAmount(value: string) {
  return `¥${money(value).toNumber().toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildEntryFilters(params: { clientId?: number; dateFrom?: string; dateTo?: string; entryType?: WalletEntryTypeFilter }) {
  const filters: SQL[] = [];
  if (params.clientId) filters.push(eq(specialClientWalletEntries.clientId, params.clientId));
  if (params.dateFrom) filters.push(gte(specialClientWalletEntries.entryDate, params.dateFrom));
  if (params.dateTo) filters.push(lte(specialClientWalletEntries.entryDate, params.dateTo));
  if (params.entryType && params.entryType !== "all") {
    filters.push(eq(specialClientWalletEntries.type, params.entryType));
  }
  return filters.length ? and(...filters) : undefined;
}

async function queryWalletEntries(db: DbTx | ReturnType<typeof getDb>, params: WalletQueryParams) {
  const whereClause = buildEntryFilters(params);
  return db
    .select({
      id: specialClientWalletEntries.id,
      clientId: specialClientWalletEntries.clientId,
      clientName: specialClients.name,
      type: specialClientWalletEntries.type,
      entryDate: specialClientWalletEntries.entryDate,
      usdAmount: specialClientWalletEntries.usdAmount,
      usdToRmbRate: specialClientWalletEntries.usdToRmbRate,
      grossRmb: specialClientWalletEntries.grossRmb,
      feeRate: specialClientWalletEntries.feeRate,
      feeRmb: specialClientWalletEntries.feeRmb,
      netCreditRmb: specialClientWalletEntries.netCreditRmb,
      payoutRmb: specialClientWalletEntries.payoutRmb,
      vendorName: specialClientWalletEntries.vendorName,
      purpose: specialClientWalletEntries.purpose,
      cashAccountId: specialClientWalletEntries.cashAccountId,
      cashAccountName: accounts.name,
      cashAccountDelta: specialClientWalletEntries.cashAccountDelta,
      balanceAfterRmb: specialClientWalletEntries.balanceAfterRmb,
      profitLedgerId: specialClientWalletEntries.profitLedgerId,
      note: specialClientWalletEntries.note,
      createdBy: specialClientWalletEntries.createdBy,
      operatorName: users.displayName,
      operatorUsername: users.username,
      createdAt: specialClientWalletEntries.createdAt,
      reversedAt: specialClientWalletEntries.reversedAt,
      reversedBy: specialClientWalletEntries.reversedBy,
      reverseReason: specialClientWalletEntries.reverseReason,
      originalEntryId: specialClientWalletEntries.originalEntryId,
      reversalEntryId: specialClientWalletEntries.reversalEntryId
    })
    .from(specialClientWalletEntries)
    .innerJoin(specialClients, eq(specialClientWalletEntries.clientId, specialClients.id))
    .innerJoin(accounts, eq(specialClientWalletEntries.cashAccountId, accounts.id))
    .innerJoin(users, eq(specialClientWalletEntries.createdBy, users.id))
    .where(whereClause)
    .orderBy(desc(specialClientWalletEntries.entryDate), desc(specialClientWalletEntries.id));
}

export function serializeWalletEntry(row: WalletEntryRow) {
  return {
    ...row,
    entryDate: String(row.entryDate),
    createdAt: row.createdAt.toISOString(),
    reversedAt: row.reversedAt?.toISOString() ?? null,
    typeLabel: entryTypeLabel(row.type, row.reversedAt),
    reversalStatus: reversalStatusLabel(row.type, row.reversedAt, row.reverseReason),
    profitLedgerStatus: profitLedgerStatusLabel(row.type, row.profitLedgerId, row.reversedAt),
    canReverse: row.type !== "reversal" && !row.reversedAt && !row.originalEntryId
  };
}

export async function getSpecialClientWallet(params: WalletQueryParams = {}) {
  const db = getDb();
  const clients = await db
    .select({
      id: specialClients.id,
      name: specialClients.name,
      feeRate: specialClients.feeRate,
      isActive: specialClients.isActive
    })
    .from(specialClients)
    .where(eq(specialClients.isActive, true))
    .orderBy(specialClients.id);

  const activeClientId = params.clientId ?? clients[0]?.id;
  const entries = activeClientId
    ? await queryWalletEntries(db, { ...params, clientId: activeClientId })
    : [];

  const rmbAccounts = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      holderId: accounts.holderId,
      balance: accounts.balance
    })
    .from(accounts)
    .where(and(eq(accounts.currency, "RMB"), eq(accounts.isActive, true), isNull(accounts.deletedAt)))
    .orderBy(accounts.id);

  const balanceRmb = activeClientId ? await getClientBalanceInTx(db, activeClientId) : "0";
  const periodSummary = calcPeriodSummary(entries);

  return {
    clients,
    entries: entries.map(serializeWalletEntry),
    summary: {
      balanceRmb,
      ...periodSummary
    },
    filters: {
      clientId: activeClientId ?? null,
      dateFrom: params.dateFrom ?? null,
      dateTo: params.dateTo ?? null,
      entryType: params.entryType ?? "all"
    },
    selectedClientId: activeClientId ?? null,
    rmbAccounts
  };
}

export async function createSpecialClientDeposit(input: DepositInput, actor: AuditActor) {
  if (!input.clientId) throw new Error("請選擇客戶");
  if (!input.cashAccountId) throw new Error("請選擇入帳公司 RMB 帳戶");
  if (!input.entryDate) throw new Error("請填寫日期");

  const feeRate = input.feeRate?.trim() || "0.011";
  const breakdown = calcDepositBreakdown(input.grossRmb, feeRate);

  const db = getDb();
  return db.transaction(async (tx) => {
    const client = await assertActiveClient(tx, input.clientId);
    const account = await assertActiveRmbAccount(tx, input.cashAccountId);
    const balanceBefore = money(await getClientBalanceInTx(tx, input.clientId));
    const balanceAfter = balanceBefore.add(breakdown.netCreditRmb);

    const [entry] = await tx
      .insert(specialClientWalletEntries)
      .values({
        clientId: input.clientId,
        type: "deposit",
        entryDate: input.entryDate,
        usdAmount: input.usdAmount ? toDbMoney(input.usdAmount) : null,
        usdToRmbRate: input.usdToRmbRate ? toDbRate(input.usdToRmbRate) : null,
        grossRmb: breakdown.grossRmb,
        feeRate: breakdown.feeRate,
        feeRmb: breakdown.feeRmb,
        netCreditRmb: breakdown.netCreditRmb,
        cashAccountId: input.cashAccountId,
        cashAccountDelta: breakdown.grossRmb,
        balanceAfterRmb: toDbMoney(balanceAfter),
        note: input.note?.trim() || null,
        createdBy: actor.id ?? 0
      })
      .returning();

    await applyCashAccountDelta(
      tx,
      input.cashAccountId,
      breakdown.grossRmb,
      "in",
      entry.id,
      actor.id ?? 0,
      `特殊客戶儲值入帳 ${account.name} ${fmtRmbAmount(breakdown.grossRmb)}`,
      "特殊客戶儲值"
    );

    const profitDescription = `特殊客戶代付服務費｜客戶：${client.name}｜結匯 ${fmtRmbAmount(breakdown.grossRmb)}｜費率 ${formatFeeRatePercent(breakdown.feeRate)}`;
    const [profitEntry] = await tx
      .insert(ledgerEntries)
      .values({
        entryType: "利潤",
        relatedTable: "special_client_wallet",
        relatedId: entry.id,
        direction: "in",
        currency: "RMB",
        amount: breakdown.feeRmb,
        description: profitDescription,
        operatorId: actor.id ?? 0
      })
      .returning({ id: ledgerEntries.id });

    await tx
      .update(specialClientWalletEntries)
      .set({ profitLedgerId: profitEntry.id })
      .where(eq(specialClientWalletEntries.id, entry.id));

    await writeAudit(tx, {
      action: AuditAction.CREATE_SPECIAL_CLIENT_DEPOSIT,
      targetType: "special_client_wallet",
      targetId: entry.id,
      after: entry,
      actor
    });

    return entry;
  });
}

export async function createSpecialClientPayout(input: PayoutInput, actor: AuditActor) {
  if (!input.clientId) throw new Error("請選擇客戶");
  if (!input.cashAccountId) throw new Error("請選擇付款公司 RMB 帳戶");
  if (!input.entryDate) throw new Error("請填寫日期");
  const payout = money(input.payoutRmb);
  if (payout.lte(0)) throw new Error("代付 RMB 金額必須大於 0");

  const payoutRmb = toDbMoney(payout);
  const db = getDb();

  return db.transaction(async (tx) => {
    const client = await assertActiveClient(tx, input.clientId);
    const account = await assertActiveRmbAccount(tx, input.cashAccountId);
    const balanceBefore = money(await getClientBalanceInTx(tx, input.clientId));
    const balanceAfter = balanceBefore.sub(payoutRmb);

    const vendorLabel = input.vendorName?.trim() || input.purpose?.trim() || "代付";

    const [entry] = await tx
      .insert(specialClientWalletEntries)
      .values({
        clientId: input.clientId,
        type: "payout",
        entryDate: input.entryDate,
        payoutRmb,
        vendorName: input.vendorName?.trim() || null,
        purpose: input.purpose?.trim() || null,
        cashAccountId: input.cashAccountId,
        cashAccountDelta: toDbMoney(payout.neg()),
        balanceAfterRmb: toDbMoney(balanceAfter),
        note: input.note?.trim() || null,
        createdBy: actor.id ?? 0
      })
      .returning();

    await applyCashAccountDelta(
      tx,
      input.cashAccountId,
      toDbMoney(payout.neg()),
      "out",
      entry.id,
      actor.id ?? 0,
      `特殊客戶代付 ${client.name} → ${vendorLabel} ${fmtRmbAmount(payoutRmb)}`,
      "特殊客戶代付"
    );

    await writeAudit(tx, {
      action: AuditAction.CREATE_SPECIAL_CLIENT_PAYOUT,
      targetType: "special_client_wallet",
      targetId: entry.id,
      after: entry,
      actor
    });

    return entry;
  });
}

export async function reverseSpecialClientWalletEntry(
  input: { entryId: number; reverseReason: string; clientId?: number },
  actor: AuditActor
) {
  const reason = input.reverseReason?.trim();
  if (!reason) throw new Error("請填寫沖銷原因");

  const db = getDb();
  await db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(specialClientWalletEntries)
      .where(eq(specialClientWalletEntries.id, input.entryId))
      .limit(1);

    if (!original) throw new Error("找不到流水紀錄");
    if (original.type === "reversal" || original.originalEntryId) {
      throw new Error("沖銷紀錄不可再次沖銷");
    }
    if (original.reversedAt || original.reversalEntryId) {
      throw new Error("此筆紀錄已沖銷，不可重複沖銷");
    }

    const client = await assertActiveClient(tx, original.clientId);
    const account = await assertActiveRmbAccount(tx, original.cashAccountId);
    const balanceBefore = money(await getClientBalanceInTx(tx, original.clientId));
    const entryDate = todayEntryDate();
    let reversalEntryId = 0;

    if (original.type === "deposit") {
      const gross = money(original.grossRmb ?? 0);
      const net = money(original.netCreditRmb ?? 0);
      const fee = money(original.feeRmb ?? 0);
      if (gross.lte(0)) throw new Error("原始儲值金額異常");

      const balanceAfter = balanceBefore.sub(net);
      const [reversalEntry] = await tx
        .insert(specialClientWalletEntries)
        .values({
          clientId: original.clientId,
          type: "reversal",
          entryDate,
          grossRmb: original.grossRmb,
          feeRate: original.feeRate,
          feeRmb: original.feeRmb,
          netCreditRmb: toDbMoney(net.neg()),
          usdAmount: original.usdAmount,
          usdToRmbRate: original.usdToRmbRate,
          cashAccountId: original.cashAccountId,
          cashAccountDelta: toDbMoney(gross.neg()),
          balanceAfterRmb: toDbMoney(balanceAfter),
          originalEntryId: original.id,
          note: reason,
          createdBy: actor.id ?? 0
        })
        .returning();
      reversalEntryId = reversalEntry.id;

      const [cashLedger] = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.relatedTable, "special_client_wallet"),
            eq(ledgerEntries.relatedId, original.id),
            eq(ledgerEntries.isReversal, false),
            isNotNull(ledgerEntries.accountId)
          )
        )
        .orderBy(desc(ledgerEntries.id))
        .limit(1);

      await applyCashAccountDelta(
        tx,
        original.cashAccountId,
        toDbMoney(gross.neg()),
        "out",
        reversalEntry.id,
        actor.id ?? 0,
        `沖銷特殊客戶儲值 ${account.name} ${fmtRmbAmount(original.grossRmb ?? "0")}`,
        "特殊客戶沖銷",
        cashLedger?.id
      );

      if (original.profitLedgerId) {
        await assertProfitLedgerNotReversed(tx, original.profitLedgerId);
        const profitDescription = `沖銷特殊客戶代付服務費｜客戶：${client.name}｜結匯 ${fmtRmbAmount(original.grossRmb ?? "0")}｜費率 ${formatFeeRatePercent(original.feeRate ?? "0.011")}`;
        const [profitReversal] = await tx
          .insert(ledgerEntries)
          .values({
            entryType: "利潤",
            relatedTable: "special_client_wallet",
            relatedId: reversalEntry.id,
            direction: "out",
            currency: "RMB",
            amount: toDbMoney(fee),
            description: profitDescription,
            isReversal: true,
            reversesLedgerId: original.profitLedgerId,
            operatorId: actor.id ?? 0
          })
          .returning({ id: ledgerEntries.id });

        await tx
          .update(specialClientWalletEntries)
          .set({ profitLedgerId: profitReversal.id })
          .where(eq(specialClientWalletEntries.id, reversalEntry.id));
      }
    } else if (original.type === "payout") {
      const payout = money(original.payoutRmb ?? 0);
      if (payout.lte(0)) throw new Error("原始代付金額異常");
      const balanceAfter = balanceBefore.add(payout);

      const [reversalEntry] = await tx
        .insert(specialClientWalletEntries)
        .values({
          clientId: original.clientId,
          type: "reversal",
          entryDate,
          payoutRmb: original.payoutRmb,
          vendorName: original.vendorName,
          purpose: original.purpose,
          cashAccountId: original.cashAccountId,
          cashAccountDelta: toDbMoney(payout),
          balanceAfterRmb: toDbMoney(balanceAfter),
          originalEntryId: original.id,
          note: reason,
          createdBy: actor.id ?? 0
        })
        .returning();
      reversalEntryId = reversalEntry.id;

      const [cashLedger] = await tx
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.relatedTable, "special_client_wallet"),
            eq(ledgerEntries.relatedId, original.id),
            eq(ledgerEntries.isReversal, false),
            isNotNull(ledgerEntries.accountId)
          )
        )
        .orderBy(desc(ledgerEntries.id))
        .limit(1);

      await applyCashAccountDelta(
        tx,
        original.cashAccountId,
        toDbMoney(payout),
        "in",
        reversalEntry.id,
        actor.id ?? 0,
        `沖銷特殊客戶代付 ${client.name} → ${original.vendorName ?? "廠商"} ${fmtRmbAmount(original.payoutRmb ?? "0")}`,
        "特殊客戶沖銷",
        cashLedger?.id
      );
    } else {
      throw new Error("不支援的流水類型");
    }

    await tx
      .update(specialClientWalletEntries)
      .set({
        reversedAt: new Date(),
        reversedBy: actor.id ?? null,
        reverseReason: reason,
        reversalEntryId
      })
      .where(eq(specialClientWalletEntries.id, original.id));

    await writeAudit(tx, {
      action: AuditAction.REVERSE_SPECIAL_CLIENT_WALLET,
      targetType: "special_client_wallet",
      targetId: original.id,
      after: { originalEntryId: original.id, reversalEntryId, reverseReason: reason },
      actor
    });
  });

  return getSpecialClientWallet({ clientId: input.clientId ?? undefined });
}

export async function exportSpecialClientWalletXlsx(params: WalletQueryParams, actor: AuditActor) {
  const data = await getSpecialClientWallet(params);
  const XLSX = await import("xlsx");

  const rows = data.entries.map((entry) => ({
    日期: entry.entryDate,
    類型: entry.typeLabel,
    客戶: entry.clientName,
    廠商或摘要:
      entry.type === "deposit"
        ? entry.grossRmb
          ? `結匯 ${entry.grossRmb}`
          : "—"
        : entry.vendorName ?? entry.purpose ?? "—",
    "入帳/付款公司帳戶": entry.cashAccountName,
    結匯RMB: entry.grossRmb ?? "",
    服務費RMB: entry.feeRmb ?? "",
    客戶實際入帳RMB: entry.netCreditRmb ?? "",
    代付RMB: entry.payoutRmb ?? "",
    公司帳戶異動: entry.cashAccountDelta,
    客戶餘額: entry.balanceAfterRmb,
    是否已入利潤流水: entry.profitLedgerStatus,
    操作人員: entry.operatorName?.trim() || entry.operatorUsername,
    備註: entry.note ?? "",
    沖銷狀態: entry.reversalStatus,
    沖銷原因: entry.type === "reversal" ? entry.note ?? "" : entry.reverseReason ?? "",
    原始流水ID: entry.originalEntryId ?? "",
    沖銷流水ID: entry.reversalEntryId ?? ""
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "特殊客戶對帳");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const db = getDb();
  await writeAudit(db, {
    action: AuditAction.EXPORT_SPECIAL_CLIENT_WALLET,
    targetType: "special_client_wallet",
    targetId: data.selectedClientId,
    after: { filters: data.filters, rowCount: rows.length },
    actor
  });

  return { buffer, filename: `special-client-wallet-${todayEntryDate()}.xlsx` };
}
