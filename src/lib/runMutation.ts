import { useSyncExternalStore } from "react";

let mutating = false;
const listeners = new Set<() => void>();
const idleListeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return mutating;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function emitIdle() {
  idleListeners.forEach((listener) => listener());
}

export function isMutationInFlight() {
  return mutating;
}

export function onMutationIdle(listener: () => void) {
  idleListeners.add(listener);
  return () => idleListeners.delete(listener);
}

export function useIsMutating() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export class MutationBusyError extends Error {
  constructor() {
    super("上一筆操作處理中，請稍候");
    this.name = "MutationBusyError";
  }
}

/** 支援本機同步與線上 async 的 store 變更；同時間僅允許一筆，避免重複提交 */
export async function runMutation<T>(action: () => T | Promise<T>): Promise<T> {
  if (mutating) throw new MutationBusyError();
  mutating = true;
  emit();
  try {
    return await action();
  } finally {
    mutating = false;
    emit();
    emitIdle();
  }
}
