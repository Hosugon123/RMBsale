import * as React from "react";
import { HandCoins, Pencil, X } from "lucide-react";
import { CustomerManagerModal } from "../components/CustomerManagerModal";
import { SaleAmountSummary } from "../components/SaleAmountSummary";
import { SaleExchangeRateField } from "../components/SaleExchangeRateField";
import { saleFieldLabelRowClass } from "../components/saleFormLayout";
import { SaleConfirmModal, validateSaleForm } from "../components/SaleConfirmModal";
import { SaleCustomerFields } from "../components/SaleCustomerFields";
import { useAppStore } from "../features/AppStore";
import { useSaleCustomerSource } from "../hooks/useSaleCustomerSource";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { NumberPagination } from "../components/NumberPagination";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/table";
import { previewSaleProfit, accountFifoRmb } from "../lib/localStore";
import { runMutation, useIsMutating } from "../lib/runMutation";
import { profit, receivable, rmb } from "../lib/currencyStyles";
import { fieldControlClass } from "../lib/formStyles";
import { cn, fmtMoney, fmtRate, parseMoneyInput } from "../lib/utils";
import type { Sale } from "../lib/types";

const fieldSelectClass = fieldControlClass;
const fieldInputClass = fieldControlClass;
const SALE_PAGE_SIZE = 20;

function accountOptionLabel(holderName: string, name: string, balance: string, fifoRmb: string) {
  const balanceLabel = fmtMoney(balance, "RMB");
  if (fifoRmb === balance) return `${holderName}/${name} (${balanceLabel})`;
  return `${holderName}/${name} (餘額 ${balanceLabel} · 可售 ${fmtMoney(fifoRmb, "RMB")})`;
}

function settlementLabel(status: string) {
  if (status === "settled") return "已結清";
  if (status === "partial") return "部分收款";
  return "待收款";
}

export function SalePage() {
  const { state, createSale, updateSaleProfit } = useAppStore();
  const isMutating = useIsMutating();
  const rmbAccounts = state.accounts.filter((account) => account.currency === "RMB" && account.isActive);
  const activeCustomers = state.customers.filter((customer) => customer.isActive);
  const [customerManagerOpen, setCustomerManagerOpen] = React.useState(false);
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
  const [form, setForm] = React.useState({
    rmbAccountId: String(rmbAccounts[0]?.id ?? ""),
    rmbAmount: "",
    exchangeRate: ""
  });
  const [formError, setFormError] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [editingSale, setEditingSale] = React.useState<Sale | null>(null);
  const [profitForm, setProfitForm] = React.useState("");
  const [profitError, setProfitError] = React.useState("");

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
  const [salePage, setSalePage] = React.useState(1);
  const salePageCount = Math.max(1, Math.ceil(state.sales.length / SALE_PAGE_SIZE));

  React.useEffect(() => {
    if (salePage > salePageCount) setSalePage(salePageCount);
  }, [salePage, salePageCount]);

  React.useEffect(() => {
    setSalePage(1);
  }, [state.sales.length]);

  const pagedSales = React.useMemo(
    () => state.sales.slice((salePage - 1) * SALE_PAGE_SIZE, salePage * SALE_PAGE_SIZE),
    [state.sales, salePage]
  );

  const submitSale = async () => {
    try {
      await runMutation(() =>
        createSale({
          customerName,
          rmbAccountId: Number(form.rmbAccountId),
          rmbAmount: form.rmbAmount,
          exchangeRate: form.exchangeRate
        })
      );
      setForm((current) => ({ ...current, rmbAmount: "", exchangeRate: "" }));
      resetCustomerSource();
      setConfirmOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "建立售出失敗");
      setConfirmOpen(false);
    }
  };

  const openProfitEditor = (sale: Sale) => {
    setEditingSale(sale);
    setProfitForm(sale.profitTwd);
    setProfitError("");
  };

  const submitProfitEdit = async () => {
    if (!editingSale) return;
    try {
      if (!profitForm.trim()) throw new Error("請輸入利潤");
      const profitAmount = parseMoneyInput(profitForm);
      if (!profitAmount || profitAmount.lt(0)) throw new Error("利潤不可小於 0");
      await runMutation(() => updateSaleProfit({ saleId: editingSale.id, profitTwd: profitAmount.toFixed(2) }));
      setEditingSale(null);
      setProfitForm("");
      setProfitError("");
    } catch (err) {
      setProfitError(err instanceof Error ? err.message : "更新利潤失敗");
    }
  };

  return (
    <div className="grid min-w-0 max-w-full gap-3 sm:gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-0">
          <CardTitle>售出錄入</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 p-3 pt-0 sm:p-4">
          <form
            className="min-w-0 space-y-3 sm:space-y-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const error = validateSaleForm({
                customerName,
                rmbAccountId: form.rmbAccountId,
                rmbAmount: form.rmbAmount,
                exchangeRate: form.exchangeRate,
                profitError: amountPreview?.profitError ?? null
              });
              if (error) {
                setFormError(error);
                return;
              }
              setFormError("");
              setConfirmOpen(true);
            }}
          >
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
                if (formError) setFormError("");
              }}
            />
            <label className="block min-w-0 space-y-1 text-sm font-medium">
              <span>扣款 RMB 帳戶</span>
              <Select
                className={fieldSelectClass}
                value={form.rmbAccountId}
                onChange={(event) => {
                  setForm({ ...form, rmbAccountId: event.target.value });
                  if (formError) setFormError("");
                }}
                required
              >
                <option value="">請選擇帳戶</option>
                {rmbAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountOptionLabel(account.holderName, account.name, account.balance, accountFifoRmb(state, account.id))}
                  </option>
                ))}
              </Select>
            </label>
            <div className="grid min-w-0 grid-cols-2 items-start gap-2 sm:gap-3 max-[440px]:grid-cols-1">
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <div className={saleFieldLabelRowClass}>
                  <span className={rmb.text}>RMB 金額</span>
                </div>
                <Input
                  className={fieldInputClass}
                  inputMode="decimal"
                  value={form.rmbAmount}
                  onChange={(event) => {
                    setForm({ ...form, rmbAmount: event.target.value });
                    if (formError) setFormError("");
                  }}
                  required
                />
              </label>
              <SaleExchangeRateField
                sales={state.sales}
                value={form.exchangeRate}
                inputClassName={fieldInputClass}
                onChange={(exchangeRate) => setForm({ ...form, exchangeRate })}
                onClearError={() => {
                  if (formError) setFormError("");
                }}
              />
            </div>
            <SaleAmountSummary
              receivableTwd={receivableTwd}
              profitTwd={amountPreview?.profitTwd ?? null}
              profitWarning={amountPreview?.profitWarning ?? undefined}
              profitHint={amountPreview?.profitError ?? undefined}
            />
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <Button className="h-10 w-full" disabled={isMutating} type="submit">
              <HandCoins className="h-4 w-4" />
              {isMutating ? "處理中…" : "建立售出"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-0">
          <CardTitle>售出紀錄</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 space-y-3 p-3 pt-0 sm:space-y-4 sm:p-4">
          <Table>
            <THead>
              <TR>
                <TH>日期</TH>
                <TH>客戶</TH>
                <TH className="text-right">RMB</TH>
                <TH className="hidden text-right sm:table-cell">匯率</TH>
                <TH className="text-right">應收</TH>
                <TH className="hidden text-right md:table-cell">利潤</TH>
                <TH>狀態</TH>
                <TH className="hidden lg:table-cell">負責</TH>
                <TH className="text-right">操作</TH>
              </TR>
            </THead>
            <TBody>
              {pagedSales.length === 0 ? (
                <TR>
                  <TD colSpan={9} className="py-6 text-center text-muted-foreground">
                    尚無售出紀錄
                  </TD>
                </TR>
              ) : null}
              {pagedSales.map((item) => (
                <TR key={item.id}>
                  <TD className="text-muted-foreground">{new Date(item.createdAt).toLocaleDateString("zh-TW")}</TD>
                  <TD>{item.customerName}</TD>
                  <TD className={rmb.moneyCell}>{fmtMoney(item.rmbAmount, "RMB")}</TD>
                  <TD className="hidden text-right sm:table-cell">{fmtRate(item.exchangeRate)}</TD>
                  <TD className={receivable.moneyCell}>{fmtMoney(item.twdAmount)}</TD>
                  <TD className={cn("hidden text-right md:table-cell", profit.moneyCell)}>{fmtMoney(item.profitTwd)}</TD>
                  <TD>{settlementLabel(item.settlementStatus)}</TD>
                  <TD className="hidden lg:table-cell">{item.operatorName}</TD>
                  <TD className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 whitespace-nowrap px-2 text-xs"
                      disabled={isMutating}
                      onClick={() => openProfitEditor(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      編輯
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <NumberPagination page={salePage} pageCount={salePageCount} onPageChange={setSalePage} />
        </CardContent>
      </Card>

      <CustomerManagerModal open={customerManagerOpen} onClose={() => setCustomerManagerOpen(false)} />

      {editingSale ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={isMutating ? undefined : () => setEditingSale(null)}
        >
          <Card className="w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b p-4">
              <div>
                <CardTitle>編輯利潤</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{editingSale.customerName}</p>
              </div>
              <Button
                aria-label="關閉"
                disabled={isMutating}
                onClick={() => setEditingSale(null)}
                size="icon"
                variant="ghost"
              >
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-sm">
              <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 p-3">
                <p>
                  <span className="text-muted-foreground">RMB：</span>
                  <span className={rmb.text}>{fmtMoney(editingSale.rmbAmount, "RMB")}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">應收：</span>
                  <span className={receivable.text}>{fmtMoney(editingSale.twdAmount)}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">成本：</span>
                  {fmtMoney(editingSale.costTwd)}
                </p>
                <p>
                  <span className="text-muted-foreground">原利潤：</span>
                  <span className={profit.text}>{fmtMoney(editingSale.profitTwd)}</span>
                </p>
              </div>
              <label className="block space-y-1 font-medium">
                <span>利潤金額</span>
                <Input
                  autoFocus
                  inputMode="decimal"
                  value={profitForm}
                  onChange={(event) => {
                    setProfitForm(event.target.value);
                    if (profitError) setProfitError("");
                  }}
                />
              </label>
              {profitError ? <p className="text-sm text-destructive">{profitError}</p> : null}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={isMutating}
                  onClick={() => setEditingSale(null)}
                >
                  取消
                </Button>
                <Button type="button" className="flex-1" disabled={isMutating} onClick={() => void submitProfitEdit()}>
                  {isMutating ? "處理中…" : "儲存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <SaleConfirmModal
        open={confirmOpen}
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
    </div>
  );
}
