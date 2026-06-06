import Decimal from "decimal.js";
import { receivable, twd } from "../lib/currencyStyles";
import { d, fmtMoney } from "../lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type SettlementConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  customerName: string;
  accountLabel: string;
  amountTwd: string;
  receivableBefore: string;
  isMutating?: boolean;
  overlayClassName?: string;
};

export function SettlementConfirmModal({
  open,
  onClose,
  onConfirm,
  customerName,
  accountLabel,
  amountTwd,
  receivableBefore,
  isMutating = false,
  overlayClassName = "z-[70]"
}: SettlementConfirmModalProps) {
  if (!open) return null;

  const afterReceivable = Decimal.max(0, d(receivableBefore).sub(amountTwd));

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/70 p-4 ${overlayClassName}`}
      onClick={isMutating ? undefined : onClose}
    >
      <Card className="w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="border-b p-4">
          <CardTitle>確認收帳</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 text-sm">
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <p>
              <span className="text-muted-foreground">客戶：</span>
              {customerName}
            </p>
            <p>
              <span className="text-muted-foreground">入帳 TWD 帳戶：</span>
              {accountLabel}
            </p>
            <p>
              <span className="text-muted-foreground">本次收款：</span>
              <span className={twd.text}>{fmtMoney(amountTwd)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">收帳前應收餘額：</span>
              <span className={receivable.text}>{fmtMoney(receivableBefore)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">收帳後應收餘額：</span>
              <span className={receivable.text}>{fmtMoney(afterReceivable)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={isMutating} onClick={onClose}>
              取消
            </Button>
            <Button type="button" className="flex-1" disabled={isMutating} onClick={onConfirm}>
              {isMutating ? "處理中…" : "確認收帳"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
