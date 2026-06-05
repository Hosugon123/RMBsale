import * as React from "react";
import type { LedgerBalanceContext } from "../lib/localStore";
import { ledgerOperationGroupKey } from "../lib/localStore";
import type { ReversalTarget } from "../lib/reversalUi";
import type { LedgerEntry } from "../lib/types";
import { Button } from "./ui/button";
import { profit, rmb, twd } from "../lib/currencyStyles";
import { cn, fmtDirectionalMoney, fmtMoney } from "../lib/utils";
import { Table, TBody, TD, TH, THead, TR } from "./ui/table";

const OPERATION_GROUP_ROW_BG = [
  "bg-amber-500/[0.07]",
  "bg-sky-500/[0.07]",
  "bg-violet-500/[0.07]",
  "bg-emerald-500/[0.07]",
  "bg-rose-500/[0.07]",
  "bg-cyan-500/[0.07]"
] as const;

const OPERATION_GROUP_FIRST_CELL_BORDER = [
  "border-l-4 border-l-amber-500/80",
  "border-l-4 border-l-sky-500/80",
  "border-l-4 border-l-violet-500/80",
  "border-l-4 border-l-emerald-500/80",
  "border-l-4 border-l-rose-500/80",
  "border-l-4 border-l-cyan-500/80"
] as const;

export type LedgerTableRow = LedgerEntry & Partial<LedgerBalanceContext>;

type LedgerTableProps = {
  entries: LedgerTableRow[];
  limit?: number;
  emptyMessage?: string;
  /** 小螢幕改卡片、md 以上維持表格 */
  layout?: "table" | "responsive";
  resolveVoidTarget?: (entry: LedgerTableRow) => ReversalTarget | null;
  onVoid?: (entry: LedgerTableRow, target: ReversalTarget) => void;
};

function directionLabel(direction: LedgerEntry["direction"]) {
  return direction === "in" ? "收入" : direction === "out" ? "支出" : "-";
}

function isProfitLedgerEntry(entry: LedgerTableRow) {
  return (
    entry.entryType === "利潤" ||
    entry.entryType === "分潤" ||
    entry.relatedTable === "profit" ||
    entry.description.includes("利潤")
  );
}

function ledgerAmountClass(entry: LedgerTableRow) {
  if (isProfitLedgerEntry(entry)) return profit.text;
  if (entry.direction === "out") return "text-destructive";
  if (entry.direction === "in") return entry.currency === "RMB" ? rmb.text : twd.text;
  return "text-foreground";
}

function rowGroupTone(
  entry: LedgerTableRow,
  groupCounts: Map<string, number>,
  groupToneByKey: Map<string, number>
) {
  const groupKey = ledgerOperationGroupKey(entry);
  if (!groupKey || (groupCounts.get(groupKey) ?? 0) < 2) return undefined;
  return groupToneByKey.get(groupKey);
}

function rowGroupClasses(
  entry: LedgerTableRow,
  groupCounts: Map<string, number>,
  groupToneByKey: Map<string, number>
) {
  const tone = rowGroupTone(entry, groupCounts, groupToneByKey);
  if (tone === undefined) return { row: undefined, firstCell: undefined, card: undefined };
  return {
    row: OPERATION_GROUP_ROW_BG[tone],
    firstCell: OPERATION_GROUP_FIRST_CELL_BORDER[tone],
    card: cn(OPERATION_GROUP_FIRST_CELL_BORDER[tone], OPERATION_GROUP_ROW_BG[tone])
  };
}

export function LedgerTable({
  entries,
  limit,
  emptyMessage = "尚無流水紀錄",
  layout = "table",
  resolveVoidTarget,
  onVoid
}: LedgerTableProps) {
  const rows = (limit ? entries.slice(0, limit) : entries).sort((a, b) => {
    const byTime = b.createdAt.localeCompare(a.createdAt);
    return byTime !== 0 ? byTime : b.id - a.id;
  });

  const { groupCounts, groupToneByKey } = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of rows) {
      const key = ledgerOperationGroupKey(entry);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const toneByKey = new Map<string, number>();
    let tone = 0;
    for (const entry of rows) {
      const key = ledgerOperationGroupKey(entry);
      if (!key || (counts.get(key) ?? 0) < 2 || toneByKey.has(key)) continue;
      toneByKey.set(key, tone % OPERATION_GROUP_ROW_BG.length);
      tone += 1;
    }
    return { groupCounts: counts, groupToneByKey: toneByKey };
  }, [rows]);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const tableView = (
    <div className={cn("min-w-0 max-w-full", layout === "responsive" ? "hidden md:block" : undefined)}>
    <Table>
      <THead>
        <TR>
          <TH>時間</TH>
          <TH>帳戶 / 對象</TH>
          <TH>類型</TH>
          <TH>方向</TH>
          <TH>說明</TH>
          <TH>操作人</TH>
          <TH className="text-right">異動前餘額</TH>
          <TH className="text-right">異動後餘額</TH>
          <TH className="text-right">金額</TH>
          {onVoid ? <TH className="text-right">操作</TH> : null}
        </TR>
      </THead>
      <TBody>
        {rows.map((entry) => {
          const group = rowGroupClasses(entry, groupCounts, groupToneByKey);
          return (
          <TR key={entry.id} className={group.row}>
            <TD className={cn("text-muted-foreground", group.firstCell)}>{new Date(entry.createdAt).toLocaleString("zh-TW")}</TD>
            <TD>{entry.subjectLabel ?? "-"}</TD>
            <TD>{entry.entryType}</TD>
            <TD>{directionLabel(entry.direction)}</TD>
            <TD>{entry.description}</TD>
            <TD>{entry.operatorName}</TD>
            <TD className="text-right">
              {entry.balanceBefore !== undefined
                ? fmtMoney(entry.balanceBefore, entry.balanceCurrency ?? entry.currency)
                : "-"}
            </TD>
            <TD className="text-right font-medium">
              {entry.balanceAfter !== undefined
                ? fmtMoney(entry.balanceAfter, entry.balanceCurrency ?? entry.currency)
                : "-"}
            </TD>
            <TD className={cn("text-right font-medium", ledgerAmountClass(entry))}>
              {fmtDirectionalMoney(entry.amount, entry.currency, entry.direction)}
            </TD>
            {onVoid ? (
              <TD className="text-right">
                {(() => {
                  const target = resolveVoidTarget?.(entry) ?? null;
                  if (!target) return <span className="text-muted-foreground">-</span>;
                  return (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => onVoid(entry, target)}
                    >
                      {target.label}
                    </Button>
                  );
                })()}
              </TD>
            ) : null}
          </TR>
        );
        })}
      </TBody>
    </Table>
    </div>
  );

  if (layout !== "responsive") {
    return tableView;
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((entry) => {
          const group = rowGroupClasses(entry, groupCounts, groupToneByKey);
          return (
          <article
            key={entry.id}
            className={cn(
              "rounded-lg border border-border/80 bg-muted/15 p-3 shadow-sm",
              group.card
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs leading-snug text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className={cn("shrink-0 text-base font-semibold tabular-nums", ledgerAmountClass(entry))}>
                {fmtDirectionalMoney(entry.amount, entry.currency, entry.direction)}
              </p>
            </div>
            <p className="mt-2 font-medium leading-snug">{entry.subjectLabel ?? "-"}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-muted/60 px-2 py-0.5">{entry.entryType}</span>
              <span className="rounded-md bg-muted/60 px-2 py-0.5">{directionLabel(entry.direction)}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{entry.description}</p>
            {entry.balanceBefore !== undefined ? (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-background/50 px-2 py-2 text-xs">
                <div>
                  <p className="text-muted-foreground">異動前</p>
                  <p className="mt-0.5 font-medium tabular-nums">
                    {fmtMoney(entry.balanceBefore, entry.balanceCurrency ?? entry.currency)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground">異動後</p>
                  <p className="mt-0.5 font-medium tabular-nums">
                    {fmtMoney(entry.balanceAfter!, entry.balanceCurrency ?? entry.currency)}
                  </p>
                </div>
              </div>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">操作人 {entry.operatorName}</p>
          </article>
        );
        })}
      </div>
      {tableView}
    </>
  );
}
