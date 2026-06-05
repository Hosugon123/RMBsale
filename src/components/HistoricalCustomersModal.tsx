import { History, X } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TBody, TD, TH, THead, TR } from "./ui/table";
import type { Customer } from "../lib/types";
import { fmtMoney } from "../lib/utils";

type HistoricalCustomersModalProps = {
  open: boolean;
  customers: Customer[];
  onClose: () => void;
  onSelectCustomer: (customerId: number) => void;
};

export function HistoricalCustomersModal({
  open,
  customers,
  onClose,
  onSelectCustomer
}: HistoricalCustomersModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-4"
      onClick={onClose}
    >
      <Card className="max-h-[88vh] w-full max-w-lg overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-start justify-between gap-4 border-b p-3 sm:p-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <History className="h-5 w-5 shrink-0" />
              歷史客戶
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              欠款已結清客戶；同名客戶共用同一筆資料
            </p>
          </div>
          <Button aria-label="關閉" onClick={onClose} size="icon" variant="ghost">
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="max-h-[calc(88vh-5rem)] overflow-y-auto p-3 sm:p-4">
          {customers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">尚無歷史客戶</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <THead>
                  <TR>
                    <TH>客戶</TH>
                    <TH className="text-right">欠款</TH>
                    <TH>狀態</TH>
                  </TR>
                </THead>
                <TBody>
                  {customers.map((customer) => (
                    <TR key={customer.id}>
                      <TD>
                        <button
                          type="button"
                          className="font-medium text-left hover:text-receivable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => onSelectCustomer(customer.id)}
                        >
                          {customer.name}
                        </button>
                      </TD>
                      <TD className="text-right text-muted-foreground">{fmtMoney(customer.receivableTwd)}</TD>
                      <TD>已結清</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
