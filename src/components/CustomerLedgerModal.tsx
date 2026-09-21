import { CheckCircle2, Percent, X } from "lucide-react";
import * as React from "react";
import { PaginatedLedgerTable } from "./PaginatedLedgerTable";
import { openSettlementModal } from "./SettlementModalHost";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Table, TBody, TD, TH, THead, TR } from "./ui/table";
import { useAppStore } from "../features/AppStore";
import { describeReceivable, fmtReceivableBalance } from "../lib/receivableDisplay";
import { profit, receivable, rmb, twd } from "../lib/currencyStyles";
import { sortedLedgerWithBalances } from "../lib/localStore";
import { cn, fmtMoney, fmtRate } from "../lib/utils";

type CustomerLedgerModalProps = {
  customerId: number | null;
  onClose: () => void;
};

function settlementLabel(status: string) {
  if (status === "settled") return "已結清";
  if (status === "partial") return "部分收款";
  return "待收款";
}

export function CustomerLedgerModal({ customerId, onClose }: CustomerLedgerModalProps) {
  const { state, createInterestReceivable } = useAppStore();
  const [interestOpen, setInterestOpen] = React.useState(false);
  const [interestAmount, setInterestAmount] = React.useState("");
  const [interestNote, setInterestNote] = React.useState("");
  const [interestError, setInterestError] = React.useState("");
  const [interestSubmitting, setInterestSubmitting] = React.useState(false);
  const selectedCustomer = state.customers.find((customer) => customer.id === customerId);
  const ledgerRows = React.useMemo(() => sortedLedgerWithBalances(state), [state]);

  const customerSales = React.useMemo(
    () => state.sales.filter((sale) => sale.customerId === customerId),
    [customerId, state.sales]
  );

  const customerLedgerRows = React.useMemo(() => {
    const saleIds = new Set(customerSales.map((sale) => sale.id));
    return ledgerRows.filter(
      (entry) =>
        entry.customerId === customerId ||
        (entry.relatedTable === "sales" && entry.relatedId !== undefined && saleIds.has(entry.relatedId))
    );
  }, [customerId, customerSales, ledgerRows]);

  const interestTotal = React.useMemo(
    () =>
      ledgerRows
        .filter((entry) => entry.customerId === customerId && entry.entryType === "利息" && !entry.isReversal)
        .reduce((sum, entry) => sum + Number(entry.amount), 0),
    [customerId, ledgerRows]
  );

  const customerSummary = React.useMemo(
    () => ({
      rmb: customerSales.reduce((sum, sale) => sum + Number(sale.rmbAmount), 0),
      twd: customerSales.reduce((sum, sale) => sum + Number(sale.twdAmount), 0),
      profit: customerSales.reduce((sum, sale) => sum + Number(sale.profitTwd), 0)
    }),
    [customerSales]
  );

  if (!selectedCustomer) return null;

  const submitInterest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCustomer) return;
    setInterestError("");
    setInterestSubmitting(true);
    try {
      await Promise.resolve(
        createInterestReceivable({
          customerId: selectedCustomer.id,
          amountTwd: interestAmount,
          note: interestNote
        })
      );
      setInterestAmount("");
      setInterestNote("");
      setInterestOpen(false);
    } catch (error) {
      setInterestError(error instanceof Error ? error.message : "新增利息失敗");
    } finally {
      setInterestSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4"
      onClick={onClose}
    >
      <Card className="max-h-[88vh] w-full max-w-5xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-start justify-between gap-4 border-b p-3 sm:p-4">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg">{selectedCustomer.name} 個人帳務流水</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">彙整此客戶的售出、應收與收帳紀錄</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
            <div className="hidden rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground sm:block">
              利息 <span className="font-semibold text-foreground">{fmtMoney(interestTotal)}</span>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9"
              onClick={() => {
                const id = selectedCustomer.id;
                onClose();
                queueMicrotask(() => openSettlementModal(id));
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              收帳
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => {
                setInterestError("");
                setInterestOpen((value) => !value);
              }}
            >
              <Percent className="h-4 w-4" />
              利息
            </Button>
            <Button aria-label="關閉" onClick={onClose} size="icon" variant="ghost">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[calc(88vh-5rem)] space-y-5 overflow-y-auto p-3 sm:p-4">
          {interestOpen ? (
            <form onSubmit={submitInterest} className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
              <label className="space-y-1 text-sm font-medium">
                <span>利息金額</span>
                <Input
                  inputMode="decimal"
                  placeholder="例如 360"
                  value={interestAmount}
                  onChange={(event) => setInterestAmount(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                <span>備註</span>
                <Input
                  placeholder="例如 9月利息"
                  value={interestNote}
                  onChange={(event) => setInterestNote(event.target.value)}
                />
              </label>
              <Button type="submit" className="h-10" disabled={interestSubmitting}>
                {interestSubmitting ? "處理中" : "新增利息"}
              </Button>
              {interestError ? (
                <p className="text-sm text-destructive sm:col-span-3">{interestError}</p>
              ) : (
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  利息會直接增加此客戶應收，並在帳務流水以「利息」獨立記錄。
                </p>
              )}
            </form>
          ) : null}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">目前應收</p>
              <p
                className={cn(
                  "mt-1 text-base font-semibold sm:text-lg",
                  describeReceivable(selectedCustomer.receivableTwd).statusTone === "overpaid"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : receivable.text
                )}
              >
                {fmtReceivableBalance(selectedCustomer.receivableTwd)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {describeReceivable(selectedCustomer.receivableTwd).statusLabel}
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">售出 RMB 合計</p>
              <p className={cn("mt-1 text-base sm:text-lg", rmb.money)}>{fmtMoney(customerSummary.rmb, "RMB")}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">應收 TWD 合計</p>
              <p className="mt-1 text-base font-semibold sm:text-lg">{fmtMoney(customerSummary.twd)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">利潤合計</p>
              <p className={cn("mt-1 text-base sm:text-lg", profit.money)}>{fmtMoney(customerSummary.profit)}</p>
            </div>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">售出紀錄</h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <THead>
                  <TR>
                    <TH>日期</TH>
                    <TH className="text-right">RMB</TH>
                    <TH className="hidden text-right sm:table-cell">匯率</TH>
                    <TH className="text-right">應收</TH>
                    <TH className="hidden text-right md:table-cell">成本</TH>
                    <TH className="hidden text-right md:table-cell">利潤</TH>
                    <TH>狀態</TH>
                  </TR>
                </THead>
                <TBody>
                  {customerSales.length > 0 ? (
                    customerSales.map((sale) => (
                      <TR key={sale.id}>
                        <TD className="text-muted-foreground">
                          {new Date(sale.createdAt).toLocaleDateString("zh-TW")}
                        </TD>
                        <TD className={rmb.moneyCell}>{fmtMoney(sale.rmbAmount, "RMB")}</TD>
                        <TD className="hidden text-right sm:table-cell">{fmtRate(sale.exchangeRate)}</TD>
                        <TD className={receivable.moneyCell}>{fmtMoney(sale.twdAmount)}</TD>
                        <TD className={cn("hidden text-right md:table-cell", twd.moneyCell)}>{fmtMoney(sale.costTwd)}</TD>
                        <TD className={cn("hidden text-right md:table-cell", profit.moneyCell)}>
                          {fmtMoney(sale.profitTwd)}
                        </TD>
                        <TD>
                          <Badge tone={sale.settlementStatus === "settled" ? "rmb" : "danger"}>
                            {settlementLabel(sale.settlementStatus)}
                          </Badge>
                        </TD>
                      </TR>
                    ))
                  ) : (
                    <TR>
                      <TD className="py-6 text-center text-muted-foreground" colSpan={7}>
                        尚無售出紀錄
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
              <PaginatedLedgerTable entries={customerLedgerRows} emptyMessage="尚無帳務流水" showBalances />
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
