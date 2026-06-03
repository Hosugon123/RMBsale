import Decimal from "decimal.js";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Sale } from "../lib/types";
import { cn, d, fmtRate } from "../lib/utils";
import { saleFieldLabelRowClass } from "./saleFormLayout";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const RATE_STEP = "0.01";

export function stepSaleExchangeRate(value: string, direction: "up" | "down") {
  const current = d(value.trim() || "0");
  const next = direction === "up" ? current.add(RATE_STEP) : Decimal.max(0, current.sub(RATE_STEP));
  return fmtRate(next);
}

const defaultInputClass = "h-10 min-w-0 w-full max-w-full text-xs sm:text-sm";

type SaleExchangeRateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  sales: Sale[];
  inputClassName?: string;
  onClearError?: () => void;
};

export function getLastSaleExchangeRate(sales: Sale[]) {
  const latest = sales[0];
  if (!latest) return null;
  return fmtRate(latest.exchangeRate);
}

export function SaleExchangeRateField({
  value,
  onChange,
  sales,
  inputClassName = defaultInputClass,
  onClearError
}: SaleExchangeRateFieldProps) {
  const lastRate = getLastSaleExchangeRate(sales);

  return (
    <label className="block min-w-0 space-y-1 text-sm font-medium">
      <div className={cn(saleFieldLabelRowClass, "justify-between gap-2")}>
        <span>售出匯率</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={!lastRate}
          title={lastRate ? `帶入上筆匯率 ${lastRate}` : "尚無售出紀錄"}
          onClick={() => {
            if (!lastRate) return;
            onChange(lastRate);
            onClearError?.();
          }}
        >
          同上筆
        </Button>
      </div>
      <div className="relative min-w-0">
        <Input
          className={cn(inputClassName, "pr-9")}
          inputMode="decimal"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            onClearError?.();
          }}
          required
        />
        <div className="absolute inset-y-0 right-1 flex flex-col justify-center border-l border-input/50 pl-0.5">
          <button
            type="button"
            aria-label="匯率加 0.01"
            className="inline-flex h-4 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            onClick={() => {
              onChange(stepSaleExchangeRate(value, "up"));
              onClearError?.();
            }}
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="匯率減 0.01"
            className="inline-flex h-4 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            onClick={() => {
              onChange(stepSaleExchangeRate(value, "down"));
              onClearError?.();
            }}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </div>
    </label>
  );
}
