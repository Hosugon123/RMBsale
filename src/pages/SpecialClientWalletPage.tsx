import * as React from "react";
import { AlertCircle, Download, Loader2, RotateCcw, Wallet, X } from "lucide-react";
import { useAppStore } from "../features/AppStore";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/table";
import { fieldControlClass } from "../lib/formStyles";
import { runMutation } from "../lib/runMutation";
import { serverApi, useServerDataMode } from "../lib/serverApi";
import { canWriteLedger } from "../lib/permissions";
import type {
  SpecialClientDepositBody,
  SpecialClientPayoutBody,
  SpecialClientWalletData,
  SpecialClientWalletEntry,
  SpecialClientWalletEntryTypeFilter,
  SpecialClientWalletQuery
} from "../lib/specialClientWalletTypes";
import { cn, d, fmtDirectionalMoney, fmtMoney } from "../lib/utils";
import Decimal from "decimal.js";

const fieldClass = fieldControlClass;

function todayIsoDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function pctToRate(pct: string) {
  const value = d(pct || "0");
  if (value.lte(0)) return "0";
  return value.div(100).toFixed(6);
}

function rateToPct(rate: string) {
  return d(rate || "0.011").mul(100).toDecimalPlaces(2).toString();
}

function calcPreview(grossRmb: string, feeRatePct: string) {
  const gross = d(grossRmb || "0");
  if (gross.lte(0)) return { feeRmb: "0.00", netCreditRmb: "0.00" };
  const rate = d(pctToRate(feeRatePct));
  const fee = gross.mul(rate);
  return { feeRmb: fee.toFixed(2), netCreditRmb: gross.sub(fee).toFixed(2) };
}

function balanceHint(balance: string) {
  const value = d(balance);
  if (value.gt(0)) {
    return { text: `可代付額度 ${fmtMoney(value, "RMB")}`, className: "text-emerald-600 dark:text-emerald-400" };
  }
  if (value.eq(0)) {
    return { text: "已無剩餘額度", className: "text-muted-foreground" };
  }
  return {
    text: `已超付 ${fmtMoney(value.abs(), "RMB")}，客戶欠公司款`,
    className: "text-destructive"
  };
}

function entrySummary(entry: SpecialClientWalletEntry) {
  if (entry.type === "reversal" && entry.originalEntryId) {
    return entry.vendorName ? `沖銷代付 · ${entry.vendorName}` : `沖銷 #${entry.originalEntryId}`;
  }
  if (entry.type === "deposit") {
    const parts = [`結匯 ${fmtMoney(entry.grossRmb ?? 0, "RMB")}`];
    if (entry.usdAmount) parts.unshift(`USD ${entry.usdAmount}`);
    return parts.join(" · ");
  }
  return entry.vendorName ?? entry.purpose ?? "代付";
}

function buildWalletQuery(
  clientId: string,
  filters: { dateFrom: string; dateTo: string; entryType: SpecialClientWalletEntryTypeFilter }
): SpecialClientWalletQuery {
  return {
    clientId: clientId ? Number(clientId) : undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    entryType: filters.entryType
  };
}

export function SpecialClientWalletPage() {
  const serverMode = useServerDataMode();
  const {
    refresh,
    sessionUser,
    loadSpecialClientWallet,
    specialClientDeposit,
    specialClientPayout,
    specialClientReverse
  } = useAppStore();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>();
  const [wallet, setWallet] = React.useState<SpecialClientWalletData | null>(null);
  const [selectedClientId, setSelectedClientId] = React.useState<string>("");
  const [depositError, setDepositError] = React.useState<string>();
  const [payoutError, setPayoutError] = React.useState<string>();
  const [submitting, setSubmitting] = React.useState<"deposit" | "payout" | "reverse" | "export" | null>(null);
  const [filters, setFilters] = React.useState({
    dateFrom: "",
    dateTo: "",
    entryType: "all" as SpecialClientWalletEntryTypeFilter
  });
  const [reverseTarget, setReverseTarget] = React.useState<SpecialClientWalletEntry | null>(null);
  const [reverseReason, setReverseReason] = React.useState("");
  const [reverseError, setReverseError] = React.useState("");

  const [depositForm, setDepositForm] = React.useState({
    entryDate: todayIsoDate(),
    usdAmount: "",
    usdToRmbRate: "",
    grossRmb: "",
    feeRatePct: "1.1",
    cashAccountId: "",
    note: ""
  });

  const [payoutForm, setPayoutForm] = React.useState({
    entryDate: todayIsoDate(),
    payoutRmb: "",
    cashAccountId: "",
    purpose: "",
    note: ""
  });

  const loadWallet = React.useCallback(
    async (query?: SpecialClientWalletQuery) => {
      setLoading(true);
      setError(undefined);
      try {
        const params = query ?? buildWalletQuery(selectedClientId, filters);
        const data = await loadSpecialClientWallet(params);
        setWallet(data);
        if (data.selectedClientId) {
          setSelectedClientId(String(data.selectedClientId));
          const client = data.clients.find((item) => item.id === data.selectedClientId);
          if (client) {
            setDepositForm((prev) => ({ ...prev, feeRatePct: rateToPct(client.feeRate) }));
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "讀取失敗");
      } finally {
        setLoading(false);
      }
    },
    [filters, loadSpecialClientWallet, selectedClientId]
  );

  React.useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    void loadWallet(buildWalletQuery(clientId, filters));
  };

  const applyFilters = () => {
    void loadWallet(buildWalletQuery(selectedClientId, filters));
  };

  const exportExcel = async () => {
    if (!serverMode) {
      setError("本機 demo 模式不支援 Excel 匯出，請改用線上環境");
      return;
    }
    setError(undefined);
    try {
      setSubmitting("export");
      const url = serverApi.specialClientWalletExportUrl(buildWalletQuery(selectedClientId, filters));
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "匯出失敗");
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `special-client-wallet-${todayIsoDate()}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "匯出失敗");
    } finally {
      setSubmitting(null);
    }
  };

  const submitReverse = async () => {
    if (!reverseTarget) return;
    setReverseError("");
    if (!reverseReason.trim()) {
      setReverseError("請填寫沖銷原因");
      return;
    }
    try {
      setSubmitting("reverse");
      await runMutation(async () => {
        const data = await specialClientReverse({
          entryId: reverseTarget.id,
          reverseReason: reverseReason.trim(),
          clientId: reverseTarget.clientId
        });
        setWallet(data);
        setReverseTarget(null);
        setReverseReason("");
        await refresh();
      });
    } catch (err) {
      setReverseError(err instanceof Error ? err.message : "沖銷失敗");
    } finally {
      setSubmitting(null);
    }
  };

  const canReverse = canWriteLedger(sessionUser);

  const depositPreview = React.useMemo(
    () => calcPreview(depositForm.grossRmb, depositForm.feeRatePct),
    [depositForm.feeRatePct, depositForm.grossRmb]
  );

  const balanceStatus = wallet ? balanceHint(wallet.summary.balanceRmb) : null;

  const resetDepositForm = React.useCallback(() => {
    const client = wallet?.clients.find((item) => item.id === Number(selectedClientId));
    setDepositForm({
      entryDate: todayIsoDate(),
      usdAmount: "",
      usdToRmbRate: "",
      grossRmb: "",
      feeRatePct: rateToPct(client?.feeRate ?? "0.011"),
      cashAccountId: "",
      note: ""
    });
  }, [selectedClientId, wallet?.clients]);

  const resetPayoutForm = React.useCallback(() => {
    setPayoutForm({
      entryDate: todayIsoDate(),
      payoutRmb: "",
      cashAccountId: "",
      purpose: "",
      note: ""
    });
  }, []);

  const submitDeposit = async (event: React.FormEvent) => {
    event.preventDefault();
    setDepositError(undefined);
    if (!selectedClientId) {
      setDepositError("請選擇客戶");
      return;
    }
    if (!depositForm.cashAccountId) {
      setDepositError("請選擇入帳公司 RMB 帳戶");
      return;
    }
    if (d(depositForm.grossRmb).lte(0)) {
      setDepositError("結匯 RMB 金額必須大於 0");
      return;
    }
    if (depositForm.usdAmount.trim() && depositForm.usdToRmbRate.trim()) {
      setDepositError("USD 金額與 USD/RMB 匯率只能擇一填寫");
      return;
    }

    const body: SpecialClientDepositBody = {
      clientId: Number(selectedClientId),
      entryDate: depositForm.entryDate,
      grossRmb: d(depositForm.grossRmb).toFixed(2),
      feeRate: pctToRate(depositForm.feeRatePct),
      cashAccountId: Number(depositForm.cashAccountId),
      note: depositForm.note.trim() || undefined
    };
    if (depositForm.usdAmount.trim()) body.usdAmount = d(depositForm.usdAmount).toFixed(2);
    if (depositForm.usdToRmbRate.trim()) body.usdToRmbRate = new Decimal(depositForm.usdToRmbRate).toFixed(6);

    try {
      setSubmitting("deposit");
      await runMutation(async () => {
        const data = await specialClientDeposit(body);
        setWallet(data);
        resetDepositForm();
        await refresh();
      });
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : "儲值失敗");
    } finally {
      setSubmitting(null);
    }
  };

  const submitPayout = async (event: React.FormEvent) => {
    event.preventDefault();
    setPayoutError(undefined);
    if (!selectedClientId) {
      setPayoutError("請選擇客戶");
      return;
    }
    if (!payoutForm.cashAccountId) {
      setPayoutError("請選擇付款公司 RMB 帳戶");
      return;
    }
    if (d(payoutForm.payoutRmb).lte(0)) {
      setPayoutError("代付 RMB 金額必須大於 0");
      return;
    }

    const body: SpecialClientPayoutBody = {
      clientId: Number(selectedClientId),
      entryDate: payoutForm.entryDate,
      payoutRmb: d(payoutForm.payoutRmb).toFixed(2),
      cashAccountId: Number(payoutForm.cashAccountId),
      purpose: payoutForm.purpose.trim() || undefined,
      note: payoutForm.note.trim() || undefined
    };

    try {
      setSubmitting("payout");
      await runMutation(async () => {
        const data = await specialClientPayout(body);
        setWallet(data);
        resetPayoutForm();
        await refresh();
      });
    } catch (err) {
      setPayoutError(err instanceof Error ? err.message : "代付失敗");
    } finally {
      setSubmitting(null);
    }
  };

  if (loading && !wallet) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        載入特殊客戶儲值代付帳…
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">特殊客戶儲值代付帳</h1>
          <p className="text-sm text-muted-foreground">記錄特殊客戶結匯儲值、代付與 1.1% 服務費利潤。</p>
        </div>
        {wallet?.clients.length ? (
          <div className="w-full sm:w-56">
            <Select
              className={fieldClass}
              value={selectedClientId}
              onChange={(e) => handleClientChange(e.target.value)}
            >
              {wallet.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {!wallet?.clients.length ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">尚未設定儲值客戶，請聯絡管理員。</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">目前客戶餘額</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{fmtMoney(wallet.summary.balanceRmb, "RMB")}</p>
                {balanceStatus ? <p className={cn("mt-1 text-sm", balanceStatus.className)}>{balanceStatus.text}</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">區間累計結匯 RMB</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{fmtMoney(wallet.summary.totalGrossRmb, "RMB")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">區間累計代付 RMB</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{fmtMoney(wallet.summary.totalPayoutRmb, "RMB")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">區間服務費利潤</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{fmtMoney(wallet.summary.totalFeeRmb, "RMB")}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4" />
                  新增儲值
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(e) => void submitDeposit(e)}>
                  <label className="block space-y-1 text-sm">
                    <span>日期</span>
                    <Input className={fieldClass} type="date" value={depositForm.entryDate} onChange={(e) => setDepositForm((p) => ({ ...p, entryDate: e.target.value }))} />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>USD 金額（擇一填）</span>
                    <Input
                      className={fieldClass}
                      inputMode="decimal"
                      value={depositForm.usdAmount}
                      onChange={(e) =>
                        setDepositForm((p) => ({
                          ...p,
                          usdAmount: e.target.value,
                          usdToRmbRate: e.target.value.trim() ? "" : p.usdToRmbRate
                        }))
                      }
                      placeholder="例如 10000"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>USD/RMB 匯率（擇一填）</span>
                    <Input
                      className={fieldClass}
                      inputMode="decimal"
                      value={depositForm.usdToRmbRate}
                      onChange={(e) =>
                        setDepositForm((p) => ({
                          ...p,
                          usdToRmbRate: e.target.value,
                          usdAmount: e.target.value.trim() ? "" : p.usdAmount
                        }))
                      }
                      placeholder="例如 7.2500"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>結匯 RMB 金額 *</span>
                    <Input className={fieldClass} inputMode="decimal" value={depositForm.grossRmb} onChange={(e) => setDepositForm((p) => ({ ...p, grossRmb: e.target.value }))} placeholder="例如 100000" required />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>服務費率 (%)</span>
                    <Input className={fieldClass} inputMode="decimal" value={depositForm.feeRatePct} onChange={(e) => setDepositForm((p) => ({ ...p, feeRatePct: e.target.value }))} />
                  </label>
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                    <p>服務費 RMB：{fmtMoney(depositPreview.feeRmb, "RMB")}</p>
                    <p>客戶實際入帳：{fmtMoney(depositPreview.netCreditRmb, "RMB")}</p>
                  </div>
                  <label className="block space-y-1 text-sm">
                    <span>入帳公司 RMB 帳戶 *</span>
                    <Select className={fieldClass} value={depositForm.cashAccountId} onChange={(e) => setDepositForm((p) => ({ ...p, cashAccountId: e.target.value }))} required>
                      <option value="">請選擇帳戶</option>
                      {wallet.rmbAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}（{fmtMoney(account.balance, "RMB")}）
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>備註</span>
                    <Input className={fieldClass} value={depositForm.note} onChange={(e) => setDepositForm((p) => ({ ...p, note: e.target.value }))} />
                  </label>
                  {depositError ? <p className="text-sm text-destructive">{depositError}</p> : null}
                  <Button type="submit" disabled={submitting === "deposit" || !sessionUser}>
                    {submitting === "deposit" ? "提交中…" : "確認儲值"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">新增代付</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(e) => void submitPayout(e)}>
                  <label className="block space-y-1 text-sm">
                    <span>日期</span>
                    <Input className={fieldClass} type="date" value={payoutForm.entryDate} onChange={(e) => setPayoutForm((p) => ({ ...p, entryDate: e.target.value }))} />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>代付 RMB 金額 *</span>
                    <Input className={fieldClass} inputMode="decimal" value={payoutForm.payoutRmb} onChange={(e) => setPayoutForm((p) => ({ ...p, payoutRmb: e.target.value }))} required />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>付款公司 RMB 帳戶 *</span>
                    <Select className={fieldClass} value={payoutForm.cashAccountId} onChange={(e) => setPayoutForm((p) => ({ ...p, cashAccountId: e.target.value }))} required>
                      <option value="">請選擇帳戶</option>
                      {wallet.rmbAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}（{fmtMoney(account.balance, "RMB")}）
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>用途</span>
                    <Input className={fieldClass} value={payoutForm.purpose} onChange={(e) => setPayoutForm((p) => ({ ...p, purpose: e.target.value }))} />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span>備註</span>
                    <Input className={fieldClass} value={payoutForm.note} onChange={(e) => setPayoutForm((p) => ({ ...p, note: e.target.value }))} />
                  </label>
                  {payoutError ? <p className="text-sm text-destructive">{payoutError}</p> : null}
                  <Button type="submit" disabled={submitting === "payout" || !sessionUser}>
                    {submitting === "payout" ? "提交中…" : "確認代付"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">流水對帳表</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={submitting === "export"} onClick={() => void exportExcel()}>
                  <Download className="mr-1 h-4 w-4" />
                  {submitting === "export" ? "匯出中…" : "匯出 Excel"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="space-y-1 text-sm">
                  <span>日期起</span>
                  <Input className={fieldClass} type="date" value={filters.dateFrom} onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))} />
                </label>
                <label className="space-y-1 text-sm">
                  <span>日期迄</span>
                  <Input className={fieldClass} type="date" value={filters.dateTo} onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))} />
                </label>
                <label className="space-y-1 text-sm">
                  <span>類型</span>
                  <Select className={fieldClass} value={filters.entryType} onChange={(e) => setFilters((p) => ({ ...p, entryType: e.target.value as SpecialClientWalletEntryTypeFilter }))}>
                    <option value="all">全部</option>
                    <option value="deposit">儲值</option>
                    <option value="payout">代付</option>
                    <option value="reversal">沖銷</option>
                  </Select>
                </label>
                <div className="flex items-end sm:col-span-2">
                  <Button type="button" variant="outline" onClick={applyFilters}>
                    套用篩選
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
              {wallet.entries.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">尚無流水</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>日期</TH>
                      <TH>類型</TH>
                      <TH>客戶</TH>
                      <TH>廠商或摘要</TH>
                      <TH>入帳/付款帳戶</TH>
                      <TH>結匯 RMB</TH>
                      <TH>服務費 RMB</TH>
                      <TH>客戶實際入帳</TH>
                      <TH>代付 RMB</TH>
                      <TH>公司帳戶異動</TH>
                      <TH>客戶餘額</TH>
                      <TH>利潤流水</TH>
                      <TH>沖銷狀態</TH>
                      <TH>操作人員</TH>
                      <TH>備註</TH>
                      <TH>操作</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {wallet.entries.map((entry) => (
                      <TR key={entry.id} className={entry.reversedAt ? "opacity-70" : undefined}>
                        <TD>{entry.entryDate}</TD>
                        <TD>
                          <span className={cn(entry.type === "reversal" && "text-amber-600 dark:text-amber-400", entry.reversedAt && "text-muted-foreground line-through")}>
                            {entry.typeLabel}
                          </span>
                        </TD>
                        <TD>{entry.clientName}</TD>
                        <TD>{entrySummary(entry)}</TD>
                        <TD>{entry.cashAccountName}</TD>
                        <TD>{entry.grossRmb ? fmtMoney(entry.grossRmb, "RMB") : "—"}</TD>
                        <TD>{entry.feeRmb ? fmtMoney(entry.feeRmb, "RMB") : "—"}</TD>
                        <TD>{entry.netCreditRmb ? fmtMoney(entry.netCreditRmb, "RMB") : "—"}</TD>
                        <TD>{entry.payoutRmb ? fmtMoney(entry.payoutRmb, "RMB") : "—"}</TD>
                        <TD>{fmtDirectionalMoney(entry.cashAccountDelta, "RMB", d(entry.cashAccountDelta).gte(0) ? "in" : "out")}</TD>
                        <TD>{fmtMoney(entry.balanceAfterRmb, "RMB")}</TD>
                        <TD>{entry.profitLedgerStatus}</TD>
                        <TD>{entry.reversalStatus}</TD>
                        <TD>{entry.operatorName?.trim() || entry.operatorUsername}</TD>
                        <TD>{entry.note || entry.reverseReason || "—"}</TD>
                        <TD>
                          {entry.canReverse && canReverse ? (
                            <Button type="button" size="sm" variant="outline" onClick={() => { setReverseTarget(entry); setReverseReason(""); setReverseError(""); }}>
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              沖銷
                            </Button>
                          ) : entry.originalEntryId ? (
                            <span className="text-xs text-muted-foreground">#{entry.originalEntryId}</span>
                          ) : entry.reversalEntryId ? (
                            <span className="text-xs text-muted-foreground">→ #{entry.reversalEntryId}</span>
                          ) : (
                            "—"
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              </div>
            </CardContent>
          </Card>

          {reverseTarget ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <Card className="w-full max-w-md">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <CardTitle className="text-base">確認沖銷</CardTitle>
                  <button type="button" className="text-muted-foreground" onClick={() => setReverseTarget(null)} aria-label="關閉">
                    <X className="h-4 w-4" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    將沖銷 {reverseTarget.typeLabel} #{reverseTarget.id}（{entrySummary(reverseTarget)}）。此操作會新增反向流水，不可復原。
                  </p>
                  <label className="block space-y-1 text-sm">
                    <span>沖銷原因 *</span>
                    <Input className={fieldClass} value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="請說明沖銷原因" />
                  </label>
                  {reverseError ? <p className="text-sm text-destructive">{reverseError}</p> : null}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setReverseTarget(null)}>
                      取消
                    </Button>
                    <Button type="button" variant="destructive" disabled={submitting === "reverse"} onClick={() => void submitReverse()}>
                      {submitting === "reverse" ? "處理中…" : "確認沖銷"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
