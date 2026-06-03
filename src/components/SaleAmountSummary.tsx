import { profit } from "../lib/currencyStyles";
import { cn, fmtMoney } from "../lib/utils";

type SaleAmountSummaryProps = {
  receivableTwd: string;
  profitTwd: string | null;
  profitHint?: string;
};

export function SaleAmountSummary({ receivableTwd, profitTwd, profitHint }: SaleAmountSummaryProps) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
      <div className="rounded-md border border-red-400/20 bg-red-400/10 p-3 text-center">
        <p className="text-xs text-red-300">TWD 應收</p>
        <p className="text-lg font-semibold text-red-100 sm:text-2xl">{fmtMoney(receivableTwd)}</p>
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
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground sm:text-xs">{profitHint ?? "FIFO 自動計算"}</p>
      </div>
    </div>
  );
}
