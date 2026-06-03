import * as React from "react";
import { profit, rmb, twd } from "../../lib/currencyStyles";
import { cn } from "../../lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "twd" | "rmb" | "danger" | "pending" | "muted";
};

const tones = {
  default: "bg-sky-400/15 text-sky-300",
  twd: twd.badge,
  rmb: rmb.badge,
  danger: "bg-red-400/15 text-red-300",
  pending: profit.badge,
  muted: "bg-slate-700 text-slate-200"
};

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-1 text-xs font-medium", tones[tone], className)} {...props} />;
}
