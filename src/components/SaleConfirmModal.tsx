import { profit, receivable, rmb } from "../lib/currencyStyles";
export { validateSaleForm } from "../lib/formValidation";
import { fmtMoney, fmtRate } from "../lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type SaleConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  customerName: string;
  accountLabel: string;
  rmbAmount: string;
  exchangeRate: string;
  receivableTwd: string;
  profitTwd: string | null;
  isMutating?: boolean;
  overlayClassName?: string;
};

export function SaleConfirmModal({
  open,
  onClose,
  onConfirm,
  customerName,
  accountLabel,
  rmbAmount,
  exchangeRate,
  receivableTwd,
  profitTwd,
  isMutating = false,
  overlayClassName = "z-50"
}: SaleConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/70 p-4 ${overlayClassName}`}
      onClick={isMutating ? undefined : onClose}
    >
      <Card className="w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="border-b p-4">
          <CardTitle>確認建立售出</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 text-sm">
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <p>
              <span className="text-muted-foreground">客戶：</span>
              {customerName}
            </p>
            <p>
              <span className="text-muted-foreground">扣款 RMB 帳戶：</span>
              {accountLabel}
            </p>
            <p>
              <span className="text-muted-foreground">RMB 金額：</span>
              <span className={rmb.text}>{fmtMoney(rmbAmount, "RMB")}</span>
            </p>
            <p>
              <span className="text-muted-foreground">售出匯率：</span>
              {fmtRate(exchangeRate)}
            </p>
            <p>
              <span className="text-muted-foreground">台幣應收：</span>
              <span className={receivable.text}>{fmtMoney(receivableTwd)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">利潤：</span>
              <span className={profit.text}>{profitTwd !== null ? fmtMoney(profitTwd) : "—"}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={isMutating} onClick={onClose}>
              取消
            </Button>
            <Button type="button" className="flex-1" disabled={isMutating} onClick={onConfirm}>
              {isMutating ? "處理中…" : "確認建立"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
