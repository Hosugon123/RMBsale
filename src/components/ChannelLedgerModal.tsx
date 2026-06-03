import { X } from "lucide-react";
import * as React from "react";
import { PaginatedLedgerTable } from "./PaginatedLedgerTable";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TBody, TD, TH, THead, TR } from "./ui/table";
import { useAppStore } from "../features/AppStore";
import { purchasePayableTwd, sortedLedgerWithBalances } from "../lib/localStore";
import { rmb, twd } from "../lib/currencyStyles";
import { cn, fmtMoney, fmtRate } from "../lib/utils";
import type { Purchase } from "../lib/types";

type ChannelLedgerModalProps = {
  channelId: number | null;
  onClose: () => void;
};

function purchasePaymentStatusLabel(status: Purchase["paymentStatus"]) {
  if (status === "paid") return "已付款";
  if (status === "partial") return "部分付款";
  return "待付款";
}

export function ChannelLedgerModal({ channelId, onClose }: ChannelLedgerModalProps) {
  const { state } = useAppStore();
  const selectedChannel = state.channels.find((channel) => channel.id === channelId);
  const ledgerRows = React.useMemo(() => sortedLedgerWithBalances(state), [state]);

  const channelPurchases = React.useMemo(
    () => state.purchases.filter((purchase) => purchase.channelId === channelId),
    [channelId, state.purchases]
  );

  const channelLedgerRows = React.useMemo(() => {
    const purchaseIds = new Set(channelPurchases.map((purchase) => purchase.id));
    return ledgerRows.filter(
      (entry) =>
        entry.relatedId !== undefined &&
        purchaseIds.has(entry.relatedId) &&
        (entry.relatedTable === "purchases" ||
          entry.relatedTable === "買入" ||
          entry.relatedTable === "買入付款" ||
          entry.relatedTable === "應付付款" ||
          entry.entryType === "應付" ||
          entry.entryType === "應付付款")
    );
  }, [channelPurchases, ledgerRows]);

  const channelSummary = React.useMemo(
    () => ({
      rmb: channelPurchases.reduce((sum, purchase) => sum + Number(purchase.rmbAmount), 0),
      twdCost: channelPurchases.reduce((sum, purchase) => sum + Number(purchase.twdCost), 0),
      paidTwd: channelPurchases.reduce((sum, purchase) => sum + Number(purchase.paidTwd), 0),
      payableTwd: channelPurchases.reduce((sum, purchase) => sum + Number(purchasePayableTwd(purchase)), 0)
    }),
    [channelPurchases]
  );

  if (!selectedChannel) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4"
      onClick={onClose}
    >
      <Card className="max-h-[88vh] w-full max-w-5xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-start justify-between gap-4 border-b p-3 sm:p-4">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg">{selectedChannel.name} 個人帳務流水</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">彙整此廠商／渠道的買入與付款紀錄</p>
          </div>
          <Button aria-label="關閉" onClick={onClose} size="icon" variant="ghost">
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="max-h-[calc(88vh-5rem)] space-y-5 overflow-y-auto p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">目前待付</p>
              <p className={cn("mt-1 text-base font-semibold sm:text-lg", twd.money)}>
                {fmtMoney(channelSummary.payableTwd)}
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">買入 RMB 合計</p>
              <p className={cn("mt-1 text-base sm:text-lg", rmb.money)}>{fmtMoney(channelSummary.rmb, "RMB")}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">應付 TWD 合計</p>
              <p className={cn("mt-1 text-base font-semibold sm:text-lg", twd.money)}>{fmtMoney(channelSummary.twdCost)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">已付 TWD 合計</p>
              <p className={cn("mt-1 text-base sm:text-lg", twd.money)}>{fmtMoney(channelSummary.paidTwd)}</p>
            </div>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">買入紀錄</h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <THead>
                  <TR>
                    <TH>日期</TH>
                    <TH className="text-right">RMB</TH>
                    <TH className="hidden text-right sm:table-cell">匯率</TH>
                    <TH className="text-right">應付</TH>
                    <TH className="hidden text-right md:table-cell">待付</TH>
                    <TH>狀態</TH>
                  </TR>
                </THead>
                <TBody>
                  {channelPurchases.length > 0 ? (
                    channelPurchases.map((purchase) => (
                      <TR key={purchase.id}>
                        <TD className="text-muted-foreground">
                          {new Date(purchase.createdAt).toLocaleDateString("zh-TW")}
                        </TD>
                        <TD className={rmb.moneyCell}>{fmtMoney(purchase.rmbAmount, "RMB")}</TD>
                        <TD className="hidden text-right sm:table-cell">{fmtRate(purchase.exchangeRate)}</TD>
                        <TD className={twd.moneyCell}>{fmtMoney(purchase.twdCost)}</TD>
                        <TD className={cn("hidden text-right md:table-cell", twd.moneyCell)}>
                          {fmtMoney(purchasePayableTwd(purchase))}
                        </TD>
                        <TD>
                          <Badge tone={purchase.paymentStatus === "paid" ? "rmb" : "danger"}>
                            {purchasePaymentStatusLabel(purchase.paymentStatus)}
                          </Badge>
                        </TD>
                      </TR>
                    ))
                  ) : (
                    <TR>
                      <TD className="py-6 text-center text-muted-foreground" colSpan={6}>
                        尚無買入紀錄
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">帳務流水</h3>
            <div className="overflow-x-auto rounded-md border">
              <PaginatedLedgerTable entries={channelLedgerRows} emptyMessage="尚無帳務流水" />
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
