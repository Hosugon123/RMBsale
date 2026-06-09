import { profit, receivable } from "../lib/currencyStyles";
import { cn, fmtMoney } from "../lib/utils";

type SaleAmountSummaryProps = {
  receivableTwd: string;
  profitTwd: string | null;
  profitHint?: string;
  profitWarning?: string;
};

export function SaleAmountSummary({ receivableTwd, profitTwd, profitHint, profitWarning }: SaleAmountSummaryProps) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
      <div className={cn("rounded-md border p-3 text-center", receivable.surface)}>
        <p className={cn("text-xs", receivable.surfaceLabel)}>TWD 應收</p>
        <p className={cn("text-lg font-semibold sm:text-2xl", receivable.money)}>{fmtMoney(receivableTwd)}</p>
      </div>
      <div className="rounded-md border border-pending/25 bg-pending/10 p-3 text-center">
        <p className="text-xs text-pending/80">利潤</p>
        <p
          className={cn(
            "text-lg font-semibold sm:text-2xl",
            profitTwd !== null ? profit.text : "text-muted-foreground"
          )}
        >
          {profitTwd !== null ? fmtMoney(profitTwd) : "—"}
        </p>
        {profitWarning ? (
          <p className="mt-0.5 text-[10px] leading-snug text-amber-600 dark:text-amber-400 sm:text-xs">{profitWarning}</p>
        ) : profitHint ? (
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground sm:text-xs">{profitHint}</p>
        ) : null}
      </div>
    </div>
  );
}
