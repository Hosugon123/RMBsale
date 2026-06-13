import * as React from "react";
import { HandCoins, X } from "lucide-react";
import type { AppState } from "../lib/types";
import { useAppStore } from "../features/AppStore";
import { useSaleCustomerSource } from "../hooks/useSaleCustomerSource";
import { previewSaleProfit, accountFifoRmb } from "../lib/localStore";
import { runMutation, useIsMutating } from "../lib/runMutation";
import { rmb } from "../lib/currencyStyles";
import { fmtMoney } from "../lib/utils";
import { CustomerManagerModal } from "./CustomerManagerModal";
import { SaleAmountSummary } from "./SaleAmountSummary";
import { SaleExchangeRateField } from "./SaleExchangeRateField";
import { saleFieldLabelRowClass } from "./saleFormLayout";
import { SaleConfirmModal, validateSaleForm } from "./SaleConfirmModal";
import { SaleCustomerFields } from "./SaleCustomerFields";
import { fieldControlClass } from "../lib/formStyles";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

const SALE_OPEN_EVENT = "rmb:open-sale";

type SaleFormState = {
  rmbAccountId: string;
  rmbAmount: string;
  exchangeRate: string;
};

function defaultSaleForm(state: AppState): SaleFormState {
  const rmbAccounts = state.accounts.filter((account) => account.currency === "RMB" && account.isActive);
  return {
    rmbAccountId: String(rmbAccounts[0]?.id ?? ""),
    rmbAmount: "",
    exchangeRate: ""
  };
}

export function openSaleModal() {
  window.dispatchEvent(new CustomEvent(SALE_OPEN_EVENT));
}

export function SaleModalHost() {
  const { state, createSale } = useAppStore();
  const isMutating = useIsMutating();
  const [open, setOpen] = React.useState(false);
  const [customerManagerOpen, setCustomerManagerOpen] = React.useState(false);
  const [error, setError] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [form, setForm] = React.useState<SaleFormState>(() => defaultSaleForm(state));

  const rmbAccounts = React.useMemo(
    () => state.accounts.filter((account) => account.currency === "RMB" && account.isActive),
    [state.accounts]
  );
  const activeCustomers = React.useMemo(
    () => state.customers.filter((customer) => customer.isActive),
    [state.customers]
  );
  const {
    presetId: customerPresetId,
    setPresetId: setCustomerPresetId,
    custom: customerCustom,
    setCustom: setCustomerCustom,
    customerName,
    hasPreset: hasPresetCustomer,
    hasCustom: hasCustomCustomer,
    reset: resetCustomerSource
  } = useSaleCustomerSource(activeCustomers);

  const amountPreview = React.useMemo(
    () =>
      previewSaleProfit(state, {
        rmbAccountId: Number(form.rmbAccountId),
        rmbAmount: form.rmbAmount,
        exchangeRate: form.exchangeRate
      }),
    [state, form.rmbAccountId, form.rmbAmount, form.exchangeRate]
  );
  const receivableTwd = amountPreview?.twdAmount ?? "0";
  const rmbAccount = rmbAccounts.find((account) => String(account.id) === form.rmbAccountId);

  const openModal = React.useCallback(() => {
    setError("");
    setConfirmOpen(false);
    setForm(defaultSaleForm(state));
    resetCustomerSource();
    setOpen(true);
  }, [state, resetCustomerSource]);

  React.useEffect(() => {
    window.addEventListener(SALE_OPEN_EVENT, openModal);
    return () => window.removeEventListener(SALE_OPEN_EVENT, openModal);
  }, [openModal]);

  const close = () => {
    setOpen(false);
    setError("");
  };

  const submitSale = async () => {
    try {
      await runMutation(() =>
      createSale({
        customerName,
        rmbAccountId: Number(form.rmbAccountId),
        rmbAmount: form.rmbAmount,
        exchangeRate: form.exchangeRate
      }));
      setForm((current) => ({ ...current, rmbAmount: "", exchangeRate: "" }));
      resetCustomerSource();
      setConfirmOpen(false);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立售出失敗");
      setConfirmOpen(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateSaleForm({
      customerName,
      rmbAccountId: form.rmbAccountId,
      rmbAmount: form.rmbAmount,
      exchangeRate: form.exchangeRate,
      profitError: amountPreview?.profitError ?? null
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setConfirmOpen(true);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={close}>
        <Card className="max-h-[90vh] w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
          <CardHeader className="flex-row items-start justify-between gap-4 border-b p-4">
            <CardTitle>售出錄入</CardTitle>
            <Button aria-label="關閉" onClick={close} size="icon" variant="ghost">
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent className="max-h-[calc(90vh-5rem)] overflow-y-auto p-4">
            <form className="space-y-4" onSubmit={submit} noValidate>
              <SaleCustomerFields
                activeCustomers={activeCustomers}
                presetId={customerPresetId}
                customName={customerCustom}
                hasPreset={hasPresetCustomer}
                hasCustom={hasCustomCustomer}
                onPresetIdChange={setCustomerPresetId}
                onCustomNameChange={setCustomerCustom}
                onManageClick={() => setCustomerManagerOpen(true)}
                onClearError={() => {
                  if (error) setError("");
                }}
              />
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>扣款 RMB 帳戶</span>
                <Select
                  className={fieldControlClass}
                  value={form.rmbAccountId}
                  onChange={(event) => setForm({ ...form, rmbAccountId: event.target.value })}
                  required
                >
                  {rmbAccounts.map((account) => {
                    const fifo = accountFifoRmb(state, account.id);
                    const balanceLabel = fmtMoney(account.balance, "RMB");
                    const label =
                      fifo === account.balance
                        ? `${account.holderName} / ${account.name} (${balanceLabel})`
                        : `${account.holderName} / ${account.name} (餘額 ${balanceLabel} · 可售 ${fmtMoney(fifo, "RMB")})`;
                    return (
                      <option key={account.id} value={account.id}>
                        {label}
                      </option>
                    );
                  })}
                </Select>
              </label>
              <div className="grid min-w-0 grid-cols-2 items-start gap-2 sm:gap-3 max-[440px]:grid-cols-1">
                <label className="block min-w-0 space-y-1 text-sm font-medium">
                  <div className={saleFieldLabelRowClass}>
                    <span className={rmb.text}>RMB 金額</span>
                  </div>
                  <Input
                    className={fieldControlClass}
                    inputMode="decimal"
                    value={form.rmbAmount}
                    onChange={(event) => setForm({ ...form, rmbAmount: event.target.value })}
                    required
                  />
                </label>
                <SaleExchangeRateField
                  sales={state.sales}
                  value={form.exchangeRate}
                  onChange={(exchangeRate) => setForm({ ...form, exchangeRate })}
                  onClearError={() => {
                    if (error) setError("");
                  }}
                />
              </div>
              <SaleAmountSummary
                receivableTwd={receivableTwd}
                profitTwd={amountPreview?.profitTwd ?? null}
                profitWarning={amountPreview?.profitWarning ?? undefined}
                profitHint={amountPreview?.profitError ?? undefined}
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button className="h-10 w-full" disabled={!form.rmbAccountId} type="submit">
                <HandCoins className="h-4 w-4" />
                建立售出
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <CustomerManagerModal open={customerManagerOpen} onClose={() => setCustomerManagerOpen(false)} />
      <SaleConfirmModal
        open={confirmOpen}
        overlayClassName="z-[60]"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void submitSale()}
        isMutating={isMutating}
        customerName={customerName}
        accountLabel={rmbAccount ? `${rmbAccount.holderName} / ${rmbAccount.name}` : "—"}
        rmbAmount={form.rmbAmount}
        exchangeRate={form.exchangeRate}
        receivableTwd={receivableTwd}
        profitTwd={amountPreview?.profitTwd ?? null}
      />
    </>
  );
}
