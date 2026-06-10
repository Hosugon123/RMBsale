import { isMutationInFlight, onMutationIdle } from "./runMutation";

const CLIENT_BUILD_ID = import.meta.env.VITE_BUILD_ID;

export type PwaUpdateStatus = "hidden" | "pending" | "waiting_mutation" | "updating";

type StatusListener = (status: PwaUpdateStatus) => void;

let statusListener: StatusListener | null = null;
let pendingApply: (() => void) | null = null;
let applying = false;

function setStatus(status: PwaUpdateStatus) {
  statusListener?.(status);
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
  pendingApply = null;

  window.setTimeout(() => {
    if (isMutationInFlight()) {
      applying = false;
      pendingApply = apply;
      setStatus("waiting_mutation");
      return;
    }
    apply();
  }, 600);
}

function queueUpdate(apply: () => void) {
  pendingApply = apply;
  setStatus(isMutationInFlight() ? "waiting_mutation" : "pending");
  tryApplyPending();
}

async function checkServerBuildId() {
  try {
    const res = await fetch("/api/app-meta", { cache: "no-store", credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { buildId?: string };
    if (data.buildId && data.buildId !== CLIENT_BUILD_ID) {
      queueUpdate(() => {
        window.location.reload();
      });
    }
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
      if (pendingApply) tryApplyPending();
    })
  );

  if (import.meta.env.PROD) {
    void import("virtual:pwa-register").then(({ registerSW }) => {
      const updateSW = registerSW({
        immediate: true,
        onOfflineReady() {
          // 僅靜態資源快取就緒，不觸發換版
        },
        onNeedRefresh() {
          queueUpdate(() => {
            void updateSW(true);
          });
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
  };
}
