import * as React from "react";
import { CheckCircle2, X } from "lucide-react";
import type { AppState } from "../lib/types";
import { useAppStore } from "../features/AppStore";
import { fmtMoney } from "../lib/utils";
import { runMutation } from "../lib/runMutation";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

const SETTLEMENT_OPEN_EVENT = "rmb:open-settlement";

type SettlementOpenDetail = {
  customerId?: number;
};

type SettlementFormState = {
  customerId: string;
  accountId: string;
  amountTwd: string;
};

function buildSettlementForm(state: AppState, preselectedCustomerId?: number): SettlementFormState {
  const receivables = state.customers.filter((customer) => Number(customer.receivableTwd) > 0);
  const twdAccounts = state.accounts.filter((account) => account.currency === "TWD" && account.isActive);
  const customer =
    (preselectedCustomerId != null
      ? state.customers.find((item) => item.id === preselectedCustomerId && Number(item.receivableTwd) > 0)
      : undefined) ?? receivables[0];
  return {
    customerId: String(customer?.id ?? ""),
    accountId: String(twdAccounts[0]?.id ?? ""),
    amountTwd: customer?.receivableTwd ?? ""
  };
}

export function openSettlementModal(customerId?: number) {
  window.dispatchEvent(new CustomEvent<SettlementOpenDetail>(SETTLEMENT_OPEN_EVENT, { detail: { customerId } }));
}

export function SettlementModalHost() {
  const { state, createSettlement } = useAppStore();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState("");
  const [form, setForm] = React.useState<SettlementFormState>(() => buildSettlementForm(state));

  const receivables = React.useMemo(
    () => state.customers.filter((customer) => Number(customer.receivableTwd) > 0),
    [state.customers]
  );
  const twdAccounts = React.useMemo(
    () => state.accounts.filter((account) => account.currency === "TWD" && account.isActive),
    [state.accounts]
  );
  const selectedCustomer = state.customers.find((customer) => customer.id === Number(form.customerId));

  const openModal = React.useCallback((event?: Event) => {
    setError("");
    const customerId = (event as CustomEvent<SettlementOpenDetail> | undefined)?.detail?.customerId;
    setForm(buildSettlementForm(state, customerId));
    setOpen(true);
  }, [state]);

  React.useEffect(() => {
    const handler = (event: Event) => openModal(event);
    window.addEventListener(SETTLEMENT_OPEN_EVENT, handler);
    return () => window.removeEventListener(SETTLEMENT_OPEN_EVENT, handler);
  }, [openModal]);

  const close = () => {
    setOpen(false);
    setError("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCustomer) return;
    try {
      await runMutation(() =>
      createSettlement({
        customerId: Number(form.customerId),
        accountId: Number(form.accountId),
        amountTwd: form.amountTwd
      }));
      setForm((current) => ({ ...current, amountTwd: "" }));
      close();
    } catch (err) {
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
          {receivables.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">目前無待收帳款</p>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>客戶</span>
                <Select
                  className="min-w-0 w-full max-w-full text-xs sm:text-sm"
                  value={form.customerId}
                  onChange={(event) => {
                    const customer = state.customers.find((item) => item.id === Number(event.target.value));
                    setForm({
                      ...form,
                      customerId: event.target.value,
                      amountTwd: customer?.receivableTwd ?? ""
                    });
                  }}
                  required
                >
                  {receivables.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} ({fmtMoney(customer.receivableTwd)})
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>入帳 TWD 帳戶</span>
                <Select
                  className="min-w-0 w-full max-w-full text-xs sm:text-sm"
                  value={form.accountId}
                  onChange={(event) => setForm({ ...form, accountId: event.target.value })}
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
                  className="min-w-0 w-full max-w-full text-xs sm:text-sm"
                  inputMode="decimal"
                  value={form.amountTwd}
                  onChange={(event) => setForm({ ...form, amountTwd: event.target.value })}
                  placeholder={selectedCustomer?.receivableTwd ?? "0.00"}
                  required
                />
              </label>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button className="h-10 w-full" disabled={!selectedCustomer || !form.accountId} type="submit">
                <CheckCircle2 className="h-4 w-4" />
                確認收帳
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
