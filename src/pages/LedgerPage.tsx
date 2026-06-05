import * as React from "react";
import { Download } from "lucide-react";
import { LEDGER_PAGE_SIZE, PaginatedLedgerTable } from "../components/PaginatedLedgerTable";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { VoidOperationDialog } from "../components/VoidOperationDialog";
import { useAppStore } from "../features/AppStore";
import { useLedgerVoid } from "../hooks/useLedgerVoid";
import { profit as profitStyle, rmb, twd } from "../lib/currencyStyles";
import {
  sortedCashLedgerWithBalances,
  sortedLedgerWithBalances,
  sortedProfitLedgerWithBalances
} from "../lib/localStore";
import { cn, fmtMoney } from "../lib/utils";

export function LedgerPage() {
  const { state, summary } = useAppStore();
  const { resolveVoidTarget, requestVoid, pending, error, cancelVoid, confirmVoid } = useLedgerVoid();
  const voidProps = {
    resolveVoidTarget,
    onVoid: requestVoid
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

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <Card className="min-w-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>流水總覽</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">台幣、人民幣與利潤流水完整彙整</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" />CSV</Button>
        </CardHeader>
        <CardContent className="min-w-0 overflow-x-auto">
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
          <CardContent className="min-w-0 overflow-x-auto">
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
          <CardContent className="min-w-0 overflow-x-auto">
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
        <CardHeader>
          <CardTitle>利潤流水</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">售出利潤入庫與分潤出金紀錄</p>
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
          </div>
        </CardHeader>
        <CardContent className="min-w-0 overflow-x-auto">
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
    </div>
  );
}
