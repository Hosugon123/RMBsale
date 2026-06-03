import type {
  AppState,
  FIFOInventory,
  FIFOSalesAllocation,
  PurchaseRecord,
  SalesRecord,
} from './types.js';
import { nextId } from './store.js';

export interface AllocationResult {
  allocations: FIFOSalesAllocation[];
  totalCost: number;
  totalRmb: number;
  profitTwd: number;
}

export function createInventoryFromPurchase(
  state: AppState,
  purchase: PurchaseRecord,
): FIFOInventory {
  const inv: FIFOInventory = {
    id: nextId(state, 'fifoInventory'),
    purchaseRecordId: purchase.id,
    rmbAmount: purchase.rmbAmount,
    remainingRmb: purchase.rmbAmount,
    unitCostTwd: purchase.twdCost / purchase.rmbAmount,
    exchangeRate: purchase.exchangeRate,
    purchaseDate: purchase.purchaseDate,
    lastUpdated: new Date().toISOString(),
  };
  state.fifoInventory.push(inv);
  return inv;
}

export function allocateInventoryForSale(
  state: AppState,
  sale: SalesRecord,
): AllocationResult {
  let remaining = sale.rmbAmount;
  const batches = [...state.fifoInventory]
    .filter((b) => b.remainingRmb > 0)
    .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());

  const allocations: FIFOSalesAllocation[] = [];
  let totalCost = 0;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.remainingRmb);
    const cost = take * batch.unitCostTwd;
    batch.remainingRmb -= take;
    batch.lastUpdated = new Date().toISOString();
    remaining -= take;
    totalCost += cost;

    const alloc: FIFOSalesAllocation = {
      id: nextId(state, 'fifoSalesAllocation'),
      fifoInventoryId: batch.id,
      salesRecordId: sale.id,
      allocatedRmb: take,
      allocatedCostTwd: cost,
      allocationDate: new Date().toISOString(),
    };
    state.fifoSalesAllocations.push(alloc);
    allocations.push(alloc);
  }

  if (remaining > 0.001) {
    throw new Error(`庫存不足，尚缺 ¥${remaining.toFixed(2)}`);
  }

  const account = state.cashAccounts.find((a) => a.id === sale.rmbAccountId);
  if (!account || account.currency !== 'RMB') {
    throw new Error('無效的 RMB 出貨帳戶');
  }
  if (account.balance < sale.rmbAmount - 0.001) {
    throw new Error(`帳戶餘額不足，目前庫存 ¥${account.balance.toFixed(2)}`);
  }
  account.balance -= sale.rmbAmount;

  const profitTwd = sale.twdAmount - totalCost;
  return {
    allocations,
    totalCost,
    totalRmb: sale.rmbAmount,
    profitTwd,
  };
}

export function reverseSaleAllocation(state: AppState, saleId: number): void {
  const sale = state.salesRecords.find((s) => s.id === saleId);
  if (!sale) throw new Error('找不到銷售記錄');

  const allocs = state.fifoSalesAllocations.filter((a) => a.salesRecordId === saleId);
  for (const alloc of allocs) {
    const batch = state.fifoInventory.find((b) => b.id === alloc.fifoInventoryId);
    if (batch) {
      batch.remainingRmb += alloc.allocatedRmb;
      batch.lastUpdated = new Date().toISOString();
    }
  }
  state.fifoSalesAllocations = state.fifoSalesAllocations.filter(
    (a) => a.salesRecordId !== saleId,
  );

  // 修復：恢復到銷售時扣款的 rmb_account，而非 FIFO 批次來源帳戶
  const account = state.cashAccounts.find((a) => a.id === sale.rmbAccountId);
  if (account) account.balance += sale.rmbAmount;

  const customer = state.customers.find((c) => c.id === sale.customerId);
  if (customer) {
    customer.totalReceivablesTwd = Math.max(0, customer.totalReceivablesTwd - sale.twdAmount);
  }

  state.salesRecords = state.salesRecords.filter((s) => s.id !== saleId);
}

export function reversePurchaseInventory(state: AppState, purchaseId: number): void {
  const purchase = state.purchaseRecords.find((p) => p.id === purchaseId);
  if (!purchase) throw new Error('找不到買入記錄');

  const batches = state.fifoInventory.filter((b) => b.purchaseRecordId === purchaseId);
  for (const batch of batches) {
    const sold = batch.rmbAmount - batch.remainingRmb;
    if (sold > 0.001) {
      throw new Error('此批次已有售出分配，無法取消');
    }
  }

  if (purchase.paymentStatus === 'paid' && purchase.paymentAccountId) {
    const pay = state.cashAccounts.find((a) => a.id === purchase.paymentAccountId);
    if (pay) pay.balance += purchase.twdCost;
  }

  if (purchase.depositAccountId) {
    const dep = state.cashAccounts.find((a) => a.id === purchase.depositAccountId);
    if (dep) dep.balance -= purchase.rmbAmount;
  }

  state.fifoInventory = state.fifoInventory.filter(
    (b) => b.purchaseRecordId !== purchaseId,
  );
  state.pendingPayments = state.pendingPayments.filter(
    (p) => p.purchaseRecordId !== purchaseId,
  );
  state.purchaseRecords = state.purchaseRecords.filter((p) => p.id !== purchaseId);
}

export function reduceRmbInventoryFifo(state: AppState, amount: number): number {
  let remaining = amount;
  const batches = [...state.fifoInventory]
    .filter((b) => b.remainingRmb > 0)
    .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.remainingRmb);
    batch.remainingRmb -= take;
    batch.lastUpdated = new Date().toISOString();
    remaining -= take;
  }
  return remaining;
}
