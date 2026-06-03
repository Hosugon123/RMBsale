import type { AppState, AuthUser, CashAccount, SalesRecord } from './types.js';
import { nextId } from './store.js';
import {
  allocateInventoryForSale,
  createInventoryFromPurchase,
  reduceRmbInventoryFifo,
  reversePurchaseInventory,
  reverseSaleAllocation,
} from './fifo.js';

export function getTotalTwd(state: AppState): number {
  return state.cashAccounts
    .filter((a) => a.isActive && a.currency === 'TWD')
    .reduce((s, a) => s + a.balance, 0);
}

export function getTotalRmb(state: AppState): number {
  return state.cashAccounts
    .filter((a) => a.isActive && a.currency === 'RMB')
    .reduce((s, a) => s + a.balance, 0);
}

export function getTotalReceivables(state: AppState): number {
  return state.customers.reduce((s, c) => s + c.totalReceivablesTwd, 0);
}

export function getTotalProfit(state: AppState): number {
  return state.cashAccounts.reduce((s, a) => s + a.profitBalance, 0);
}

export function groupAccountsByHolder(state: AppState, currency?: 'TWD' | 'RMB') {
  return state.holders
    .filter((h) => h.isActive)
    .map((h) => ({
      holderId: h.id,
      holderName: h.name,
      accounts: state.cashAccounts.filter(
        (a) =>
          a.holderId === h.id &&
          a.isActive &&
          (!currency || a.currency === currency),
      ),
    }))
    .filter((g) => g.accounts.length > 0);
}

export function getSaleProfit(state: AppState, sale: SalesRecord) {
  const allocs = state.fifoSalesAllocations.filter((a) => a.salesRecordId === sale.id);
  const cost = allocs.reduce((s, a) => s + a.allocatedCostTwd, 0);
  const profit = sale.twdAmount - cost;
  const margin = sale.twdAmount > 0 ? (profit / sale.twdAmount) * 100 : 0;
  return { profitTwd: profit, profitMargin: margin, costTwd: cost };
}

export function recordSale(
  state: AppState,
  user: AuthUser,
  body: {
    customerId?: number;
    customerNameManual?: string;
    rmbAccountId: number;
    rmbAmount: number;
    exchangeRate: number;
  },
) {
  let customerId = body.customerId;
  if (!customerId && body.customerNameManual?.trim()) {
    const name = body.customerNameManual.trim();
    let c = state.customers.find((x) => x.name === name && x.isActive);
    if (!c) {
      c = {
        id: nextId(state, 'customer'),
        name,
        isActive: true,
        totalReceivablesTwd: 0,
      };
      state.customers.push(c);
    }
    customerId = c.id;
  }
  if (!customerId) throw new Error('請選擇或輸入客戶');

  const rmbAmount = Number(body.rmbAmount);
  const exchangeRate = Number(body.exchangeRate);
  if (rmbAmount <= 0 || exchangeRate <= 0) throw new Error('金額與匯率必須大於 0');

  const twdAmount = Math.round(rmbAmount * exchangeRate * 100) / 100;
  const sale: SalesRecord = {
    id: nextId(state, 'salesRecord'),
    customerId,
    rmbAccountId: body.rmbAccountId,
    rmbAmount,
    exchangeRate,
    twdAmount,
    isSettled: false,
    createdAt: new Date().toISOString(),
    operatorId: user.id,
  };
  state.salesRecords.push(sale);

  const profitInfo = allocateInventoryForSale(state, sale);

  const customer = state.customers.find((c) => c.id === customerId)!;
  customer.totalReceivablesTwd += twdAmount;

  return { sale, profitInfo };
}

export function recordPurchase(
  state: AppState,
  user: AuthUser,
  body: {
    paymentAccountId?: number | null;
    depositAccountId: number;
    rmbAmount: number;
    exchangeRate: number;
    channelId?: number | null;
    channelNameManual?: string;
    paymentStatus: 'paid' | 'unpaid';
  },
) {
  const rmbAmount = Number(body.rmbAmount);
  const exchangeRate = Number(body.exchangeRate);
  const twdCost = Math.round(rmbAmount * exchangeRate * 100) / 100;

  let channelId = body.channelId ?? null;
  if (!channelId && body.channelNameManual?.trim()) {
    const name = body.channelNameManual.trim();
    let ch = state.channels.find((x) => x.name === name && x.isActive);
    if (!ch) {
      ch = { id: nextId(state, 'channel'), name, isActive: true };
      state.channels.push(ch);
    }
    channelId = ch.id;
  }

  const deposit = state.cashAccounts.find((a) => a.id === body.depositAccountId);
  if (!deposit || deposit.currency !== 'RMB') throw new Error('請選擇有效的 RMB 入庫帳戶');

  if (body.paymentStatus === 'paid') {
    if (!body.paymentAccountId) throw new Error('已付款需選擇付款帳戶');
    const pay = state.cashAccounts.find((a) => a.id === body.paymentAccountId);
    if (!pay || pay.currency !== 'TWD') throw new Error('無效的 TWD 付款帳戶');
    if (pay.balance < twdCost - 0.001) {
      throw new Error(`付款帳戶餘額不足，需要 NT$${twdCost.toFixed(2)}`);
    }
    pay.balance -= twdCost;
  }

  deposit.balance += rmbAmount;

  const purchase = {
    id: nextId(state, 'purchaseRecord'),
    paymentAccountId: body.paymentStatus === 'paid' ? body.paymentAccountId! : null,
    depositAccountId: body.depositAccountId,
    channelId,
    rmbAmount,
    exchangeRate,
    twdCost,
    paymentStatus: body.paymentStatus,
    purchaseDate: new Date().toISOString(),
    operatorId: user.id,
  };
  state.purchaseRecords.push(purchase);

  // 修復：FIFO 建立失敗則整筆 rollback（由 mutate 外層不 commit 處理，這裡直接 throw）
  createInventoryFromPurchase(state, purchase);

  if (body.paymentStatus === 'unpaid') {
    state.pendingPayments.push({
      id: nextId(state, 'pendingPayment'),
      purchaseRecordId: purchase.id,
      amountTwd: twdCost,
      createdAt: new Date().toISOString(),
      paidAt: null,
      isSettled: false,
    });
  }

  return purchase;
}

export function settleCustomer(
  state: AppState,
  user: AuthUser,
  body: { customerId: number; amount: number; accountId: number; note?: string },
) {
  const amount = Number(body.amount);
  const customer = state.customers.find((c) => c.id === body.customerId);
  if (!customer) throw new Error('找不到客戶');
  if (amount <= 0) throw new Error('金額必須大於 0');
  if (customer.totalReceivablesTwd < amount - 0.001) {
    throw new Error('銷帳金額超過應收帳款');
  }

  const account = state.cashAccounts.find((a) => a.id === body.accountId);
  if (!account || account.currency !== 'TWD') throw new Error('請選擇 TWD 收款帳戶');

  let remaining = amount;
  const unsettled = state.salesRecords
    .filter((s) => s.customerId === customer.id && !s.isSettled)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const sale of unsettled) {
    if (remaining <= 0.001) break;
    if (sale.twdAmount <= remaining + 0.001) {
      sale.isSettled = true;
      remaining -= sale.twdAmount;
    }
  }

  customer.totalReceivablesTwd -= amount;
  account.balance += amount;

  state.ledgerEntries.push({
    id: nextId(state, 'ledgerEntry'),
    entryType: 'SETTLEMENT',
    accountId: account.id,
    amount,
    description: body.note || `客戶 ${customer.name} 銷帳`,
    entryDate: new Date().toISOString(),
    operatorId: user.id,
    profitBefore: null,
    profitAfter: null,
    profitChange: null,
    fromAccountId: null,
    toAccountId: null,
  });

  state.cashLogs.push({
    id: nextId(state, 'cashLog'),
    time: new Date().toISOString(),
    type: 'SETTLEMENT',
    description: `客戶 ${customer.name} 銷帳 NT$${amount}`,
    amount,
    operatorId: user.id,
  });
}

export function settlePendingPayment(
  state: AppState,
  user: AuthUser,
  body: { pendingId: number; paymentAccountId: number; settlementAmount: number; note?: string },
) {
  const pending = state.pendingPayments.find((p) => p.id === body.pendingId && !p.isSettled);
  if (!pending) throw new Error('找不到待付款項');

  const amount = Number(body.settlementAmount);
  if (amount <= 0) throw new Error('金額必須大於 0');

  const pay = state.cashAccounts.find((a) => a.id === body.paymentAccountId);
  if (!pay || pay.currency !== 'TWD') throw new Error('無效付款帳戶');
  if (pay.balance < amount - 0.001) throw new Error('付款帳戶餘額不足');

  pay.balance -= amount;
  pending.amountTwd -= amount;
  if (pending.amountTwd <= 0.001) {
    pending.amountTwd = 0;
    pending.isSettled = true;
    pending.paidAt = new Date().toISOString();
  }

  state.ledgerEntries.push({
    id: nextId(state, 'ledgerEntry'),
    entryType: 'PAYMENT',
    accountId: pay.id,
    amount: -amount,
    description: body.note || '待付款項結清',
    entryDate: new Date().toISOString(),
    operatorId: user.id,
    profitBefore: null,
    profitAfter: null,
    profitChange: null,
    fromAccountId: null,
    toAccountId: null,
  });
}

export function updateCashAccount(
  state: AppState,
  user: AuthUser,
  action: string,
  data: Record<string, unknown>,
) {
  switch (action) {
    case 'add_holder': {
      const name = String(data.name || '').trim();
      if (!name) throw new Error('請輸入持有人名稱');
      if (state.holders.some((h) => h.name === name)) throw new Error('持有人已存在');
      state.holders.push({ id: nextId(state, 'holder'), name, isActive: true });
      break;
    }
    case 'delete_holder': {
      const holderId = Number(data.holder_id);
      const holder = state.holders.find((h) => h.id === holderId);
      if (!holder) throw new Error('找不到持有人');
      const hasAccounts = state.cashAccounts.some(
        (a) => a.holderId === holderId && a.isActive,
      );
      if (hasAccounts) throw new Error('請先刪除該持有人下所有帳戶');
      holder.isActive = false;
      break;
    }
    case 'add_account': {
      const holderId = Number(data.holder_id);
      const name = String(data.account_name || '').trim();
      const currency = data.currency as 'TWD' | 'RMB';
      if (!state.holders.find((h) => h.id === holderId && h.isActive)) {
        throw new Error('找不到持有人');
      }
      state.cashAccounts.push({
        id: nextId(state, 'cashAccount'),
        holderId,
        name,
        currency,
        balance: 0,
        profitBalance: 0,
        isActive: true,
      });
      break;
    }
    case 'delete_account': {
      const accountId = Number(data.account_id);
      const acc = state.cashAccounts.find((a) => a.id === accountId);
      if (!acc) throw new Error('找不到帳戶');
      if (Math.abs(acc.balance) > 0.001) throw new Error('帳戶餘額不為零，無法刪除');
      acc.isActive = false;
      break;
    }
    case 'add_movement': {
      const accountId = Number(data.account_id);
      const amount = Number(data.amount);
      const movementType = String(data.movement_type);
      const acc = state.cashAccounts.find((a) => a.id === accountId && a.isActive);
      if (!acc) throw new Error('找不到帳戶');
      const delta = movementType === 'deposit' ? amount : -amount;
      if (movementType === 'withdraw' && acc.currency === 'RMB') {
        const leftover = reduceRmbInventoryFifo(state, amount);
        if (leftover > 0.001) throw new Error('FIFO 庫存不足以支取');
      }
      if (acc.balance + delta < -0.001) throw new Error('餘額不足');
      acc.balance += delta;
      state.ledgerEntries.push({
        id: nextId(state, 'ledgerEntry'),
        entryType: movementType === 'deposit' ? 'DEPOSIT' : 'WITHDRAW',
        accountId: acc.id,
        amount: delta,
        description: String(data.description || ''),
        entryDate: new Date().toISOString(),
        operatorId: user.id,
        profitBefore: null,
        profitAfter: null,
        profitChange: null,
        fromAccountId: null,
        toAccountId: null,
      });
      break;
    }
    case 'transfer': {
      const fromId = Number(data.from_account_id);
      const toId = Number(data.to_account_id);
      const amount = Number(data.amount);
      const from = state.cashAccounts.find((a) => a.id === fromId);
      const to = state.cashAccounts.find((a) => a.id === toId);
      if (!from || !to) throw new Error('帳戶不存在');
      if (from.currency !== to.currency) throw new Error('僅能同幣別轉帳');
      if (from.balance < amount - 0.001) throw new Error('轉出帳戶餘額不足');
      from.balance -= amount;
      to.balance += amount;
      state.ledgerEntries.push({
        id: nextId(state, 'ledgerEntry'),
        entryType: 'TRANSFER',
        accountId: null,
        amount,
        description: String(data.description || '內部轉帳'),
        entryDate: new Date().toISOString(),
        operatorId: user.id,
        profitBefore: null,
        profitAfter: null,
        profitChange: null,
        fromAccountId: fromId,
        toAccountId: toId,
      });
      break;
    }
    default:
      throw new Error(`未知操作: ${action}`);
  }
}

export function independentDeposit(
  state: AppState,
  user: AuthUser,
  body: { rmbAmount: number; accountId: number },
) {
  const rmbAmount = Number(body.rmbAmount);
  if (rmbAmount <= 0) throw new Error('金額必須大於 0');
  const acc = state.cashAccounts.find((a) => a.id === body.accountId && a.currency === 'RMB');
  if (!acc) throw new Error('請選擇 RMB 帳戶');

  const fee = Math.round(rmbAmount * 0.01 * 100) / 100;
  const net = rmbAmount - fee;
  acc.balance += net;
  state.meta.feeProfitTotal += fee;

  const inv = {
    id: nextId(state, 'purchaseRecord'),
    paymentAccountId: null,
    depositAccountId: acc.id,
    channelId: null,
    rmbAmount: net,
    exchangeRate: 0,
    twdCost: 0,
    paymentStatus: 'paid' as const,
    purchaseDate: new Date().toISOString(),
    operatorId: user.id,
  };
  state.purchaseRecords.push(inv);
  createInventoryFromPurchase(state, { ...inv, exchangeRate: 1, twdCost: 0 });

  state.independentBalanceLogs.push({
    id: nextId(state, 'independentBalanceLog'),
    type: 'deposit',
    rmbAmount,
    feeAmount: fee,
    netRmb: net,
    accountId: acc.id,
    operatorId: user.id,
    createdAt: new Date().toISOString(),
    note: null,
  });
}

export { reverseSaleAllocation, reversePurchaseInventory };

export function buildTransactionsStream(state: AppState, page: number, perPage: number) {
  type Row = {
    id: string;
    type: string;
    date: string;
    description: string;
    twdChange: number;
    rmbChange: number;
    operator: string;
    sortKey: number;
  };

  const userMap = Object.fromEntries(state.users.map((u) => [u.id, u.username]));
  const rows: Row[] = [];

  for (const p of state.purchaseRecords) {
    const ch = state.channels.find((c) => c.id === p.channelId);
    rows.push({
      id: `p-${p.id}`,
      type: 'PURCHASE',
      date: p.purchaseDate,
      description: `買入 ${ch?.name || ''} ¥${p.rmbAmount}`,
      twdChange: p.paymentStatus === 'paid' ? -p.twdCost : 0,
      rmbChange: p.rmbAmount,
      operator: userMap[p.operatorId] || '',
      sortKey: new Date(p.purchaseDate).getTime(),
    });
  }

  for (const s of state.salesRecords) {
    const cust = state.customers.find((c) => c.id === s.customerId);
    rows.push({
      id: `s-${s.id}`,
      type: 'SALE',
      date: s.createdAt,
      description: `售出 ${cust?.name || ''} ¥${s.rmbAmount}`,
      twdChange: s.twdAmount,
      rmbChange: -s.rmbAmount,
      operator: userMap[s.operatorId] || '',
      sortKey: new Date(s.createdAt).getTime(),
    });
  }

  for (const l of state.ledgerEntries) {
    rows.push({
      id: `l-${l.id}`,
      type: l.entryType,
      date: l.entryDate,
      description: l.description || l.entryType,
      twdChange: l.amount,
      rmbChange: 0,
      operator: userMap[l.operatorId] || '',
      sortKey: new Date(l.entryDate).getTime(),
    });
  }

  rows.sort((a, b) => a.sortKey - b.sortKey);

  let runningTwd = 0;
  const withBalance = rows.map((r) => {
    runningTwd += r.twdChange;
    return { ...r, runningTwdBalance: runningTwd };
  });

  withBalance.reverse();
  const total = withBalance.length;
  const start = (page - 1) * perPage;
  const pageRows = withBalance.slice(start, start + perPage);

  return {
    transactions: pageRows,
    pagination: {
      page,
      perPage,
      total,
      pages: Math.ceil(total / perPage) || 1,
      hasPrev: page > 1,
      hasNext: start + perPage < total,
    },
  };
}

export function getInventoryData(state: AppState) {
  return [...state.fifoInventory]
    .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
    .slice(0, 20)
    .map((item) => {
      const purchase = state.purchaseRecords.find((p) => p.id === item.purchaseRecordId);
      const channel = purchase?.channelId
        ? state.channels.find((c) => c.id === purchase.channelId)
        : null;
      const payAcc = purchase?.paymentAccountId
        ? state.cashAccounts.find((a) => a.id === purchase.paymentAccountId)
        : null;
      const depAcc = purchase?.depositAccountId
        ? state.cashAccounts.find((a) => a.id === purchase.depositAccountId)
        : null;
      return {
        purchaseDate: item.purchaseDate.slice(0, 10),
        channel: channel?.name || 'N/A',
        paymentAccount: payAcc?.name || null,
        depositAccount: depAcc?.name || null,
        originalRmb: item.rmbAmount,
        remainingRmb: item.remainingRmb,
        soldRmb: item.rmbAmount - item.remainingRmb,
        unitCostTwd: item.unitCostTwd,
        exchangeRate: item.exchangeRate,
        totalValueTwd: item.remainingRmb * item.unitCostTwd,
      };
    });
}

export function getSalesWithProfit(state: AppState) {
  return [...state.salesRecords]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30)
    .map((sale) => {
      const cust = state.customers.find((c) => c.id === sale.customerId);
      const p = getSaleProfit(state, sale);
      return {
        customerName: cust?.name || '',
        rmbAmount: sale.rmbAmount,
        twdAmount: sale.twdAmount,
        profitTwd: p.profitTwd,
        profitMargin: p.profitMargin,
      };
    });
}
