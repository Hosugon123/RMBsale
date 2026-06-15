import * as React from "react";
import { Download, Plus, X } from "lucide-react";
import { LEDGER_PAGE_SIZE, PaginatedLedgerTable } from "../components/PaginatedLedgerTable";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { VoidOperationDialog } from "../components/VoidOperationDialog";
import { useAppStore } from "../features/AppStore";
import { useLedgerVoid } from "../hooks/useLedgerVoid";
import { runMutation, useIsMutating } from "../lib/runMutation";
import { profit as profitStyle, rmb, twd } from "../lib/currencyStyles";
import { fieldControlClass } from "../lib/formStyles";
import {
  sortedCashLedgerWithBalances,
  sortedLedgerWithBalances,
  sortedProfitLedgerWithBalances
} from "../lib/localStore";
import { cn, fmtMoney, parseMoneyInput } from "../lib/utils";

export function LedgerPage() {
  const { state, summary, createOpeningProfit } = useAppStore();
  const isMutating = useIsMutating();
  const { resolveVoidTarget, requestVoid, pending, error, cancelVoid, confirmVoid } = useLedgerVoid();
  const [openingProfitOpen, setOpeningProfitOpen] = React.useState(false);
  const [openingProfitForm, setOpeningProfitForm] = React.useState({ amountTwd: "", note: "" });
  const [openingProfitError, setOpeningProfitError] = React.useState("");
  const openingProfitAmount = parseMoneyInput(openingProfitForm.amountTwd);
  const voidProps = {
    resolveVoidTarget,
    onVoid: requestVoid,
    showBalances: true
  };
  const overviewRows = React.useMemo(() => sortedLedgerWithBalances(state), [state]);
  const cashLedgerRows = React.useMemo(() => sortedCashLedgerWithBalances(state), [state]);
  const twdLedgerRows = React.useMemo(() => cashLedgerRows.filter((entry) => entry.currency === "TWD"), [cashLedgerRows]);
  const rmbLedgerRows = React.useMemo(() => cashLedgerRows.filter((entry) => entry.currency === "RMB"), [cashLedgerRows]);
  const profitLedgerRows = React.useMemo(() => sortedProfitLedgerWithBalances(state), [state]);
  const exportCsv = () => {
    const rows = overviewRows.map((row) => [
      row.id,
      row.createdAt,
      row.subjectLabel ?? "",
      row.entryType,
      row.currency,
      row.direction,
      row.direction === "out" ? `-${row.amount}` : row.amount,
      row.balanceBefore ?? "",
      row.balanceAfter ?? "",
      row.description,
      row.operatorName
    ].join(","));
    const blob = new Blob([["id,createdAt,subject,type,currency,direction,amount,balanceBefore,balanceAfter,description,operator", ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rmbsale-ledger.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const openOpeningProfitModal = () => {
    setOpeningProfitForm({ amountTwd: "", note: "" });
    setOpeningProfitError("");
    setOpeningProfitOpen(true);
  };

  const submitOpeningProfit = async () => {
    try {
      if (!openingProfitForm.amountTwd.trim()) throw new Error("請輸入利潤金額");
      const amount = parseMoneyInput(openingProfitForm.amountTwd);
      if (!amount || amount.lte(0)) throw new Error("利潤金額必須大於 0");
      await runMutation(() => createOpeningProfit({ ...openingProfitForm, amountTwd: amount.toFixed(2) }));
      setOpeningProfitOpen(false);
      setOpeningProfitForm({ amountTwd: "", note: "" });
      setOpeningProfitError("");
    } catch (err) {
      setOpeningProfitError(err instanceof Error ? err.message : "新增期初利潤失敗");
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <Card className="min-w-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 p-3 pb-2 sm:p-6 sm:pb-0">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg">流水總覽</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1 sm:text-sm">台幣、人民幣與利潤流水完整彙整</p>
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={exportCsv}><Download className="h-4 w-4" />CSV</Button>
        </CardHeader>
        <CardContent className="min-w-0 space-y-3 p-3 pt-0 sm:space-y-4 sm:p-6 sm:pt-0">
          <PaginatedLedgerTable entries={overviewRows} pageSize={LEDGER_PAGE_SIZE} className="min-w-0" {...voidProps} />
        </CardContent>
      </Card>

      <div className="grid min-w-0 max-w-full gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>台幣流水</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">台幣帳戶、應收、應付與收付款紀錄</p>
            <p className={cn("mt-2 text-lg font-semibold tabular-nums", twd.money)}>
              總餘額 {fmtMoney(summary.twd, "TWD")}
            </p>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3 p-3 pt-0 sm:space-y-4 sm:p-6 sm:pt-0">
            <PaginatedLedgerTable
              entries={twdLedgerRows}
              pageSize={LEDGER_PAGE_SIZE}
              emptyMessage="尚無台幣流水"
              className="min-w-0"
              {...voidProps}
            />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>人民幣流水</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">人民幣帳戶與買入、售出紀錄</p>
            <p className={cn("mt-2 text-lg font-semibold tabular-nums", rmb.money)}>
              總餘額 {fmtMoney(summary.rmb, "RMB")}
            </p>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3 p-3 pt-0 sm:space-y-4 sm:p-6 sm:pt-0">
            <PaginatedLedgerTable
              entries={rmbLedgerRows}
              pageSize={LEDGER_PAGE_SIZE}
              emptyMessage="尚無人民幣流水"
              className="min-w-0"
              {...voidProps}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>利潤流水</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">售出利潤入庫、期初利潤、儲值服務費與分潤出金紀錄</p>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" onClick={openOpeningProfitModal}>
            <Plus className="h-4 w-4" />
            新增期初利潤
          </Button>
          <div className="basis-full">
          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <p className="text-xs text-muted-foreground">未分利潤</p>
              <p className={cn("text-lg font-semibold tabular-nums", profitStyle.text)}>
                {fmtMoney(summary.profit, "TWD")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">歷史利潤</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {fmtMoney(summary.profitEarned, "TWD")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">儲值利潤</p>
              <p className={cn("text-lg font-semibold tabular-nums", rmb.money)}>
                {fmtMoney(summary.walletDepositProfitRmb, "RMB")}
              </p>
            </div>
          </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 space-y-3 p-3 pt-0 sm:space-y-4 sm:p-6 sm:pt-0">
          <PaginatedLedgerTable
            entries={profitLedgerRows}
            pageSize={LEDGER_PAGE_SIZE}
            emptyMessage="尚無利潤流水"
            className="min-w-0"
            {...voidProps}
          />
        </CardContent>
      </Card>

      <VoidOperationDialog
        open={Boolean(pending)}
        description={
          pending
            ? `確定要作廢「${pending.entry.description}」嗎？\n\n系統會以沖銷還原餘額與庫存，原始紀錄仍保留供查帳。`
            : undefined
        }
        error={error}
        onClose={cancelVoid}
        onConfirm={() => void confirmVoid()}
      />

      {openingProfitOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4"
          onClick={isMutating ? undefined : () => setOpeningProfitOpen(false)}
        >
          <Card className="max-h-[90vh] w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b p-3 sm:p-4">
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">新增期初利潤</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">僅建立利潤池，不會異動現金帳戶或售出紀錄。</p>
              </div>
              <Button
                aria-label="關閉"
                disabled={isMutating}
                onClick={() => setOpeningProfitOpen(false)}
                size="icon"
                variant="ghost"
              >
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[calc(90vh-4rem)] space-y-3 overflow-y-auto p-3 sm:p-4">
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>利潤金額</span>
                <Input
                  className={fieldControlClass}
                  inputMode="decimal"
                  value={openingProfitForm.amountTwd}
                  onChange={(event) => {
                    setOpeningProfitForm({ ...openingProfitForm, amountTwd: event.target.value });
                    if (openingProfitError) setOpeningProfitError("");
                  }}
                />
              </label>
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>備註</span>
                <Input
                  className={fieldControlClass}
                  value={openingProfitForm.note}
                  onChange={(event) => setOpeningProfitForm({ ...openingProfitForm, note: event.target.value })}
                  placeholder="例如：試算表期初匯入"
                />
              </label>
              <div className="rounded-md border border-pending/20 bg-pending/10 p-3 text-sm">
                <p className="text-xs text-pending/80">新增後未分利潤會增加</p>
                <p className={cn("mt-1 text-xl font-semibold tabular-nums", profitStyle.text)}>
                  {fmtMoney(openingProfitAmount ?? 0)}
                </p>
              </div>
              {openingProfitError ? <p className="text-sm text-destructive">{openingProfitError}</p> : null}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={isMutating}
                  onClick={() => setOpeningProfitOpen(false)}
                >
                  取消
                </Button>
                <Button type="button" className="flex-1" disabled={isMutating} onClick={() => void submitOpeningProfit()}>
                  {isMutating ? "處理中…" : "建立利潤"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
