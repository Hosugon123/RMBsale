import { isMutationInFlight, onMutationIdle } from "./runMutation";

const CLIENT_BUILD_ID = import.meta.env.VITE_BUILD_ID;
const RELOAD_TS_KEY = "rmbsale-last-reload-ts";
const BLOCKED_BUILD_KEY = "rmbsale-blocked-reload-build";
const RELOAD_COOLDOWN_MS = 10_000;

export type PwaUpdateStatus = "hidden" | "pending" | "waiting_mutation" | "updating";

type StatusListener = (status: PwaUpdateStatus) => void;

let statusListener: StatusListener | null = null;
let pendingApply: (() => void) | null = null;
let applying = false;
let notifiedBuildId: string | null = null;

function setStatus(status: PwaUpdateStatus) {
  statusListener?.(status);
}

function clearReloadGuards() {
  sessionStorage.removeItem(RELOAD_TS_KEY);
  sessionStorage.removeItem(BLOCKED_BUILD_KEY);
  notifiedBuildId = null;
}

function safeReload(serverBuildId?: string) {
  const now = Date.now();
  const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || 0);
  if (now - last < RELOAD_COOLDOWN_MS) {
    if (serverBuildId) sessionStorage.setItem(BLOCKED_BUILD_KEY, serverBuildId);
    setStatus("pending");
    return false;
  }
  sessionStorage.setItem(RELOAD_TS_KEY, String(now));
  window.location.reload();
  return true;
}

function tryApplyPending() {
  const apply = pendingApply;
  if (!apply || applying) return;

  if (isMutationInFlight()) {
    setStatus("waiting_mutation");
    return;
  }

  applying = true;
  setStatus("updating");

  window.setTimeout(() => {
    if (isMutationInFlight()) {
      applying = false;
      setStatus("waiting_mutation");
      return;
    }
    pendingApply = null;
    apply();
    window.setTimeout(() => {
      applying = false;
      if (pendingApply) setStatus("pending");
    }, 2000);
  }, 300);
}

function notifyUpdateAvailable(apply: () => void, buildId?: string) {
  if (buildId && notifiedBuildId === buildId) return;
  if (buildId) notifiedBuildId = buildId;
  pendingApply = apply;
  setStatus(isMutationInFlight() ? "waiting_mutation" : "pending");
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

    const blocked = sessionStorage.getItem(BLOCKED_BUILD_KEY);
    if (blocked === serverBuildId) {
      notifyUpdateAvailable(() => {
        sessionStorage.removeItem(BLOCKED_BUILD_KEY);
        safeReload(serverBuildId);
      }, serverBuildId);
      return;
    }

    notifyUpdateAvailable(() => {
      safeReload(serverBuildId);
    }, serverBuildId);
  } catch {
    // 離線或暫時性錯誤時略過
  }
}

export function applyPendingPwaUpdate() {
  tryApplyPending();
}

export function setupPwaUpdate(listener: StatusListener) {
  statusListener = listener;
  const cleanups: Array<() => void> = [];

  cleanups.push(
    onMutationIdle(() => {
      if (pendingApply && !applying) {
        setStatus("pending");
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
          notifyUpdateAvailable(() => {
            void updateSW(true);
          }, "service-worker");
        }
      });
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkServerBuildId();
    };
    document.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));

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
  };
}
