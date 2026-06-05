import { eq } from "drizzle-orm";
import type { DbTx } from "./db.js";
import { channels } from "./schema.js";

export const DEPOSIT_CHANNEL = "入金";

export function isDepositChannelName(name: string | null | undefined) {
  return name === DEPOSIT_CHANNEL;
}

export async function getPurchaseChannelName(tx: DbTx, channelId: number | null | undefined) {
  if (!channelId) return null;
  const [channel] = await tx.select({ name: channels.name }).from(channels).where(eq(channels.id, channelId));
  return channel?.name ?? null;
}

export async function assertPurchasePayable(
  tx: DbTx,
  purchase: { channelId: number | null | undefined; paymentStatus: string }
) {
  const channelName = await getPurchaseChannelName(tx, purchase.channelId);
  if (isDepositChannelName(channelName)) {
    throw new Error("人民幣入金不屬於買入付款，無需登記待付款或已付款");
  }
}
