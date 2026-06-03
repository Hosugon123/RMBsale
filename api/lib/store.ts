import { kv } from '@vercel/kv';
import bcrypt from 'bcryptjs';
import type { AppState, StateEnvelope } from './types.js';

const STATE_KEY = 'rmb:state';

const ENTITY_KEYS = [
  'user', 'holder', 'customer', 'cashAccount', 'channel',
  'purchaseRecord', 'pendingPayment', 'fifoInventory', 'fifoSalesAllocation',
  'salesRecord', 'transaction', 'ledgerEntry', 'cashLog',
  'deleteAuditLog', 'profitTransaction', 'independentBalanceLog',
] as const;

const useMemoryStore =
  !process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL;

let memoryState: StateEnvelope | null = null;

function createInitialState(): AppState {
  const nextId: Record<string, number> = {};
  for (const k of ENTITY_KEYS) nextId[k] = 1;

  const adminHash = bcrypt.hashSync('admin123', 10);
  return {
    users: [{
      id: 1,
      username: 'admin',
      passwordHash: adminHash,
      role: 'admin',
      isActive: true,
    }],
    holders: [],
    customers: [],
    cashAccounts: [],
    channels: [],
    purchaseRecords: [],
    pendingPayments: [],
    fifoInventory: [],
    fifoSalesAllocations: [],
    salesRecords: [],
    transactions: [],
    ledgerEntries: [],
    cashLogs: [],
    deleteAuditLogs: [],
    profitTransactions: [],
    independentBalanceLogs: [],
    meta: { nextId, feeProfitTotal: 0 },
  };
}

async function kvGet(): Promise<StateEnvelope | null> {
  if (useMemoryStore) return memoryState;
  return kv.get<StateEnvelope>(STATE_KEY);
}

async function kvSet(value: StateEnvelope): Promise<void> {
  if (useMemoryStore) {
    memoryState = value;
    return;
  }
  await kv.set(STATE_KEY, value);
}

export class ConflictError extends Error {
  constructor(message = '資料已被其他人更新，請重新整理後再試') {
    super(message);
    this.name = 'ConflictError';
  }
}

export async function loadEnvelope(): Promise<StateEnvelope> {
  const stored = await kvGet();
  if (!stored) {
    const initial: StateEnvelope = {
      version: 1,
      updatedAt: Date.now(),
      data: createInitialState(),
    };
    await kvSet(initial);
    if (useMemoryStore) {
      console.log('[dev] 使用記憶體資料庫（未設定 KV）。登入：admin / admin123');
    }
    return initial;
  }
  return stored;
}

export function nextId(state: AppState, entity: string): number {
  const id = state.meta.nextId[entity] ?? 1;
  state.meta.nextId[entity] = id + 1;
  return id;
}

export async function mutateState<T>(
  expectedVersion: number | undefined,
  mutator: (state: AppState) => T,
  maxRetries = 5,
): Promise<{ result: T; version: number; updatedAt: number }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const envelope = await loadEnvelope();

    if (
      expectedVersion !== undefined &&
      envelope.version !== expectedVersion
    ) {
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }
      throw new ConflictError();
    }

    const draft = structuredClone(envelope.data);
    const result = mutator(draft);
    const newEnvelope: StateEnvelope = {
      version: envelope.version + 1,
      updatedAt: Date.now(),
      data: draft,
    };

    const current = await kvGet();
    if (!current || current.version !== envelope.version) {
      if (attempt < maxRetries - 1) continue;
      throw new ConflictError();
    }

    await kvSet(newEnvelope);
    return { result, version: newEnvelope.version, updatedAt: newEnvelope.updatedAt };
  }
  throw new ConflictError();
}

export async function readState(): Promise<StateEnvelope> {
  return loadEnvelope();
}
