import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { profit, receivable, rmb, twd } from "../lib/currencyStyles";
import { cn } from "../lib/utils";

type Props = {
  title: string;
  value: string;
  icon: LucideIcon;
  tone: "twd" | "rmb" | "receivable" | "pending";
  footer?: string;
  onClick?: () => void;
};

const toneClass = {
  twd: twd.icon,
  rmb: rmb.icon,
  receivable: "bg-receivable/15 text-receivable",
  pending: profit.icon
};

export function MetricCard({ title, value, icon: Icon, tone, footer, onClick }: Props) {
  const content = (
    <CardContent className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", toneClass[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{title}</p>
          <p className="mt-1 text-xl font-semibold tracking-normal">{value}</p>
        </div>
      </div>
      {footer ? <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{footer}</p> : null}
    </CardContent>
  );

  return (
    <Card>
      {onClick ? (
        <button className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onClick} type="button">
          {content}
        </button>
      ) : (
        content
      )}
    </Card>
  );
}
