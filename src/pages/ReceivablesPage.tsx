import * as React from "react";
import { CheckCircle2, X } from "lucide-react";
import { useAppStore } from "../features/AppStore";
import { runMutation } from "../lib/runMutation";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/table";
import { receivable, rmb, twd } from "../lib/currencyStyles";
import { ChannelLedgerModal } from "../components/ChannelLedgerModal";
import { CustomerLedgerModal } from "../components/CustomerLedgerModal";
import { PayPurchaseConfirmModal } from "../components/PayPurchaseConfirmModal";
import { openSettlementModal } from "../components/SettlementModalHost";
import { PaginatedLedgerTable } from "../components/PaginatedLedgerTable";
import {
  purchasePayableTwd,
  sortedPayableLedgerWithBalances,
  sortedReceivableLedgerWithBalances
} from "../lib/localStore";
import Decimal from "decimal.js";
import { cn, d, fmtMoney } from "../lib/utils";
import type { Account, Customer, Purchase } from "../lib/types";

const fieldSelectClass = "h-10 min-w-0 w-full max-w-full text-xs sm:text-sm";
const fieldInputClass = "h-10 min-w-0 w-full max-w-full text-xs sm:text-sm";
const cardHeaderClass = "p-3 pb-2 sm:p-4 sm:pb-0";
const cardContentClass = "min-w-0 p-3 pt-0 sm:p-4";

function purchasePaymentStatusLabel(status: Purchase["paymentStatus"]) {
  if (status === "paid") return "已付款";
  if (status === "partial") return "部分付款";
  return "待付款";
}

function ReceivableCustomerCards({
  customers,
  onSelectCustomer
}: {
  customers: Customer[];
  onSelectCustomer: (customerId: number) => void;
}) {
  return (
    <div className="space-y-2 md:hidden">
      {customers.map((customer) => {
        const pending = Number(customer.receivableTwd) > 0;
        return (
          <button
            key={customer.id}
            type="button"
            onClick={() => onSelectCustomer(customer.id)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
              "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pending ? "border-receivable/30 bg-receivable/5" : "border-border/80 bg-muted/15"
            )}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{customer.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{pending ? "待收 · 點擊查看流水" : "已結清 · 點擊查看流水"}</p>
            </div>
            <p className={cn("shrink-0 text-lg font-semibold tabular-nums", receivable.money)}>
              {fmtMoney(customer.receivableTwd)}
            </p>
          </button>
        );
      })}
    </div>
  );
}

type PayPurchaseFormProps = {
  payables: Purchase[];
  payForm: { purchaseId: string; accountId: string; amountTwd: string };
  setPayForm: React.Dispatch<React.SetStateAction<{ purchaseId: string; accountId: string; amountTwd: string }>>;
  twdAccounts: Account[];
  purchases: Purchase[];
  selectedPayable?: Purchase;
  selectedPayableRemaining: string;
  onRequestConfirm: () => void;
  payError?: string;
};

function PayPurchaseForm({
  payables,
  payForm,
  setPayForm,
  twdAccounts,
  purchases,
  selectedPayable,
  selectedPayableRemaining,
  onRequestConfirm,
  payError
}: PayPurchaseFormProps) {
  const paymentPreview = React.useMemo(() => {
    if (!selectedPayable) {
      return { payment: d(0), afterRemaining: d(0), overPay: false };
    }
    const remaining = d(selectedPayableRemaining);
    const payment = payForm.amountTwd.trim() ? d(payForm.amountTwd) : d(0);
    return {
      payment,
      afterRemaining: Decimal.max(0, remaining.sub(payment)),
      overPay: payment.gt(remaining)
    };
  }, [payForm.amountTwd, selectedPayable, selectedPayableRemaining]);

  if (payables.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">目前無待付款買入</p>;
  }

  return (
    <form
      className="min-w-0 space-y-3 sm:space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selectedPayable || !payForm.accountId || !payForm.amountTwd.trim()) return;
        onRequestConfirm();
      }}
    >
      <label className="block min-w-0 space-y-1 text-sm font-medium">
        <span>待付款買入</span>
        <Select
          className={fieldSelectClass}
          value={payForm.purchaseId}
          onChange={(event) => {
            const purchase = purchases.find((item) => item.id === Number(event.target.value));
            setPayForm({
              ...payForm,
              purchaseId: event.target.value,
              amountTwd: purchase ? purchasePayableTwd(purchase) : ""
            });
          }}
        >
          {payables.map((purchase) => (
            <option key={purchase.id} value={purchase.id}>
              {purchase.channelName} (待付 {fmtMoney(purchasePayableTwd(purchase))})
            </option>
          ))}
        </Select>
      </label>
      <label className="block min-w-0 space-y-1 text-sm font-medium">
        <span>付款 TWD 帳戶</span>
        <Select
          className={fieldSelectClass}
          value={payForm.accountId}
          onChange={(event) => setPayForm({ ...payForm, accountId: event.target.value })}
          required
        >
          <option value="">請選擇付款帳戶</option>
          {twdAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.holderName} / {account.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="block min-w-0 space-y-1 text-sm font-medium">
        <span>付款金額</span>
        <Input
          className={fieldInputClass}
          inputMode="decimal"
          value={payForm.amountTwd}
          onChange={(event) => setPayForm({ ...payForm, amountTwd: event.target.value })}
          placeholder={selectedPayableRemaining}
          required
        />
      </label>
      {selectedPayable ? (
        <div className={cn(twd.surface, "space-y-3 text-sm sm:text-base")}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={twd.surfaceLabel}>本次付款</p>
              <p className={cn("text-lg font-semibold tabular-nums sm:text-xl", twd.text)}>
                {fmtMoney(paymentPreview.payment)}
              </p>
            </div>
            <div className="text-right">
              <p className={twd.surfaceLabel}>付款後待付餘額</p>
              <p
                className={cn(
                  "text-lg font-semibold tabular-nums sm:text-xl",
                  paymentPreview.overPay ? "text-destructive" : twd.text
                )}
              >
                {fmtMoney(paymentPreview.afterRemaining)}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-twd/20 pt-2 text-xs text-muted-foreground">
            <span>目前待付 {fmtMoney(selectedPayableRemaining)}</span>
            <span>應付總額 {fmtMoney(selectedPayable.twdCost)}</span>
          </div>
        </div>
      ) : null}
      {paymentPreview.overPay ? (
        <p className="text-sm text-destructive">付款金額超過待付餘額</p>
      ) : null}
      {payError ? <p className="text-sm text-destructive">{payError}</p> : null}
      <Button
        className="h-10 w-full"
        disabled={
          !selectedPayable ||
          !payForm.accountId ||
          !payForm.amountTwd.trim() ||
          paymentPreview.overPay ||
          paymentPreview.payment.lte(0)
        }
        type="submit"
      >
        <CheckCircle2 className="h-4 w-4" />
        確認付款
      </Button>
    </form>
  );
}

function PayablePurchaseCards({
  purchases,
  onSelectChannel
}: {
  purchases: Purchase[];
  onSelectChannel: (channelId: number) => void;
}) {
  return (
    <div className="space-y-2 md:hidden">
      {purchases.map((purchase) => {
        const pending = purchase.paymentStatus !== "paid";
        return (
          <button
            key={purchase.id}
            type="button"
            onClick={() => onSelectChannel(purchase.channelId)}
            className={cn(
              "w-full rounded-lg border px-3 py-3 text-left transition-colors",
              "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pending ? "border-twd/30 bg-twd/5" : "border-border/80 bg-muted/15"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium leading-snug">{purchase.channelName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {pending ? "待付 · 點擊查看流水" : "已付款 · 點擊查看流水"}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-muted/60 px-2 py-0.5 text-xs">
                {purchasePaymentStatusLabel(purchase.paymentStatus)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">RMB</p>
                <p className={cn("font-semibold tabular-nums", rmb.money)}>{fmtMoney(purchase.rmbAmount, "RMB")}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">待付 TWD</p>
                <p className={cn("font-semibold tabular-nums", twd.money)}>{fmtMoney(purchasePayableTwd(purchase))}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function ReceivablesPage() {
  const { state, payPurchase } = useAppStore();
  const twdAccounts = state.accounts.filter((a) => a.currency === "TWD" && a.isActive);
  const receivables = state.customers.filter((c) => Number(c.receivableTwd) > 0);
  const payables = state.purchases.filter((purchase) => purchase.paymentStatus !== "paid");
  const [payForm, setPayForm] = React.useState({
    purchaseId: String(payables[0]?.id ?? ""),
    accountId: "",
    amountTwd: ""
  });
  const [ledgerCustomerId, setLedgerCustomerId] = React.useState<number | null>(null);
  const [ledgerChannelId, setLedgerChannelId] = React.useState<number | null>(null);
  const [payModalOpen, setPayModalOpen] = React.useState(false);
  const [payConfirmOpen, setPayConfirmOpen] = React.useState(false);
  const [payError, setPayError] = React.useState("");
  const selectedPayable = state.purchases.find((purchase) => purchase.id === Number(payForm.purchaseId));
  const selectedPayableRemaining = selectedPayable ? purchasePayableTwd(selectedPayable) : "0.00";
  const selectedPaymentAccount = twdAccounts.find((account) => account.id === Number(payForm.accountId));

  const openPayModal = () => {
    setPayError("");
    const first = payables[0];
    if (first) {
      setPayForm({
        purchaseId: String(first.id),
        accountId: "",
        amountTwd: purchasePayableTwd(first)
      });
    }
    setPayModalOpen(true);
  };

  const openPayConfirm = () => {
    setPayError("");
    setPayConfirmOpen(true);
  };

  const confirmPayPurchase = async () => {
    try {
      await runMutation(() =>
      payPurchase({
        purchaseId: Number(payForm.purchaseId),
        accountId: Number(payForm.accountId),
        amountTwd: payForm.amountTwd
      }));
      setPayConfirmOpen(false);
      setPayModalOpen(false);
      setPayForm((current) => ({ ...current, purchaseId: "", accountId: "", amountTwd: "" }));
    } catch (err) {
      setPayConfirmOpen(false);
      setPayError(err instanceof Error ? err.message : "付款失敗");
    }
  };
  const receivableLedgerRows = React.useMemo(() => sortedReceivableLedgerWithBalances(state), [state]);
  const payableLedgerRows = React.useMemo(() => sortedPayableLedgerWithBalances(state), [state]);
  const totalReceivable = React.useMemo(
    () => state.customers.reduce((sum, customer) => sum + Number(customer.receivableTwd), 0),
    [state.customers]
  );
  const totalPayable = React.useMemo(
    () => state.purchases.reduce((sum, purchase) => sum + Number(purchasePayableTwd(purchase)), 0),
    [state.purchases]
  );

  return (
    <div className="grid min-w-0 max-w-full gap-3 sm:gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
      <div className="min-w-0 space-y-3 sm:space-y-4">
        <Card>
          <CardHeader className={cn(cardHeaderClass, "flex-row flex-wrap items-start justify-between gap-3")}>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base sm:text-lg">應收帳款</CardTitle>
              <p className={cn("mt-2 text-lg font-semibold tabular-nums sm:text-xl", receivable.money)}>
                待收合計 {fmtMoney(totalReceivable)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0"
              disabled={receivables.length === 0}
              onClick={openSettlementModal}
            >
              <CheckCircle2 className="h-4 w-4" />
              客戶收帳
            </Button>
          </CardHeader>
          <CardContent className={cn(cardContentClass, "space-y-4 sm:space-y-6")}>
            <ReceivableCustomerCards customers={state.customers} onSelectCustomer={setLedgerCustomerId} />
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <THead>
                  <TR>
                    <TH>客戶</TH>
                    <TH className="text-right">欠款</TH>
                    <TH>狀態</TH>
                  </TR>
                </THead>
                <TBody>
                  {state.customers.map((customer) => (
                    <TR key={customer.id}>
                      <TD>
                        <button
                          type="button"
                          className="font-medium text-left hover:text-receivable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setLedgerCustomerId(customer.id)}
                        >
                          {customer.name}
                        </button>
                      </TD>
                      <TD className="text-right font-semibold text-receivable">{fmtMoney(customer.receivableTwd)}</TD>
                      <TD>{Number(customer.receivableTwd) > 0 ? "待收" : "已結清"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <div className="min-w-0 overflow-x-auto border-t border-border/60 pt-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground sm:text-sm">應收／收帳流水</p>
              <PaginatedLedgerTable
                entries={receivableLedgerRows}
                emptyMessage="尚無應收或收帳紀錄"
                className="space-y-3 sm:space-y-4"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="xl:hidden">
          <CardHeader className={cn(cardHeaderClass, "flex-row flex-wrap items-start justify-between gap-3")}>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base sm:text-lg">應付帳款</CardTitle>
              <p className={cn("mt-2 text-lg font-semibold tabular-nums sm:text-xl", twd.money)}>
                待付合計 {fmtMoney(totalPayable)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0"
              disabled={payables.length === 0}
              onClick={openPayModal}
            >
              <CheckCircle2 className="h-4 w-4" />
              應付款項
            </Button>
          </CardHeader>
          <CardContent className={cn(cardContentClass, "space-y-4 sm:space-y-6")}>
            <PayablePurchaseCards purchases={state.purchases} onSelectChannel={setLedgerChannelId} />
            <div className="hidden overflow-x-auto md:block">
              <PayablesTable purchases={state.purchases} onSelectChannel={setLedgerChannelId} />
            </div>
            <div className="min-w-0 overflow-x-auto border-t border-border/60 pt-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground sm:text-sm">應付／付款流水</p>
              <PaginatedLedgerTable
                entries={payableLedgerRows}
                emptyMessage="尚無應付或付款紀錄"
                className="space-y-3 sm:space-y-4"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <CustomerLedgerModal customerId={ledgerCustomerId} onClose={() => setLedgerCustomerId(null)} />
      <ChannelLedgerModal channelId={ledgerChannelId} onClose={() => setLedgerChannelId(null)} />

      {payModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4"
          onClick={() => setPayModalOpen(false)}
        >
          <Card className="max-h-[90vh] w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b p-3 sm:p-4">
              <CardTitle className="text-base sm:text-lg">應付款項</CardTitle>
              <Button aria-label="關閉" onClick={() => setPayModalOpen(false)} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[calc(90vh-4rem)] overflow-y-auto p-3 sm:p-4">
              <PayPurchaseForm
                payables={payables}
                payForm={payForm}
                setPayForm={setPayForm}
                twdAccounts={twdAccounts}
                purchases={state.purchases}
                selectedPayable={selectedPayable}
                selectedPayableRemaining={selectedPayableRemaining}
                onRequestConfirm={openPayConfirm}
                payError={payError}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <PayPurchaseConfirmModal
        open={payConfirmOpen}
        onClose={() => setPayConfirmOpen(false)}
        onConfirm={confirmPayPurchase}
        channelName={selectedPayable?.channelName ?? ""}
        accountLabel={
          selectedPaymentAccount
            ? `${selectedPaymentAccount.holderName} / ${selectedPaymentAccount.name}`
            : ""
        }
        amountTwd={payForm.amountTwd}
        payableRemaining={selectedPayableRemaining}
        overlayClassName="z-[60]"
      />

      <div className="hidden min-w-0 space-y-3 sm:space-y-4 xl:block">
        <Card>
          <CardHeader className={cn(cardHeaderClass, "flex-row flex-wrap items-start justify-between gap-3")}>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base sm:text-lg">應付帳款</CardTitle>
              <p className={cn("mt-2 text-lg font-semibold tabular-nums sm:text-xl", twd.money)}>
                待付合計 {fmtMoney(totalPayable)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0"
              disabled={payables.length === 0}
              onClick={openPayModal}
            >
              <CheckCircle2 className="h-4 w-4" />
              應付款項
            </Button>
          </CardHeader>
          <CardContent className={cn(cardContentClass, "space-y-4 sm:space-y-6")}>
            <div className="overflow-x-auto">
              <PayablesTable purchases={state.purchases} onSelectChannel={setLedgerChannelId} />
            </div>
            <div className="min-w-0 overflow-x-auto border-t border-border/60 pt-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground sm:text-sm">應付／付款流水</p>
              <PaginatedLedgerTable
                entries={payableLedgerRows}
                emptyMessage="尚無應付或付款紀錄"
                className="space-y-3 sm:space-y-4"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PayablesTable({
  purchases,
  onSelectChannel
}: {
  purchases: Purchase[];
  onSelectChannel: (channelId: number) => void;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>來源</TH>
          <TH className="text-right">RMB</TH>
          <TH className="text-right">應付 TWD</TH>
          <TH className="text-right">待付 TWD</TH>
          <TH>狀態</TH>
        </TR>
      </THead>
      <TBody>
        {purchases.map((purchase) => (
          <TR key={purchase.id}>
            <TD>
              <button
                type="button"
                className="font-medium text-left hover:text-twd focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelectChannel(purchase.channelId)}
              >
                {purchase.channelName}
              </button>
            </TD>
            <TD className={rmb.moneyCell}>{fmtMoney(purchase.rmbAmount, "RMB")}</TD>
            <TD className={twd.moneyCell}>{fmtMoney(purchase.twdCost)}</TD>
            <TD className={twd.moneyCell}>{fmtMoney(purchasePayableTwd(purchase))}</TD>
            <TD>{purchasePaymentStatusLabel(purchase.paymentStatus)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
