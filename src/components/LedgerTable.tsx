import * as React from "react";
import type { LedgerBalanceContext } from "../lib/localStore";
import { ledgerOperationGroupKey } from "../lib/localStore";
import type { ReversalTarget } from "../lib/reversalUi";
import type { LedgerEntry } from "../lib/types";
import { Button } from "./ui/button";
import { profit, rmb, twd } from "../lib/currencyStyles";
import { ledgerDirectionLabel } from "../lib/ledgerDirectionLabel";
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
  /** 顯示異動前／異動後餘額（流水頁等完整記帳用） */
  showBalances?: boolean;
  resolveVoidTarget?: (entry: LedgerTableRow) => ReversalTarget | null;
  onVoid?: (entry: LedgerTableRow, target: ReversalTarget) => void;
};

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

function responsiveCell(layout: "table" | "responsive", className?: string) {
  return cn(
    layout === "responsive" && "px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm",
    className
  );
}

function responsiveHead(layout: "table" | "responsive", className?: string) {
  return cn(
    layout === "responsive" && "h-8 px-2 text-[11px] sm:h-10 sm:px-3 sm:text-xs",
    className
  );
}

function balanceColClass(compact: boolean, showBalances: boolean) {
  if (!compact) return undefined;
  return showBalances ? "hidden md:table-cell" : "hidden xl:table-cell";
}

function balanceMobileColClass(compact: boolean, showBalances: boolean) {
  if (!compact || !showBalances) return "hidden";
  return "table-cell md:hidden";
}

function formatBalanceRange(entry: LedgerTableRow) {
  const balanceCurrency = entry.balanceCurrency ?? entry.currency;
  if (entry.balanceBefore === undefined || entry.balanceAfter === undefined) return "-";
  return (
    <>
      {fmtMoney(entry.balanceBefore, balanceCurrency)}
      <span className="text-muted-foreground"> → </span>
      {fmtMoney(entry.balanceAfter, balanceCurrency)}
    </>
  );
}

export function LedgerTable({
  entries,
  limit,
  emptyMessage = "尚無流水紀錄",
  layout = "table",
  showBalances = false,
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

  const compact = layout === "responsive";

  return (
    <div className="min-w-0 max-w-full">
      <Table>
        <THead>
          <TR>
            <TH className={responsiveHead(layout)}>日期</TH>
            <TH className={responsiveHead(layout)}>戶名</TH>
            <TH className={responsiveHead(layout)}>類型</TH>
            <TH className={responsiveHead(layout, compact ? "hidden sm:table-cell" : undefined)}>異動</TH>
            <TH className={responsiveHead(layout, compact ? "hidden md:table-cell" : undefined)}>說明</TH>
            <TH className={responsiveHead(layout, compact ? "hidden lg:table-cell" : undefined)}>操作人</TH>
            {showBalances && compact ? (
              <TH className={responsiveHead(layout, cn("text-right", balanceMobileColClass(compact, showBalances)))}>
                異動餘額
              </TH>
            ) : null}
            <TH className={responsiveHead(layout, cn("text-right", balanceColClass(compact, showBalances)))}>
              異動前
            </TH>
            <TH className={responsiveHead(layout, cn("text-right", balanceColClass(compact, showBalances)))}>
              異動後
            </TH>
            <TH className={responsiveHead(layout, "text-right")}>金額</TH>
            {onVoid ? <TH className={responsiveHead(layout, "text-right")}>操作</TH> : null}
          </TR>
        </THead>
        <TBody>
          {rows.map((entry) => {
            const group = rowGroupClasses(entry, groupCounts, groupToneByKey);
            const balanceCurrency = entry.balanceCurrency ?? entry.currency;
            const voidTarget = onVoid ? resolveVoidTarget?.(entry) ?? null : null;
            return (
              <TR key={entry.id} className={group.row}>
                <TD className={responsiveCell(layout, cn("text-muted-foreground", group.firstCell))}>
                  {new Date(entry.createdAt).toLocaleDateString("zh-TW")}
                </TD>
                <TD className={responsiveCell(layout, "max-w-[5rem] truncate sm:max-w-none")}>
                  {entry.subjectLabel ?? "-"}
                </TD>
                <TD className={responsiveCell(layout)}>{entry.entryType}</TD>
                <TD className={responsiveCell(layout, compact ? "hidden sm:table-cell" : undefined)}>
                  {ledgerDirectionLabel(entry)}
                </TD>
                <TD
                  className={responsiveCell(
                    layout,
                    cn(
                      compact ? "hidden md:table-cell" : undefined,
                      "max-w-[11rem] whitespace-normal break-words align-top sm:max-w-[14rem] lg:max-w-[18rem]"
                    )
                  )}
                  title={entry.description}
                >
                  {entry.description}
                </TD>
                <TD className={responsiveCell(layout, compact ? "hidden lg:table-cell" : undefined)}>
                  {entry.operatorName}
                </TD>
                {showBalances && compact ? (
                  <TD
                    className={responsiveCell(
                      layout,
                      cn("text-right tabular-nums", balanceMobileColClass(compact, showBalances))
                    )}
                  >
                    {formatBalanceRange(entry)}
                  </TD>
                ) : null}
                <TD className={responsiveCell(layout, cn("text-right tabular-nums", balanceColClass(compact, showBalances)))}>
                  {entry.balanceBefore !== undefined
                    ? fmtMoney(entry.balanceBefore, balanceCurrency)
                    : "-"}
                </TD>
                <TD
                  className={responsiveCell(
                    layout,
                    cn("text-right font-medium tabular-nums", balanceColClass(compact, showBalances))
                  )}
                >
                  {entry.balanceAfter !== undefined
                    ? fmtMoney(entry.balanceAfter, balanceCurrency)
                    : "-"}
                </TD>
                <TD className={responsiveCell(layout, cn("text-right font-medium", ledgerAmountClass(entry)))}>
                  {fmtDirectionalMoney(entry.amount, entry.currency, entry.direction)}
                </TD>
                {onVoid ? (
                  <TD className={responsiveCell(layout, "text-right")}>
                    {voidTarget ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "text-destructive hover:text-destructive",
                          compact ? "h-6 px-1.5 text-[10px] sm:h-7 sm:px-2 sm:text-xs" : "h-7 text-xs"
                        )}
                        onClick={() => onVoid(entry, voidTarget)}
                      >
                        {voidTarget.label}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TD>
                ) : null}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
