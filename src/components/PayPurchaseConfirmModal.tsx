import { receivable, twd } from "../lib/currencyStyles";
import Decimal from "decimal.js";
import { d, fmtMoney } from "../lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type PayPurchaseConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  channelName: string;
  accountLabel: string;
  amountTwd: string;
  payableRemaining: string;
  overlayClassName?: string;
};

export function PayPurchaseConfirmModal({
  open,
  onClose,
  onConfirm,
  channelName,
  accountLabel,
  amountTwd,
  payableRemaining,
  overlayClassName = "z-50"
}: PayPurchaseConfirmModalProps) {
  if (!open) return null;

  const afterRemaining = Decimal.max(0, d(payableRemaining).sub(amountTwd));

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/70 p-4 ${overlayClassName}`}
      onClick={onClose}
    >
      <Card className="w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="border-b p-4">
          <CardTitle>確認付款</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 text-sm">
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <p>
              <span className="text-muted-foreground">買入來源：</span>
              {channelName}
            </p>
            <p>
              <span className="text-muted-foreground">付款 TWD 帳戶：</span>
              {accountLabel}
            </p>
            <p>
              <span className="text-muted-foreground">本次付款：</span>
              <span className={twd.text}>{fmtMoney(amountTwd)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">付款前待付餘額：</span>
              <span className={twd.text}>{fmtMoney(payableRemaining)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">付款後待付餘額：</span>
              <span className={receivable.text}>{fmtMoney(afterRemaining)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              取消
            </Button>
            <Button type="button" className="flex-1" onClick={onConfirm}>
              確認付款
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
