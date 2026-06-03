import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Pencil, Plus, Settings, Trash2, UserPlus, X } from "lucide-react";
import type { Account, AppState, Currency } from "../lib/types";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { PaginatedLedgerTable } from "../components/PaginatedLedgerTable";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/table";
import { openAccountTransferModal } from "../components/TransferModalHost";
import { useAppStore } from "../features/AppStore";
import { sortedLedgerWithBalances } from "../lib/localStore";
import { rmb, twd } from "../lib/currencyStyles";
import { cn, d, fmtMoney } from "../lib/utils";

type AccountCashForm = {
  amount: string;
  note: string;
  withdrawType: "capital" | "profit";
};

type CashModal = {
  accountId: number;
  direction: "in" | "out";
};

type RenameTarget =
  | { kind: "holder"; id: number; name: string }
  | { kind: "account"; id: number; name: string };

type DeleteTarget =
  | { kind: "holder"; id: number; name: string }
  | { kind: "account"; id: number; name: string };

const emptyCashForm: AccountCashForm = { amount: "", note: "", withdrawType: "capital" };
const emptyAddAccountForm = { name: "", currency: "TWD" as Currency };

function canDeleteAccount(account: Account, state: AppState) {
  if (!d(account.balance).eq(0) || !d(account.profitBalance).eq(0)) return false;
  return !state.rmbLots.some((lot) => lot.accountId === account.id && d(lot.remainingRmb).gt(0));
}

function sumByCurrency(accounts: Account[], currency: "TWD" | "RMB") {
  return accounts
    .filter((account) => account.currency === currency)
    .reduce((sum, account) => sum.add(account.balance), d(0))
    .toFixed(2);
}

const menuItemClass =
  "flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

type GearMenuItem = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
};

type GearActionsMenuProps = {
  title: string;
  size?: "sm" | "md";
  items: GearMenuItem[];
};

function GearActionsMenu({ title, size = "md", items }: GearActionsMenuProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonClass = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const settingsIconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  React.useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const run = (item: GearMenuItem) => {
    if (item.disabled) return;
    item.onClick();
    setOpen(false);
  };

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={buttonClass}
        title={title}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Settings className={settingsIconClass} />
      </Button>
      {open ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 min-w-[9.5rem] overflow-hidden rounded-md border bg-card py-1 shadow-lg shadow-black/25"
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={cn(
                menuItemClass,
                item.destructive && "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10"
              )}
              role="menuitem"
              title={item.title}
              disabled={item.disabled}
              onClick={() => run(item)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type CashActionsMenuProps = {
  onDeposit: () => void;
  onWithdraw: () => void;
};

function CashActionsMenu({ onDeposit, onWithdraw }: CashActionsMenuProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 px-2 text-xs"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        出入金
      </Button>
      {open ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 min-w-[9.5rem] overflow-hidden rounded-md border bg-card py-1 shadow-lg shadow-black/25"
          role="menu"
        >
          <button type="button" className={menuItemClass} role="menuitem" onClick={() => run(onDeposit)}>
            <ArrowDownToLine className="h-4 w-4 shrink-0" />
            入金
          </button>
          <button type="button" className={menuItemClass} role="menuitem" onClick={() => run(onWithdraw)}>
            <ArrowUpFromLine className="h-4 w-4 shrink-0" />
            出金
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AccountsPage() {
  const {
    state,
    adjustAccount,
    createAccount,
    createHolder,
    renameHolder,
    renameAccount,
    deleteHolder,
    deleteAccount
  } = useAppStore();
  const [cashModal, setCashModal] = React.useState<CashModal | null>(null);
  const [modalForm, setModalForm] = React.useState<AccountCashForm>(emptyCashForm);
  const [modalError, setModalError] = React.useState("");
  const [addAccountModal, setAddAccountModal] = React.useState<{ holderId: number; holderName: string } | null>(null);
  const [addAccountForm, setAddAccountForm] = React.useState(emptyAddAccountForm);
  const [addAccountError, setAddAccountError] = React.useState("");
  const [addHolderModal, setAddHolderModal] = React.useState(false);
  const [holderName, setHolderName] = React.useState("");
  const [addHolderError, setAddHolderError] = React.useState("");
  const [renameTarget, setRenameTarget] = React.useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renameError, setRenameError] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = React.useState("");

  const holderGroups = React.useMemo(
    () =>
      state.holders
        .filter((holder) => holder.isActive)
        .map((holder) => {
          const accounts = state.accounts.filter((account) => account.holderId === holder.id && account.isActive);
          return {
            holder,
            accounts,
            twdTotal: sumByCurrency(accounts, "TWD"),
            rmbTotal: sumByCurrency(accounts, "RMB")
          };
        }),
    [state.accounts, state.holders]
  );

  const ledgerRows = React.useMemo(() => sortedLedgerWithBalances(state), [state]);
  const modalAccount = cashModal ? state.accounts.find((account) => account.id === cashModal.accountId) : undefined;

  const openCashModal = (accountId: number, direction: "in" | "out") => {
    setModalForm(emptyCashForm);
    setModalError("");
    setCashModal({ accountId, direction });
  };

  const closeCashModal = () => {
    setCashModal(null);
    setModalForm(emptyCashForm);
    setModalError("");
  };

  const openAddHolderModal = () => {
    setHolderName("");
    setAddHolderError("");
    setAddHolderModal(true);
  };

  const closeAddHolderModal = () => {
    setAddHolderModal(false);
    setHolderName("");
    setAddHolderError("");
  };

  const submitAddHolder = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      createHolder({ name: holderName });
      closeAddHolderModal();
    } catch (error) {
      setAddHolderError(error instanceof Error ? error.message : "新增失敗");
    }
  };

  const openAddAccountModal = (holderId: number, holderName: string) => {
    setAddAccountForm(emptyAddAccountForm);
    setAddAccountError("");
    setAddAccountModal({ holderId, holderName });
  };

  const closeAddAccountModal = () => {
    setAddAccountModal(null);
    setAddAccountForm(emptyAddAccountForm);
    setAddAccountError("");
  };

  const submitAddAccount = (event: React.FormEvent) => {
    event.preventDefault();
    if (!addAccountModal) return;

    try {
      createAccount({
        holderId: addAccountModal.holderId,
        name: addAccountForm.name,
        currency: addAccountForm.currency
      });
      closeAddAccountModal();
    } catch (error) {
      setAddAccountError(error instanceof Error ? error.message : "新增失敗");
    }
  };

  const openRenameModal = (target: RenameTarget) => {
    setRenameTarget(target);
    setRenameValue(target.name);
    setRenameError("");
  };

  const closeRenameModal = () => {
    setRenameTarget(null);
    setRenameValue("");
    setRenameError("");
  };

  const submitRename = (event: React.FormEvent) => {
    event.preventDefault();
    if (!renameTarget) return;
    try {
      if (renameTarget.kind === "holder") {
        renameHolder({ holderId: renameTarget.id, name: renameValue });
      } else {
        renameAccount({ accountId: renameTarget.id, name: renameValue });
      }
      closeRenameModal();
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "更名失敗");
    }
  };

  const openDeleteModal = (target: DeleteTarget) => {
    setDeleteTarget(target);
    setDeleteError("");
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteError("");
  };

  const submitDelete = () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === "holder") {
        deleteHolder({ holderId: deleteTarget.id });
      } else {
        deleteAccount({ accountId: deleteTarget.id });
      }
      closeDeleteModal();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "刪除失敗");
    }
  };

  const submitCashAdjustment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!cashModal) return;

    try {
      adjustAccount({
        accountId: cashModal.accountId,
        direction: cashModal.direction,
        amount: modalForm.amount,
        note: modalForm.note,
        withdrawType: modalForm.withdrawType
      });
      closeCashModal();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "操作失敗");
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>帳戶功能</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openAccountTransferModal}>
              <ArrowLeftRight className="h-4 w-4" />
              帳戶轉帳
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={openAddHolderModal}>
              <UserPlus className="h-4 w-4" />
              新增持有人
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {holderGroups.map((group) => (
          <Card key={group.holder.id}>
            <CardHeader className="gap-3 border-b">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{group.holder.name}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{group.accounts.length} 個帳戶</p>
                </div>
                <GearActionsMenu
                  title="持有人設定"
                  items={[
                    {
                      label: "更名",
                      icon: <Pencil className="h-4 w-4 shrink-0" />,
                      onClick: () => openRenameModal({ kind: "holder", id: group.holder.id, name: group.holder.name })
                    },
                    {
                      label: "新增帳戶",
                      icon: <Plus className="h-4 w-4 shrink-0" />,
                      onClick: () => openAddAccountModal(group.holder.id, group.holder.name)
                    },
                    {
                      label: "刪除持有人",
                      icon: <Trash2 className="h-4 w-4 shrink-0" />,
                      destructive: true,
                      onClick: () => openDeleteModal({ kind: "holder", id: group.holder.id, name: group.holder.name })
                    }
                  ]}
                />
              </div>
              <div className="flex items-center justify-between gap-3 font-semibold">
                <p className={cn("text-[1.05rem]", twd.text)}>{fmtMoney(group.twdTotal, "TWD")}</p>
                <p className={cn("text-[1.05rem]", rmb.text)}>{fmtMoney(group.rmbTotal, "RMB")}</p>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
              {group.accounts.map((account) => (
                <div key={account.id} className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="font-medium leading-snug">{account.name}</p>
                      <Badge tone={account.currency === "RMB" ? "rmb" : "twd"}>{account.currency}</Badge>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <CashActionsMenu
                        onDeposit={() => openCashModal(account.id, "in")}
                        onWithdraw={() => openCashModal(account.id, "out")}
                      />
                      <GearActionsMenu
                        title="帳戶設定"
                        size="sm"
                        items={[
                          {
                            label: "更名",
                            icon: <Pencil className="h-4 w-4 shrink-0" />,
                            onClick: () => openRenameModal({ kind: "account", id: account.id, name: account.name })
                          },
                          {
                            label: "刪除帳戶",
                            icon: <Trash2 className="h-4 w-4 shrink-0" />,
                            destructive: true,
                            disabled: !canDeleteAccount(account, state),
                            title: canDeleteAccount(account, state)
                              ? undefined
                              : "帳戶仍有餘額或庫存，無法刪除",
                            onClick: () => openDeleteModal({ kind: "account", id: account.id, name: account.name })
                          }
                        ]}
                      />
                    </div>
                  </div>
                  <p className={cn("mt-3 text-xl font-semibold", account.currency === "RMB" ? rmb.text : twd.text)}>
                    {fmtMoney(account.balance, account.currency)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>近期現金流水</CardTitle>
          <Link className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium" to="/ledger">
            查看全部
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <PaginatedLedgerTable entries={ledgerRows} />
        </CardContent>
      </Card>

      {renameTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeRenameModal}>
          <Card className="w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b">
              <CardTitle>{renameTarget.kind === "holder" ? "更名持有人" : "更名帳戶"}</CardTitle>
              <Button aria-label="關閉" onClick={closeRenameModal} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              <form className="grid gap-3" onSubmit={submitRename}>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-muted-foreground">名稱</span>
                  <Input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    required
                    autoFocus
                  />
                </label>
                {renameError ? <p className="text-sm text-destructive">{renameError}</p> : null}
                <Button type="submit" className="w-full">
                  確認更名
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeDeleteModal}>
          <Card className="w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b">
              <CardTitle>確認刪除</CardTitle>
              <Button aria-label="關閉" onClick={closeDeleteModal} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <p className="text-sm text-muted-foreground">
                {deleteTarget.kind === "holder"
                  ? `確定要刪除持有人「${deleteTarget.name}」及其旗下所有帳戶嗎？旗下帳戶須皆無餘額與庫存。`
                  : `確定要刪除帳戶「${deleteTarget.name}」嗎？僅限餘額為 0 時可刪除。`}
              </p>
              {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={closeDeleteModal}>
                  取消
                </Button>
                <Button type="button" variant="destructive" onClick={submitDelete}>
                  確認刪除
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {addHolderModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeAddHolderModal}>
          <Card className="w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b">
              <CardTitle>新增持有人</CardTitle>
              <Button aria-label="關閉" onClick={closeAddHolderModal} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              <form className="grid gap-3" onSubmit={submitAddHolder}>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-muted-foreground">持有人名稱</span>
                  <Input
                    placeholder="例如：小王、合作夥伴 A"
                    value={holderName}
                    onChange={(event) => setHolderName(event.target.value)}
                    required
                    autoFocus
                  />
                </label>
                {addHolderError ? <p className="text-sm text-destructive">{addHolderError}</p> : null}
                <Button type="submit" className="w-full">
                  <UserPlus className="h-4 w-4" />
                  確認新增
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {addAccountModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeAddAccountModal}>
          <Card className="w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b">
              <div>
                <CardTitle>新增帳戶</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">持有者：{addAccountModal.holderName}</p>
              </div>
              <Button aria-label="關閉" onClick={closeAddAccountModal} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              <form className="grid gap-3" onSubmit={submitAddAccount}>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-muted-foreground">帳戶名稱</span>
                  <Input
                    placeholder="例如：台幣現金、支付寶 RMB"
                    value={addAccountForm.name}
                    onChange={(event) => setAddAccountForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    autoFocus
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-muted-foreground">幣別</span>
                  <Select
                    value={addAccountForm.currency}
                    onChange={(event) =>
                      setAddAccountForm((current) => ({ ...current, currency: event.target.value as Currency }))
                    }
                  >
                    <option value="TWD">TWD 台幣</option>
                    <option value="RMB">RMB 人民幣</option>
                  </Select>
                </label>
                {addAccountError ? <p className="text-sm text-destructive">{addAccountError}</p> : null}
                <Button type="submit" className="w-full">
                  <Plus className="h-4 w-4" />
                  確認新增
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {cashModal && modalAccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeCashModal}>
          <Card className="w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-4 border-b">
              <div>
                <CardTitle>{cashModal.direction === "in" ? "入金" : "出金"}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {modalAccount.holderName} / {modalAccount.name} · 目前餘額 {fmtMoney(modalAccount.balance, modalAccount.currency)}
                </p>
              </div>
              <Button aria-label="關閉" onClick={closeCashModal} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              <form className="grid gap-3" onSubmit={submitCashAdjustment}>
                <Input
                  inputMode="decimal"
                  placeholder={`金額 ${modalAccount.currency}`}
                  value={modalForm.amount}
                  onChange={(event) => setModalForm((current) => ({ ...current, amount: event.target.value }))}
                  required
                  autoFocus
                />
                <Input
                  placeholder="備註，可留空"
                  value={modalForm.note}
                  onChange={(event) => setModalForm((current) => ({ ...current, note: event.target.value }))}
                />
                {cashModal.direction === "out" && modalAccount.currency === "TWD" ? (
                  <Select
                    value={modalForm.withdrawType}
                    onChange={(event) =>
                      setModalForm((current) => ({
                        ...current,
                        withdrawType: event.target.value as "capital" | "profit"
                      }))
                    }
                  >
                    <option value="capital">出金用途：撤資</option>
                    <option value="profit">出金用途：分潤</option>
                  </Select>
                ) : null}
                {modalError ? <p className="text-sm text-destructive">{modalError}</p> : null}
                <Button type="submit" className="w-full">
                  {cashModal.direction === "in" ? (
                    <>
                      <ArrowDownToLine className="h-4 w-4" />
                      確認入金
                    </>
                  ) : (
                    <>
                      <ArrowUpFromLine className="h-4 w-4" />
                      確認出金
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
