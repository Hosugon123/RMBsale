import * as React from "react";
import { CheckCircle2, X } from "lucide-react";
import type { AppState } from "../lib/types";
import { useAppStore } from "../features/AppStore";
import { defaultSettlementAmount, d, fmtMoney, parseMoneyInput } from "../lib/utils";
import { runMutation, useIsMutating } from "../lib/runMutation";
import { describeReceivable, fmtReceivableBalance, settlementReceivablePreview } from "../lib/receivableDisplay";
import { fieldControlClass } from "../lib/formStyles";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { SettlementConfirmModal } from "./SettlementConfirmModal";

const SETTLEMENT_OPEN_EVENT = "rmb:open-settlement";

type SettlementOpenDetail = {
  customerId?: number;
};

type SettlementFormState = {
  customerId: string;
  accountId: string;
  amountTwd: string;
};

function settlementEligibleCustomers(state: AppState) {
  return state.customers.filter((customer) => customer.isActive && Number(customer.receivableTwd) !== 0);
}

function buildSettlementForm(state: AppState, preselectedCustomerId?: number): SettlementFormState {
  const eligible = settlementEligibleCustomers(state);
  const twdAccounts = state.accounts.filter((account) => account.currency === "TWD" && account.isActive);
  const customer =
    (preselectedCustomerId != null
      ? state.customers.find((item) => item.id === preselectedCustomerId && item.isActive)
      : undefined) ??
    eligible.find((item) => Number(item.receivableTwd) > 0) ??
    eligible[0];
  return {
    customerId: String(customer?.id ?? ""),
    accountId: String(twdAccounts[0]?.id ?? ""),
    amountTwd: customer ? defaultSettlementAmount(customer.receivableTwd) : ""
  };
}

function settlementAmountHint(amountTwd: string, paymentValid: boolean, paymentPositive: boolean) {
  if (!amountTwd.trim()) return "請輸入收款金額";
  if (!paymentValid) return "金額格式不正確";
  if (!paymentPositive) return "收款金額須大於 0";
  return "";
}

export function openSettlementModal(customerId?: number) {
  window.dispatchEvent(new CustomEvent<SettlementOpenDetail>(SETTLEMENT_OPEN_EVENT, { detail: { customerId } }));
}

export function SettlementModalHost() {
  const { state, createSettlement } = useAppStore();
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const isMutating = useIsMutating();
  const [open, setOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [error, setError] = React.useState("");
  const [form, setForm] = React.useState<SettlementFormState>(() => buildSettlementForm(state));

  const eligibleCustomers = React.useMemo(() => settlementEligibleCustomers(state), [state.customers]);
  const twdAccounts = React.useMemo(
    () => state.accounts.filter((account) => account.currency === "TWD" && account.isActive),
    [state.accounts]
  );
  const selectedCustomer = state.customers.find((customer) => customer.id === Number(form.customerId));
  const selectedAccount = twdAccounts.find((account) => account.id === Number(form.accountId));
  const paymentInput = parseMoneyInput(form.amountTwd);
  const settlementPreview = React.useMemo(() => {
    if (!selectedCustomer) {
      return settlementReceivablePreview(0, 0);
    }
    const payment = paymentInput ?? d(0);
    return settlementReceivablePreview(selectedCustomer.receivableTwd, payment);
  }, [paymentInput, selectedCustomer]);
  const amountHint = settlementAmountHint(
    form.amountTwd,
    paymentInput !== null,
    paymentInput !== null && paymentInput.gt(0)
  );
  const canProceed =
    Boolean(selectedCustomer) &&
    Boolean(form.accountId) &&
    paymentInput !== null &&
    paymentInput.gt(0);

  const openModal = React.useCallback((event?: Event) => {
    setError("");
    setConfirmOpen(false);
    const customerId = (event as CustomEvent<SettlementOpenDetail> | undefined)?.detail?.customerId;
    setForm(buildSettlementForm(stateRef.current, customerId));
    setOpen(true);
  }, []);

  React.useEffect(() => {
    const handler = (event: Event) => openModal(event);
    window.addEventListener(SETTLEMENT_OPEN_EVENT, handler);
    return () => window.removeEventListener(SETTLEMENT_OPEN_EVENT, handler);
  }, [openModal]);

  const close = () => {
    setConfirmOpen(false);
    setOpen(false);
    setError("");
  };

  const openConfirm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canProceed) {
      setError(amountHint || "請完整填寫收帳資訊");
      return;
    }
    setError("");
    setConfirmOpen(true);
  };

  const confirmSettlement = async () => {
    if (!selectedCustomer || !paymentInput) return;
    try {
      await runMutation(() =>
        createSettlement({
          customerId: Number(form.customerId),
          accountId: Number(form.accountId),
          amountTwd: form.amountTwd.trim()
        })
      );
      setForm((current) => ({ ...current, amountTwd: "" }));
      close();
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : "收帳失敗");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <Card className="w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-start justify-between gap-4 border-b p-4">
          <CardTitle>客戶收帳</CardTitle>
          <Button aria-label="關閉" onClick={close} size="icon" variant="ghost">
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          {eligibleCustomers.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">目前無待收或多付客戶</p>
          ) : twdAccounts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">請先至帳務管理建立台幣帳戶</p>
          ) : (
            <form className="space-y-4" onSubmit={openConfirm} noValidate>
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>客戶</span>
                <Select
                  className={fieldControlClass}
                  value={form.customerId}
                  onChange={(event) => {
                    const customer = state.customers.find((item) => item.id === Number(event.target.value));
                    setForm((current) => ({
                      ...current,
                      customerId: event.target.value,
                      amountTwd: customer ? defaultSettlementAmount(customer.receivableTwd) : ""
                    }));
                    setError("");
                  }}
                  required
                >
                  {eligibleCustomers.map((customer) => {
                    const info = describeReceivable(customer.receivableTwd);
                    return (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} ({fmtReceivableBalance(customer.receivableTwd)} · {info.statusLabel})
                      </option>
                    );
                  })}
                </Select>
              </label>
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>入帳 TWD 帳戶</span>
                <Select
                  className={fieldControlClass}
                  value={form.accountId}
                  onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}
                  required
                >
                  {twdAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.holderName} / {account.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>收款金額</span>
                <Input
                  className={fieldControlClass}
                  inputMode="decimal"
                  value={form.amountTwd}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, amountTwd: event.target.value }));
                    if (error) setError("");
                  }}
                  placeholder={selectedCustomer ? defaultSettlementAmount(selectedCustomer.receivableTwd) || "0.00" : "0.00"}
                />
              </label>
              {amountHint ? <p className="text-sm text-muted-foreground">{amountHint}</p> : null}
              {settlementPreview.isOverpay ? (
                <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                  本次將多付 {fmtMoney(settlementPreview.overpayAmount)}，餘額會顯示為「多付」
                </p>
              ) : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button className="h-10 w-full" disabled={!canProceed || isMutating} type="submit">
                <CheckCircle2 className="h-4 w-4" />
                下一步
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <SettlementConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void confirmSettlement()}
        customerName={selectedCustomer?.name ?? ""}
        accountLabel={
          selectedAccount ? `${selectedAccount.holderName} / ${selectedAccount.name}` : ""
        }
        amountTwd={form.amountTwd.trim()}
        receivableBefore={selectedCustomer?.receivableTwd ?? "0.00"}
        isMutating={isMutating}
      />
    </div>
  );
}
