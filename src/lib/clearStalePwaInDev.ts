/** dev:online 與 localhost 曾跑過 production build 時，舊 SW 會快取 dist 導致白屏。開發模式啟動時清掉。 */
export async function clearStalePwaInDev() {
  if (!import.meta.env.DEV) return;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // 略過：不阻擋應用啟動
  }
}
