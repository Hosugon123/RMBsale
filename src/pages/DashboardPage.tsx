import { AlertTriangle, Banknote, HandCoins, ReceiptText, X } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { CustomerLedgerModal } from "../components/CustomerLedgerModal";
import { PaginatedLedgerTable } from "../components/PaginatedLedgerTable";
import { MetricCard } from "../components/MetricCard";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/table";
import { useAppStore } from "../features/AppStore";
import { profit, receivable, rmb, twd } from "../lib/currencyStyles";
import {
  sortedLedgerWithBalances,
  sortedProfitLedgerWithBalances,
  sortedReceivableLedgerWithBalances
} from "../lib/localStore";
import { XLSX_IMPORT_NOTICE_KEY } from "../lib/xlsxAutoImport";
import { cn, fmtMoney, fmtRate } from "../lib/utils";

export function DashboardPage() {
  const { state, summary } = useAppStore();
  const navigate = useNavigate();
  const [importNotice, setImportNotice] = React.useState(() => sessionStorage.getItem(XLSX_IMPORT_NOTICE_KEY));
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<number | null>(null);
  const [showProfitLedger, setShowProfitLedger] = React.useState(false);
  const [showTwdLedger, setShowTwdLedger] = React.useState(false);
  const [showRmbLedger, setShowRmbLedger] = React.useState(false);
  const [showReceivableLedger, setShowReceivableLedger] = React.useState(false);

  const ledgerRows = React.useMemo(() => sortedLedgerWithBalances(state), [state]);
  const twdLedgerRows = React.useMemo(() => ledgerRows.filter((entry) => entry.currency === "TWD"), [ledgerRows]);
  const rmbLedgerRows = React.useMemo(() => ledgerRows.filter((entry) => entry.currency === "RMB"), [ledgerRows]);
  const profitLedgerRows = React.useMemo(() => sortedProfitLedgerWithBalances(state), [state]);
  const receivableLedgerRows = React.useMemo(() => sortedReceivableLedgerWithBalances(state), [state]);
  const topReceivableCustomers = React.useMemo(
    () =>
      [...state.customers]
        .filter((customer) => Number(customer.receivableTwd) > 0)
        .sort((a, b) => Number(b.receivableTwd) - Number(a.receivableTwd))
        .slice(0, 5),
    [state.customers]
  );
  const pendingReceivableCount = state.customers.filter((customer) => Number(customer.receivableTwd) > 0).length;
  return (
    <div className="min-w-0 max-w-full space-y-5">
      {importNotice ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
          <p>{importNotice}</p>
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="關閉"
            onClick={() => {
              sessionStorage.removeItem(XLSX_IMPORT_NOTICE_KEY);
              setImportNotice(null);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>帳務總覽</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="總 TWD 餘額"
              value={fmtMoney(summary.twd, "TWD")}
              icon={Banknote}
              tone="twd"
              onClick={() => setShowTwdLedger(true)}
            />
            <MetricCard
              title="總 RMB 餘額"
              value={fmtMoney(summary.rmb, "RMB")}
              icon={HandCoins}
              tone="rmb"
              onClick={() => setShowRmbLedger(true)}
            />
            <MetricCard
              title="客戶應收"
              value={fmtMoney(summary.receivable, "TWD")}
              icon={AlertTriangle}
              tone="receivable"
              onClick={() => setShowReceivableLedger(true)}
            />
            <MetricCard
              title="利潤"
              value={fmtMoney(summary.profit, "TWD")}
              icon={ReceiptText}
              tone="pending"
              onClick={() => setShowProfitLedger(true)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>待收帳款</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topReceivableCustomers.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">目前無待收帳款</p>
          ) : null}
          {topReceivableCustomers.map((customer) => (
            <button
              key={customer.id}
              className="flex w-full items-center justify-between rounded-md border bg-background/40 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setSelectedCustomerId(customer.id)}
              type="button"
            >
              <div>
                <p className="font-medium">{customer.name}</p>
                <p className="text-xs text-muted-foreground">客戶欠款</p>
              </div>
              <p className="font-semibold text-receivable">{fmtMoney(customer.receivableTwd)}</p>
            </button>
          ))}
          {pendingReceivableCount > 5 ? (
            <p className="text-center text-xs text-muted-foreground">
              另有 {pendingReceivableCount - 5} 位客戶待收，請至應收帳款頁查看
            </p>
          ) : null}
          <Button className="w-full" onClick={() => navigate("/receivables")}>
            進入收帳
          </Button>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>流水紀錄</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          <Card className="min-w-0">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>近期現金流水</CardTitle>
              <Link className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium" to="/ledger">
                查看全部
              </Link>
            </CardHeader>
            <CardContent className="min-w-0 overflow-x-auto">
              <PaginatedLedgerTable entries={ledgerRows} className="min-w-0" />
            </CardContent>
          </Card>

          <div className="grid min-w-0 max-w-full gap-4 xl:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>近期買入</CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>渠道</TH>
                      <TH className="text-right">RMB</TH>
                      <TH className="text-right">匯率</TH>
                      <TH className="text-right">成本</TH>
                      <TH>操作人</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {state.purchases.slice(0, 6).map((item) => (
                      <TR key={item.id}>
                        <TD>{item.channelName}</TD>
                        <TD className={rmb.moneyCell}>{fmtMoney(item.rmbAmount, "RMB")}</TD>
                        <TD className="text-right">{fmtRate(item.exchangeRate)}</TD>
                        <TD className={twd.moneyCell}>{fmtMoney(item.twdCost)}</TD>
                        <TD>{item.operatorName}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>近期售出</CardTitle>
              </CardHeader>
              <CardContent className="min-w-0 overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>客戶</TH>
                      <TH className="text-right">RMB</TH>
                      <TH className="text-right">應收</TH>
                      <TH className="text-right">利潤</TH>
                      <TH>操作人</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {state.sales.slice(0, 6).map((item) => (
                      <TR key={item.id}>
                        <TD>{item.customerName}</TD>
                        <TD className={rmb.moneyCell}>{fmtMoney(item.rmbAmount, "RMB")}</TD>
                        <TD className={receivable.moneyCell}>{fmtMoney(item.twdAmount)}</TD>
                        <TD className={profit.moneyCell}>{fmtMoney(item.profitTwd)}</TD>
                        <TD>{item.operatorName}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {showProfitLedger ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowProfitLedger(false)}
        >
          <Card className="max-h-[88vh] w-full max-w-4xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b">
              <div>
                <CardTitle>利潤流水</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">售出利潤入庫與分潤出金紀錄</p>
              </div>
              <Button aria-label="關閉" onClick={() => setShowProfitLedger(false)} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[calc(88vh-5rem)] overflow-x-auto overflow-y-auto p-4">
              <PaginatedLedgerTable entries={profitLedgerRows} emptyMessage="尚無利潤流水" />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {showTwdLedger ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowTwdLedger(false)}
        >
          <Card className="max-h-[88vh] w-full max-w-4xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b">
              <div>
                <CardTitle>台幣流水</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">所有 TWD 帳戶的收入與支出紀錄</p>
              </div>
              <Button aria-label="關閉" onClick={() => setShowTwdLedger(false)} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[calc(88vh-5rem)] overflow-x-auto overflow-y-auto p-4">
              <PaginatedLedgerTable entries={twdLedgerRows} emptyMessage="尚無台幣流水" />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {showRmbLedger ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowRmbLedger(false)}
        >
          <Card className="max-h-[88vh] w-full max-w-4xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b">
              <div>
                <CardTitle>人民幣流水</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">所有 RMB 帳戶的收入與支出紀錄</p>
              </div>
              <Button aria-label="關閉" onClick={() => setShowRmbLedger(false)} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[calc(88vh-5rem)] overflow-x-auto overflow-y-auto p-4">
              <PaginatedLedgerTable entries={rmbLedgerRows} emptyMessage="尚無人民幣流水" />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {showReceivableLedger ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowReceivableLedger(false)}
        >
          <Card className="max-h-[88vh] w-full max-w-4xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b">
              <div>
                <CardTitle>客戶應收流水</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">所有客戶的應收、收帳與結清紀錄</p>
              </div>
              <Button aria-label="關閉" onClick={() => setShowReceivableLedger(false)} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[calc(88vh-5rem)] overflow-x-auto overflow-y-auto p-4">
              <PaginatedLedgerTable entries={receivableLedgerRows} emptyMessage="尚無應收流水" />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <CustomerLedgerModal
        customerId={selectedCustomerId}
        onClose={() => setSelectedCustomerId(null)}
      />
    </div>
  );
}

