import * as React from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeftRight, X } from "lucide-react";
import type { Account } from "../lib/types";
import { useAppStore } from "../features/AppStore";
import { runMutation, useIsMutating } from "../lib/runMutation";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

const TRANSFER_OPEN_EVENT = "rmb:open-transfer";

function compatibleTransferTargets(from: Account | undefined, accounts: Account[]) {
  if (!from) return [];
  return accounts.filter((account) => account.currency === from.currency && account.id !== from.id);
}

function defaultTransferForm(accounts: Account[]) {
  const from = accounts[0];
  if (!from) return { fromAccountId: "", toAccountId: "", amount: "" };
  const to = compatibleTransferTargets(from, accounts)[0];
  return { fromAccountId: String(from.id), toAccountId: String(to?.id ?? ""), amount: "" };
}

function AccountSelectOptions({ accounts }: { accounts: Account[] }) {
  const groups = new Map<string, Account[]>();
  for (const account of accounts) {
    const list = groups.get(account.holderName) ?? [];
    list.push(account);
    groups.set(account.holderName, list);
  }

  return Array.from(groups.entries()).map(([holderName, holderAccounts]) => (
    <optgroup key={holderName} label={holderName}>
      {holderAccounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}（{account.currency}）
        </option>
      ))}
    </optgroup>
  ));
}

export function openAccountTransferModal() {
  window.dispatchEvent(new CustomEvent(TRANSFER_OPEN_EVENT));
}

export function TransferModalHost() {
  const { state, createTransfer } = useAppStore();
  const isMutating = useIsMutating();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState("");

  const activeAccounts = React.useMemo(
    () => state.accounts.filter((account) => account.isActive),
    [state.accounts]
  );

  const [form, setForm] = React.useState(() => defaultTransferForm(activeAccounts));

  const fromAccount = activeAccounts.find((account) => account.id === Number(form.fromAccountId));
  const compatibleAccounts = compatibleTransferTargets(fromAccount, activeAccounts);

  const openModal = React.useCallback(() => {
    setError("");
    setForm(defaultTransferForm(state.accounts.filter((account) => account.isActive)));
    setOpen(true);
  }, [state.accounts]);

  React.useEffect(() => {
    window.addEventListener(TRANSFER_OPEN_EVENT, openModal);
    return () => window.removeEventListener(TRANSFER_OPEN_EVENT, openModal);
  }, [openModal]);

  React.useEffect(() => {
    if (location.hash === "#transfer") {
      openModal();
    }
  }, [location.hash, openModal]);

  const close = () => {
    setOpen(false);
    setError("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await runMutation(() =>
      createTransfer({
        fromAccountId: Number(form.fromAccountId),
        toAccountId: Number(form.toAccountId),
        amount: form.amount
      }));
      setForm((current) => ({ ...current, amount: "" }));
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "轉帳失敗");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <Card className="w-full max-w-lg overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-start justify-between gap-4 border-b">
          <CardTitle>帳戶轉帳</CardTitle>
          <Button aria-label="關閉" onClick={close} size="icon" variant="ghost">
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          <form className="grid gap-3" onSubmit={submit}>
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">轉出帳戶</span>
              <Select
                value={form.fromAccountId}
                onChange={(event) => {
                  const selected = activeAccounts.find((account) => account.id === Number(event.target.value));
                  const firstTo = compatibleTransferTargets(selected, activeAccounts)[0];
                  setForm({
                    ...form,
                    fromAccountId: event.target.value,
                    toAccountId: String(firstTo?.id ?? "")
                  });
                }}
              >
                <AccountSelectOptions accounts={activeAccounts} />
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">轉入帳戶</span>
              <Select
                value={form.toAccountId}
                disabled={compatibleAccounts.length === 0}
                onChange={(event) => setForm({ ...form, toAccountId: event.target.value })}
              >
                <AccountSelectOptions accounts={compatibleAccounts} />
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">金額</span>
              <Input
                inputMode="decimal"
                placeholder="金額"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                required
                autoFocus
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" disabled={!form.toAccountId || isMutating} type="submit">
              <ArrowLeftRight className="h-4 w-4" />
              {isMutating ? "處理中…" : "確認轉帳"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
