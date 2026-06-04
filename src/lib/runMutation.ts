/** 支援本機同步與線上 async 的 store 變更 */
export async function runMutation(action: () => void | Promise<void>) {
  await action();
}
