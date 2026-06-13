import * as React from "react";
import { PlusCircle } from "lucide-react";
import { ChannelManageButton, ChannelManagerModal } from "../components/ChannelManagerModal";
import { useAppStore } from "../features/AppStore";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { NumberPagination } from "../components/NumberPagination";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/table";
import { validatePurchaseForm, type PaymentStatusChoice } from "../lib/formValidation";
import { runMutation, useIsMutating } from "../lib/runMutation";
import { rmb, twd } from "../lib/currencyStyles";
import { purchasePaymentStatusLabel } from "../lib/purchaseUtils";
import { fieldControlClass } from "../lib/formStyles";
import { cn, d, fmtMoney, fmtRate } from "../lib/utils";

const fieldSelectClass = fieldControlClass;
const fieldInputClass = fieldControlClass;
const sectionBoxClass = "min-w-0 space-y-2.5 rounded-lg border bg-muted/20 p-3 sm:space-y-3 sm:p-4";
const sectionTitleClass = "text-base font-semibold leading-tight sm:text-[1.1375rem]";
const PURCHASE_PAGE_SIZE = 20;

function accountOptionLabel(holderName: string, name: string, balance: string, currency?: "RMB") {
  const money = fmtMoney(balance, currency);
  return `${holderName}/${name} (${money})`;
}

export function PurchasePage() {
  const { state, createPurchase } = useAppStore();
  const isMutating = useIsMutating();
  const twdAccounts = state.accounts.filter((a) => a.currency === "TWD" && a.isActive);
  const rmbAccounts = state.accounts.filter((a) => a.currency === "RMB" && a.isActive);
  const activeChannels = state.channels.filter((channel) => channel.isActive);
  const [sourcePresetId, setSourcePresetId] = React.useState("");
  const [sourceCustom, setSourceCustom] = React.useState("");
  const [channelManagerOpen, setChannelManagerOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [formError, setFormError] = React.useState("");
  const [form, setForm] = React.useState({
    paymentAccountId: "",
    depositAccountId: "",
    rmbAmount: "",
    exchangeRate: "",
    paymentStatus: "" as PaymentStatusChoice
  });

  React.useEffect(() => {
    if (!sourcePresetId) return;
    if (activeChannels.some((channel) => String(channel.id) === sourcePresetId)) return;
    setSourcePresetId("");
  }, [activeChannels, sourcePresetId]);

  React.useEffect(() => {
    if (sourceCustom.length > 0 && sourcePresetId) {
      setSourcePresetId("");
    }
  }, [sourceCustom, sourcePresetId]);

  const presetChannelName = activeChannels.find((channel) => String(channel.id) === sourcePresetId)?.name ?? "";
  const hasPresetSource = Boolean(sourcePresetId);
  const hasCustomSource = sourceCustom.length > 0;
  const channelName = sourceCustom.trim() || presetChannelName;
  const cost = form.rmbAmount && form.exchangeRate ? d(form.rmbAmount).mul(form.exchangeRate).toFixed(2) : "0";
  const [purchasePage, setPurchasePage] = React.useState(1);
  const purchasePageCount = Math.max(1, Math.ceil(state.purchases.length / PURCHASE_PAGE_SIZE));

  React.useEffect(() => {
    if (purchasePage > purchasePageCount) setPurchasePage(purchasePageCount);
  }, [purchasePage, purchasePageCount]);

  React.useEffect(() => {
    setPurchasePage(1);
  }, [state.purchases.length]);

  const pagedPurchases = React.useMemo(
    () => state.purchases.slice((purchasePage - 1) * PURCHASE_PAGE_SIZE, purchasePage * PURCHASE_PAGE_SIZE),
    [state.purchases, purchasePage]
  );

  const clearError = () => {
    if (formError) setFormError("");
  };

  const paymentAccount = twdAccounts.find((account) => String(account.id) === form.paymentAccountId);
  const depositAccount = rmbAccounts.find((account) => String(account.id) === form.depositAccountId);
  const paymentStatusLabel =
    form.paymentStatus === "paid" ? "已付款（扣台幣）" : form.paymentStatus === "unpaid" ? "待付款（先入庫）" : "";

  const resetForm = () => {
    setForm({ paymentAccountId: "", depositAccountId: "", rmbAmount: "", exchangeRate: "", paymentStatus: "" });
    setSourceCustom("");
    setSourcePresetId("");
    setFormError("");
  };

  const submitPurchase = async () => {
    try {
      await runMutation(() =>
      createPurchase({
        channelName,
        paymentAccountId: form.paymentStatus === "paid" ? Number(form.paymentAccountId) : undefined,
        depositAccountId: Number(form.depositAccountId),
        rmbAmount: form.rmbAmount,
        exchangeRate: form.exchangeRate,
        paymentStatus: form.paymentStatus as "paid" | "unpaid"
      }));
      resetForm();
      setConfirmOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "新增買入失敗");
      setConfirmOpen(false);
    }
  };

  return (
    <div className="grid min-w-0 max-w-full gap-3 sm:gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-0">
          <CardTitle>買入 RMB</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 p-3 pt-0 sm:p-4">
          <form
            className="min-w-0 space-y-3 sm:space-y-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const error = validatePurchaseForm({
                channelName,
                paymentStatus: form.paymentStatus,
                paymentAccountId: form.paymentAccountId,
                depositAccountId: form.depositAccountId,
                rmbAmount: form.rmbAmount,
                exchangeRate: form.exchangeRate
              });
              if (error) {
                setFormError(error);
                return;
              }
              setConfirmOpen(true);
            }}
          >
            <div className={sectionBoxClass}>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <p className={sectionTitleClass}>渠道選擇</p>
                <ChannelManageButton onClick={() => setChannelManagerOpen(true)} />
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 max-[440px]:grid-cols-1">
                <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span className="w-7 shrink-0">常用</span>
                  <Select
                    className={fieldSelectClass}
                    value={hasCustomSource ? "" : sourcePresetId}
                    disabled={hasCustomSource}
                    onChange={(event) => {
                      if (hasCustomSource) return;
                      const nextPresetId = event.target.value;
                      setSourcePresetId(nextPresetId);
                      if (nextPresetId) setSourceCustom("");
                      clearError();
                    }}
                  >
                    <option value="">不選擇</option>
                    {activeChannels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span className="w-7 shrink-0">其他</span>
                  <Input
                    className={fieldInputClass}
                    value={sourceCustom}
                    disabled={hasPresetSource}
                    onChange={(event) => {
                      const nextCustom = event.target.value;
                      setSourceCustom(nextCustom);
                      if (nextCustom.length > 0) setSourcePresetId("");
                      clearError();
                    }}
                  />
                </label>
              </div>
            </div>

            <div className={sectionBoxClass}>
              <p className={sectionTitleClass}>付款選項</p>
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>
                  付款狀態 <span className="text-destructive">*</span>
                </span>
                <Select
                  className={fieldSelectClass}
                  value={form.paymentStatus}
                  onChange={(event) => {
                    const paymentStatus = event.target.value as PaymentStatusChoice;
                    setForm({
                      ...form,
                      paymentStatus,
                      paymentAccountId: paymentStatus === "paid" ? form.paymentAccountId : ""
                    });
                    clearError();
                  }}
                  required
                >
                  <option value="">未選擇</option>
                  <option value="paid">已付款（扣台幣）</option>
                  <option value="unpaid">待付款（先入庫）</option>
                </Select>
              </label>
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>
                  付款台幣帳戶
                  {form.paymentStatus === "paid" ? <span className="text-destructive"> *</span> : null}
                </span>
                <Select
                  className={fieldSelectClass}
                  value={form.paymentAccountId}
                  onChange={(event) => {
                    setForm({ ...form, paymentAccountId: event.target.value });
                    clearError();
                  }}
                  disabled={form.paymentStatus !== "paid"}
                  required={form.paymentStatus === "paid"}
                >
                  <option value="">
                    {form.paymentStatus === "paid" ? "請選擇付款帳戶" : "請先選擇付款狀態"}
                  </option>
                  {twdAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {accountOptionLabel(account.holderName, account.name, account.balance)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>
                  入帳 RMB 帳戶 <span className="text-destructive">*</span>
                </span>
                <Select
                  className={fieldSelectClass}
                  value={form.depositAccountId}
                  onChange={(event) => {
                    setForm({ ...form, depositAccountId: event.target.value });
                    clearError();
                  }}
                  required
                >
                  <option value="">請選擇入帳帳戶</option>
                  {rmbAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {accountOptionLabel(account.holderName, account.name, account.balance, "RMB")}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 max-[440px]:grid-cols-1">
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>
                  RMB 金額 <span className="text-destructive">*</span>
                </span>
                <Input
                  className={fieldInputClass}
                  inputMode="decimal"
                  value={form.rmbAmount}
                  onChange={(event) => {
                    setForm({ ...form, rmbAmount: event.target.value });
                    clearError();
                  }}
                  required
                />
              </label>
              <label className="block min-w-0 space-y-1 text-sm font-medium">
                <span>
                  買入匯率 <span className="text-destructive">*</span>
                </span>
                <Input
                  className={fieldInputClass}
                  inputMode="decimal"
                  value={form.exchangeRate}
                  onChange={(event) => {
                    setForm({ ...form, exchangeRate: event.target.value });
                    clearError();
                  }}
                  required
                />
              </label>
            </div>

            <div className={cn(twd.surface, "text-center")}>
              <p className={twd.surfaceLabel}>預估 TWD 成本</p>
              <p className={cn(twd.surfaceValue, "text-lg sm:text-xl")}>{fmtMoney(cost)}</p>
            </div>

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <Button className="h-10 w-full" type="submit">
              <PlusCircle className="h-4 w-4" />
              新增買入
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-0">
          <CardTitle>買入紀錄</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 space-y-3 p-3 pt-0 sm:space-y-4 sm:p-4">
          <Table>
            <THead>
              <TR>
                <TH>日期</TH>
                <TH>渠道</TH>
                <TH className="text-right">RMB</TH>
                <TH className="hidden text-right sm:table-cell">匯率</TH>
                <TH className="text-right">成本</TH>
                <TH>狀態</TH>
                <TH className="hidden md:table-cell">負責</TH>
              </TR>
            </THead>
            <TBody>
              {pagedPurchases.length === 0 ? (
                <TR>
                  <TD colSpan={7} className="py-6 text-center text-muted-foreground">
                    尚無買入紀錄
                  </TD>
                </TR>
              ) : null}
              {pagedPurchases.map((item) => (
                <TR key={item.id}>
                  <TD className="text-muted-foreground">{new Date(item.createdAt).toLocaleDateString("zh-TW")}</TD>
                  <TD>{item.channelName}</TD>
                  <TD className={rmb.moneyCell}>{fmtMoney(item.rmbAmount, "RMB")}</TD>
                  <TD className="hidden text-right sm:table-cell">{fmtRate(item.exchangeRate)}</TD>
                  <TD className={twd.moneyCell}>{fmtMoney(item.twdCost)}</TD>
                  <TD>{purchasePaymentStatusLabel(item)}</TD>
                  <TD className="hidden md:table-cell">{item.operatorName}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <NumberPagination page={purchasePage} pageCount={purchasePageCount} onPageChange={setPurchasePage} />
        </CardContent>
      </Card>

      <ChannelManagerModal open={channelManagerOpen} onClose={() => setChannelManagerOpen(false)} />

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirmOpen(false)}>
          <Card className="w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="border-b p-4">
              <CardTitle>確認新增買入</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-sm">
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <p>
                  <span className="text-muted-foreground">渠道：</span>
                  {channelName}
                </p>
                <p>
                  <span className="text-muted-foreground">RMB 金額：</span>
                  <span className={rmb.text}>{fmtMoney(form.rmbAmount, "RMB")}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">買入匯率：</span>
                  {fmtRate(form.exchangeRate)}
                </p>
                <p>
                  <span className="text-muted-foreground">預估 TWD 成本：</span>
                  <span className={twd.text}>{fmtMoney(cost)}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">付款狀態：</span>
                  {paymentStatusLabel}
                </p>
                {form.paymentStatus === "paid" && paymentAccount ? (
                  <p>
                    <span className="text-muted-foreground">付款台幣帳戶：</span>
                    {paymentAccount.holderName} / {paymentAccount.name}
                  </p>
                ) : null}
                {depositAccount ? (
                  <p>
                    <span className="text-muted-foreground">入帳 RMB 帳戶：</span>
                    {depositAccount.holderName} / {depositAccount.name}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={isMutating}
                  onClick={() => setConfirmOpen(false)}
                >
                  取消
                </Button>
                <Button type="button" className="flex-1" disabled={isMutating} onClick={submitPurchase}>
                  {isMutating ? "處理中…" : "確認新增"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
