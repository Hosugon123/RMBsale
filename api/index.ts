import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import {
  clearAuthCookie,
  createToken,
  getUserFromRequest,
  setAuthCookie,
} from './lib/auth.js';
import { ConflictError, mutateState, readState, nextId } from './lib/store.js';
import {
  buildTransactionsStream,
  getInventoryData,
  getSalesWithProfit,
  getTotalProfit,
  getTotalReceivables,
  getTotalRmb,
  getTotalTwd,
  groupAccountsByHolder,
  independentDeposit,
  recordPurchase,
  recordSale,
  reversePurchaseInventory,
  reverseSaleAllocation,
  settleCustomer,
  settlePendingPayment,
  updateCashAccount,
  getSaleProfit,
} from './lib/services.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body);
}

function getPath(req: VercelRequest): string {
  const q = req.query.path;
  if (Array.isArray(q)) return q.join('/');
  if (typeof q === 'string') return q;
  return '';
}

function getVersion(req: VercelRequest): number | undefined {
  const v = req.headers['x-state-version'] || req.body?.expectedVersion;
  if (v === undefined || v === null || v === '') return undefined;
  return Number(v);
}

async function requireAuth(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromRequest(req);
  if (!user) {
    json(res, 401, { error: '請先登入' });
    return null;
  }
  return user;
}

function requireAdmin(user: { isAdmin: boolean }, res: VercelResponse) {
  if (!user.isAdmin) {
    json(res, 403, { error: '需要管理員權限' });
    return false;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = getPath(req);
  const method = req.method || 'GET';

  try {
    // --- Auth ---
    if (path === 'auth/login' && method === 'POST') {
      const { username, password } = req.body || {};
      const envelope = await readState();
      const user = envelope.data.users.find(
        (u) => u.username === username && u.isActive,
      );
      if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return json(res, 401, { error: '用戶名或密碼錯誤' });
      }
      const authUser = {
        id: user.id,
        username: user.username,
        role: user.role,
        isAdmin: user.role === 'admin',
      };
      const token = await createToken(authUser);
      res.setHeader('Set-Cookie', setAuthCookie(token));
      return json(res, 200, { user: authUser, version: envelope.version });
    }

    if (path === 'auth/logout' && method === 'POST') {
      res.setHeader('Set-Cookie', clearAuthCookie());
      return json(res, 200, { ok: true });
    }

    if (path === 'auth/me' && method === 'GET') {
      const user = await getUserFromRequest(req);
      if (!user) return json(res, 401, { error: '未登入' });
      const envelope = await readState();
      return json(res, 200, { user, version: envelope.version });
    }

    // --- State read ---
    if (path === 'state' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const envelope = await readState();
      return json(res, 200, envelope);
    }

    // --- Dashboard ---
    if (path === 'dashboard' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { data } = await readState();
      const recentPurchases = [...data.purchaseRecords]
        .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
        .slice(0, 5);
      const recentSales = [...data.salesRecords]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map((s) => ({
          ...s,
          customer: data.customers.find((c) => c.id === s.customerId),
        }));

      return json(res, 200, {
        totalTwd: getTotalTwd(data),
        totalRmb: getTotalRmb(data),
        totalReceivables: getTotalReceivables(data),
        totalProfitTwd: getTotalProfit(data),
        recentPurchases,
        recentSales,
        isAdmin: user.isAdmin,
      });
    }

    // --- Sales entry page data ---
    if (path === 'sales-entry' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { data, version } = await readState();
      const page = Number(req.query.page) || 1;
      const perPage = 10;
      const unsettled = data.salesRecords
        .filter((s) => !s.isSettled)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const total = unsettled.length;
      const start = (page - 1) * perPage;
      const pageSales = unsettled.slice(start, start + perPage).map((s) => ({
        ...s,
        customer: data.customers.find((c) => c.id === s.customerId),
        profitInfo: getSaleProfit(data, s),
      }));

      return json(res, 200, {
        version,
        customers: data.customers.filter((c) => c.isActive),
        ownerRmbAccountsGrouped: groupAccountsByHolder(data, 'RMB'),
        recentUnsettledSales: pageSales,
        pagination: {
          page,
          perPage,
          total,
          pages: Math.ceil(total / perPage) || 1,
          hasPrev: page > 1,
          hasNext: start + perPage < total,
          prevNum: page - 1,
          nextNum: page + 1,
        },
      });
    }

    if (path === 'sales-entry' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { result, version } = await mutateState(getVersion(req), (state) =>
        recordSale(state, user, req.body),
      );
      return json(res, 200, { status: 'success', version, data: result });
    }

    if (path === 'sales-entry/reverse' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const saleId = Number(req.body?.saleId);
      await mutateState(getVersion(req), (state) => {
        reverseSaleAllocation(state, saleId);
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    if (path === 'calculate-profit' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { rmbAmount, exchangeRate } = req.body || {};
      const { data } = await readState();
      const twdAmount = Number(rmbAmount) * Number(exchangeRate);
      const batches = [...data.fifoInventory]
        .filter((b) => b.remainingRmb > 0)
        .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());
      let remaining = Number(rmbAmount);
      let cost = 0;
      const breakdown: { batchId: number; rmb: number; cost: number }[] = [];
      for (const b of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, b.remainingRmb);
        const c = take * b.unitCostTwd;
        cost += c;
        remaining -= take;
        breakdown.push({ batchId: b.id, rmb: take, cost: c });
      }
      const profit = twdAmount - cost;
      return json(res, 200, {
        costTwd: cost,
        profitTwd: profit,
        profitMargin: twdAmount > 0 ? (profit / twdAmount) * 100 : 0,
        breakdown,
        sufficient: remaining <= 0.001,
      });
    }

    // --- Buy in ---
    if (path === 'buy-in' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { data, version } = await readState();
      const page = Number(req.query.page) || 1;
      const perPage = 10;
      const purchases = [...data.purchaseRecords]
        .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
      const total = purchases.length;
      const start = (page - 1) * perPage;
      const recent = purchases.slice(start, start + perPage).map((p) => ({
        ...p,
        channel: data.channels.find((c) => c.id === p.channelId),
        paymentAccount: p.paymentAccountId
          ? data.cashAccounts.find((a) => a.id === p.paymentAccountId)
          : null,
      }));

      return json(res, 200, {
        version,
        channels: data.channels.filter((c) => c.isActive),
        ownerTwdAccountsGrouped: groupAccountsByHolder(data, 'TWD'),
        ownerRmbAccountsGrouped: groupAccountsByHolder(data, 'RMB'),
        recentPurchases: recent,
        pagination: {
          page,
          perPage,
          total,
          pages: Math.ceil(total / perPage) || 1,
          hasPrev: page > 1,
          hasNext: start + perPage < total,
        },
      });
    }

    if (path === 'buy-in' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { result, version } = await mutateState(getVersion(req), (state) =>
        recordPurchase(state, user, req.body),
      );
      return json(res, 200, { status: 'success', version, data: result });
    }

    if (path === 'buy-in/reverse' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const purchaseId = Number(req.body?.purchaseId);
      await mutateState(getVersion(req), (state) => {
        reversePurchaseInventory(state, purchaseId);
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    // --- Channels & Customers ---
    if (path === 'channels' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { data } = await readState();
      return json(res, 200, data.channels.filter((c) => c.isActive));
    }

    if (path === 'channels' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const name = String(req.body?.name || '').trim();
      const { result, version } = await mutateState(getVersion(req), (state) => {
        if (state.channels.some((c) => c.name === name)) throw new Error('渠道已存在');
        state.channels.push({ id: nextId(state, 'channel'), name, isActive: true });
        return { ok: true };
      });
      return json(res, 200, { version, ...result });
    }

    if (path === 'channels' && method === 'DELETE') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = Number(req.body?.id);
      await mutateState(getVersion(req), (state) => {
        const ch = state.channels.find((c) => c.id === id);
        if (ch) ch.isActive = false;
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    if (path === 'customers' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { data } = await readState();
      return json(res, 200, data.customers);
    }

    if (path === 'customers' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const name = String(req.body?.name || '').trim();
      await mutateState(getVersion(req), (state) => {
        if (!name) throw new Error('請輸入客戶名稱');
        if (state.customers.some((c) => c.name === name)) throw new Error('客戶已存在');
        state.customers.push({
          id: nextId(state, 'customer'),
          name,
          isActive: true,
          totalReceivablesTwd: 0,
        });
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    if (path === 'customers/delete' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = Number(req.body?.id);
      await mutateState(getVersion(req), (state) => {
        const c = state.customers.find((x) => x.id === id);
        if (c) c.isActive = false;
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    // --- Cash management ---
    if (path === 'cash-management' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { data, version } = await readState();
      const customersWithReceivables = data.customers
        .filter((c) => c.isActive && c.totalReceivablesTwd > 0.001)
        .map((c) => ({ id: c.id, name: c.name, totalReceivablesTwd: c.totalReceivablesTwd }));

      const pendingPayments = data.pendingPayments
        .filter((p) => !p.isSettled)
        .map((p) => {
          const purchase = data.purchaseRecords.find((r) => r.id === p.purchaseRecordId);
          return { ...p, purchaseRecordId: p.purchaseRecordId, purchase };
        });

      return json(res, 200, {
        version,
        totalTwd: getTotalTwd(data),
        totalRmb: getTotalRmb(data),
        totalReceivablesTwd: getTotalReceivables(data),
        customersWithReceivables,
        pendingPayments,
        accountsByHolder: groupAccountsByHolder(data),
        holders: data.holders.filter((h) => h.isActive),
      });
    }

    if (path === 'cash-management/transactions' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { data } = await readState();
      const page = Number(req.query.page) || 1;
      const perPage = Math.min(Number(req.query.per_page) || 20, 50);
      const stream = buildTransactionsStream(data, page, perPage);
      return json(res, 200, { status: 'success', data: stream });
    }

    if (path === 'cash-management/totals' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { data } = await readState();
      return json(res, 200, {
        totalTwd: getTotalTwd(data),
        totalRmb: getTotalRmb(data),
        totalReceivables: getTotalReceivables(data),
      });
    }

    if (path === 'cash-management/account' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const action = String(req.body?.action || '');
      await mutateState(getVersion(req), (state) => {
        updateCashAccount(state, user, action, req.body);
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    if (path === 'settlement' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      await mutateState(getVersion(req), (state) => {
        settleCustomer(state, user, req.body);
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    if (path === 'settle-pending-payment' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      await mutateState(getVersion(req), (state) => {
        settlePendingPayment(state, user, req.body);
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    // --- FIFO ---
    if (path === 'fifo-inventory' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { data, version } = await readState();
      return json(res, 200, {
        version,
        inventoryData: getInventoryData(data),
        salesWithProfit: getSalesWithProfit(data),
        totalInventoryRmb: data.fifoInventory.reduce((s, b) => s + b.remainingRmb, 0),
      });
    }

    // --- Independent balance ---
    if (path === 'independent-balance' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const { data, version } = await readState();
      const rmbAccounts = data.cashAccounts
        .filter((a) => a.isActive && a.currency === 'RMB')
        .map((a) => ({
          ...a,
          holder: data.holders.find((h) => h.id === a.holderId),
        }));
      const totalRmb = rmbAccounts.reduce((s, a) => s + a.balance, 0);
      const logs = [...data.independentBalanceLogs]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50);
      return json(res, 200, {
        version,
        rmbAccounts,
        rmbBalance: totalRmb,
        feeProfitTotal: data.meta.feeProfitTotal,
        logs,
      });
    }

    if (path === 'independent-balance/deposit' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      await mutateState(getVersion(req), (state) => {
        independentDeposit(state, user, req.body);
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    if (path === 'independent-balance/expense' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      const amount = Number(req.body?.amount);
      await mutateState(getVersion(req), (state) => {
        const acc = state.cashAccounts.find(
          (a) => a.id === Number(req.body?.accountId) && a.currency === 'RMB',
        );
        if (!acc) throw new Error('請選擇帳戶');
        if (acc.balance < amount - 0.001) throw new Error('餘額不足');
        acc.balance -= amount;
        state.independentBalanceLogs.push({
          id: nextId(state, 'independentBalanceLog'),
          type: 'expense',
          rmbAmount: amount,
          feeAmount: 0,
          netRmb: -amount,
          accountId: acc.id,
          operatorId: user.id,
          createdAt: new Date().toISOString(),
          note: String(req.body?.note || ''),
        });
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    // --- Users (admin) ---
    if (path === 'users' && method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!requireAdmin(user, res)) return;
      const { data } = await readState();
      return json(res, 200, data.users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        isActive: u.isActive,
      })));
    }

    if (path === 'users' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!requireAdmin(user, res)) return;
      const { username, password, role } = req.body || {};
      await mutateState(getVersion(req), (state) => {
        if (state.users.some((u) => u.username === username)) {
          throw new Error('用戶名已存在');
        }
        state.users.push({
          id: nextId(state, 'user'),
          username,
          passwordHash: bcrypt.hashSync(password, 10),
          role: role === 'admin' ? 'admin' : 'operator',
          isActive: true,
        });
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    if (path === 'users/delete' && method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (!requireAdmin(user, res)) return;
      const userId = Number(req.body?.userId);
      await mutateState(getVersion(req), (state) => {
        const u = state.users.find((x) => x.id === userId);
        if (u) u.isActive = false;
        return { ok: true };
      });
      return json(res, 200, { status: 'success' });
    }

    return json(res, 404, { error: `找不到路由: ${path}` });
  } catch (e) {
    if (e instanceof ConflictError) {
      return json(res, 409, { error: e.message, code: 'VERSION_CONFLICT' });
    }
    const message = e instanceof Error ? e.message : '伺服器錯誤';
    console.error(e);
    return json(res, 400, { error: message });
  }
}
