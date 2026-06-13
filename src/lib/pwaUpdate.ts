import { isMutationInFlight, onMutationIdle } from "./runMutation";

const CLIENT_BUILD_ID = import.meta.env.VITE_BUILD_ID;
const RELOAD_TS_KEY = "rmbsale-last-reload-ts";
const BLOCKED_BUILD_KEY = "rmbsale-blocked-reload-build";
const SAFE_RELOAD_RETRY_MS = 1500;

export type PwaUpdateStatus = "hidden" | "updating";

type StatusListener = (status: PwaUpdateStatus) => void;

let statusListener: StatusListener | null = null;
let pendingApply: (() => void) | null = null;
let applying = false;
let notifiedBuildId: string | null = null;
let activateSwUpdate: (() => Promise<void>) | null = null;
let reloadScheduled = false;
let autoApplyTimer: number | null = null;

function setStatus(status: PwaUpdateStatus) {
  statusListener?.(status);
}

function clearReloadGuards() {
  sessionStorage.removeItem(RELOAD_TS_KEY);
  sessionStorage.removeItem(BLOCKED_BUILD_KEY);
  notifiedBuildId = null;
}

function reloadPage() {
  if (reloadScheduled) return;
  reloadScheduled = true;
  sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
  window.location.reload();
}

function clearAutoApplyTimer() {
  if (autoApplyTimer == null) return;
  window.clearTimeout(autoApplyTimer);
  autoApplyTimer = null;
}

function isEditableActive() {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return false;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}

function scheduleAutoApply(delayMs = 0) {
  if (!pendingApply || applying || reloadScheduled) return;
  clearAutoApplyTimer();
  autoApplyTimer = window.setTimeout(() => {
    autoApplyTimer = null;
    tryApplyPending();
  }, delayMs);
}

function waitForSwControl(timeoutMs = 2500) {
  if (!("serviceWorker" in navigator)) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (changed: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(changed);
    };

    const timer = window.setTimeout(() => finish(false), timeoutMs);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => finish(true),
      { once: true }
    );
  });
}

/** 先啟用新 SW，再整頁重載；僅 reload 會被舊 SW 快取卡住。 */
async function performAppUpdate() {
  clearReloadGuards();

  try {
    if (activateSwUpdate) {
      await activateSwUpdate();
      await waitForSwControl();
    }
  } catch {
    // SW 更新失敗時仍嘗試重載
  }

  reloadPage();
}

function tryApplyPending() {
  const apply = pendingApply;
  if (!apply || applying) return;

  if (isMutationInFlight()) {
    setStatus("hidden");
    scheduleAutoApply(SAFE_RELOAD_RETRY_MS);
    return;
  }

  if (document.visibilityState === "visible" && isEditableActive()) {
    setStatus("hidden");
    scheduleAutoApply(SAFE_RELOAD_RETRY_MS);
    return;
  }

  applying = true;
  setStatus("updating");

  window.setTimeout(() => {
    if (isMutationInFlight()) {
      applying = false;
      setStatus("hidden");
      scheduleAutoApply(SAFE_RELOAD_RETRY_MS);
      return;
    }
    if (document.visibilityState === "visible" && isEditableActive()) {
      applying = false;
      setStatus("hidden");
      scheduleAutoApply(SAFE_RELOAD_RETRY_MS);
      return;
    }
    pendingApply = null;
    void Promise.resolve(apply()).finally(() => {
      window.setTimeout(() => {
        applying = false;
        if (pendingApply) scheduleAutoApply(SAFE_RELOAD_RETRY_MS);
      }, 2000);
    });
  }, 300);
}

function notifyUpdateAvailable(buildId?: string) {
  if (buildId && notifiedBuildId === buildId) return;
  if (buildId) notifiedBuildId = buildId;
  pendingApply = () => performAppUpdate();
  setStatus("hidden");
  scheduleAutoApply();
}

async function checkServerBuildId() {
  if (!CLIENT_BUILD_ID) return;

  try {
    const res = await fetch("/api/app-meta", { cache: "no-store", credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { buildId?: string };
    const serverBuildId = data.buildId?.trim();
    if (!serverBuildId) return;

    if (serverBuildId === CLIENT_BUILD_ID) {
      clearReloadGuards();
      if (!pendingApply) setStatus("hidden");
      return;
    }

    notifyUpdateAvailable(serverBuildId);
  } catch {
    // 離線或暫時性錯誤時略過
  }
}

export function setupPwaUpdate(listener: StatusListener) {
  statusListener = listener;
  const cleanups: Array<() => void> = [];

  cleanups.push(
    onMutationIdle(() => {
      if (pendingApply && !applying) {
        scheduleAutoApply();
      }
    })
  );

  if (import.meta.env.PROD) {
    void import("virtual:pwa-register").then(({ registerSW }) => {
      const updateSW = registerSW({
        immediate: true,
        onOfflineReady() {
          // 僅靜態資源快取就緒
        },
        onNeedRefresh() {
          notifyUpdateAvailable("service-worker");
        },
        onNeedReload() {
          notifyUpdateAvailable("service-worker-reload");
        }
      });

      activateSwUpdate = async () => {
        await updateSW(true);
      };
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkServerBuildId();
      if (pendingApply && !applying) scheduleAutoApply();
    };
    document.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));

    const onSafeInteractionBoundary = () => {
      if (pendingApply && !applying) scheduleAutoApply(SAFE_RELOAD_RETRY_MS);
    };
    window.addEventListener("focusout", onSafeInteractionBoundary);
    window.addEventListener("pagehide", onSafeInteractionBoundary);
    cleanups.push(() => {
      window.removeEventListener("focusout", onSafeInteractionBoundary);
      window.removeEventListener("pagehide", onSafeInteractionBoundary);
    });

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkServerBuildId();
    }, 30 * 60 * 1000);
    cleanups.push(() => window.clearInterval(interval));

    void checkServerBuildId();
  }

  return () => {
    cleanups.forEach((fn) => fn());
    statusListener = null;
    pendingApply = null;
    applying = false;
    notifiedBuildId = null;
    activateSwUpdate = null;
    reloadScheduled = false;
    clearAutoApplyTimer();
  };
}
