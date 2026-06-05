import { Pencil, Plus, RefreshCw, Shield, Trash2, Upload, X } from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";
import { isAdmin } from "../components/AdminRoute";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { ChannelListManager } from "../components/ChannelListManager";
import { DeleteConfirmDialog } from "../components/DeleteConfirmDialog";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/table";
import { useAppStore } from "../features/AppStore";
import { useServerDataMode } from "../lib/serverApi";
import {
  detectLevel,
  LEVEL_PRESETS,
  levelLabel,
  PERMISSION_GROUPS,
  permissionsSummary
} from "../lib/permissions";
import { parseBusinessImportJson, summarizeBusinessImport } from "../lib/dataImport";
import { cn } from "../lib/utils";
import type { AppUser, PermissionKey, UserLevel } from "../lib/types";

const adminCardHeader = "gap-2 p-3 pb-2 sm:p-4 sm:pb-0";
const adminCardContent = "p-3 pt-0 sm:p-4";
const adminModalOverlay = "fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4";
const adminModalCard = "max-h-[92dvh] w-full max-w-lg overflow-hidden rounded-t-2xl border-b-0 sm:rounded-lg sm:border-b";

type UserFormState = {
  username: string;
  password: string;
  displayName: string;
  level: UserLevel;
};

const emptyCreateForm: UserFormState = {
  username: "",
  password: "",
  displayName: "",
  level: "operator"
};

function UserPermissionEditor({
  level,
  permissions,
  onLevelChange,
  onTogglePermission
}: {
  level: UserLevel;
  permissions: PermissionKey[];
  onLevelChange: (level: Exclude<UserLevel, "custom"> | "custom") => void;
  onTogglePermission: (key: PermissionKey, checked: boolean) => void;
}) {
  return (
    <>
      <label className="block space-y-1 text-sm font-medium">
        <span>等級範本</span>
        <Select
          className="h-10 w-full"
          value={level === "custom" ? "custom" : level}
          onChange={(event) => onLevelChange(event.target.value as Exclude<UserLevel, "custom"> | "custom")}
        >
          <option value="admin">管理員（全部權限）</option>
          <option value="operator">操作員（業務操作）</option>
          <option value="readonly">唯讀（儀表板／流水／庫存）</option>
          <option value="custom">自訂（手動勾選）</option>
        </Select>
      </label>
      <div className="space-y-3">
        <p className="text-sm font-medium">功能權限</p>
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.title} className="rounded-md border bg-background/40 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{group.title}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.items.map((item) => (
                <label key={item.key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={permissions.includes(item.key)}
                    onChange={(event) => onTogglePermission(item.key, event.target.checked)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function AdminPage() {
  const serverMode = useServerDataMode();
  const { state, sessionUser, resetDemo, clearData, importBusinessData, createUser, updateUser, setUserActive } =
    useAppStore();
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = React.useState("");
  const [clearConfirmOpen, setClearConfirmOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState(emptyCreateForm);
  const [createPermissions, setCreatePermissions] = React.useState<PermissionKey[]>([...LEVEL_PRESETS.operator.permissions]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editUserId, setEditUserId] = React.useState<number | null>(null);
  const [editForm, setEditForm] = React.useState<UserFormState>(emptyCreateForm);
  const [editPermissions, setEditPermissions] = React.useState<PermissionKey[]>([]);
  const [formError, setFormError] = React.useState("");

  if (!isAdmin(sessionUser)) {
    return <p className="text-sm text-muted-foreground">僅管理員可存取管理後台。</p>;
  }

  const applyLevel = (
    level: Exclude<UserLevel, "custom">,
    setPermissions: React.Dispatch<React.SetStateAction<PermissionKey[]>>,
    setForm: React.Dispatch<React.SetStateAction<UserFormState>>
  ) => {
    setForm((current) => ({ ...current, level }));
    setPermissions([...LEVEL_PRESETS[level].permissions]);
  };

  const togglePermission = (
    key: PermissionKey,
    checked: boolean,
    setPermissions: React.Dispatch<React.SetStateAction<PermissionKey[]>>,
    setForm: React.Dispatch<React.SetStateAction<UserFormState>>
  ) => {
    setPermissions((current) => {
      const next = checked ? [...new Set([...current, key])] : current.filter((item) => item !== key);
      setForm((value) => ({ ...value, level: detectLevel(next) }));
      return next;
    });
  };

  const openCreate = () => {
    setCreateForm(emptyCreateForm);
    applyLevel("operator", setCreatePermissions, setCreateForm);
    setFormError("");
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setFormError("");
  };

  const openEdit = (user: AppUser) => {
    setCreateOpen(false);
    setEditUserId(user.id);
    setEditForm({
      username: user.username,
      password: "",
      displayName: user.displayName,
      level: detectLevel(user.permissions)
    });
    setEditPermissions([...user.permissions]);
    setFormError("");
  };

  const closeEdit = () => {
    setEditUserId(null);
    setFormError("");
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    try {
      await Promise.resolve(
        createUser({
          username: createForm.username,
          password: createForm.password,
          displayName: createForm.displayName,
          permissions: createPermissions
        })
      );
      closeCreate();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "建立使用者失敗");
    }
  };

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editUserId === null) return;
    setFormError("");
    try {
      await Promise.resolve(
        updateUser(editUserId, {
          username: editForm.username,
          password: editForm.password || undefined,
          displayName: editForm.displayName,
          permissions: editPermissions
        })
      );
      closeEdit();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "更新使用者失敗");
    }
  };

  const editingUser = editUserId === null ? undefined : state.users.find((user) => user.id === editUserId);

  const confirmClearData = async () => {
    try {
      await Promise.resolve(clearData());
      setClearConfirmOpen(false);
      setImportMessage("已清除所有帳務資料，可開始匯入試算表資料。");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "清除資料失敗");
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportMessage("");
    try {
      const text = await file.text();
      const payload = parseBusinessImportJson(text);
      if (
        !window.confirm(
          `即將匯入：持有人 ${payload.holders?.length ?? 0}、帳戶 ${payload.accounts?.length ?? 0}、客戶 ${payload.customers?.length ?? 0}、渠道 ${payload.channels?.length ?? 0}、買入 ${payload.purchases?.length ?? 0}、售出 ${payload.sales?.length ?? 0}、流水 ${payload.ledger?.length ?? 0} 筆。\n\n會覆蓋現有帳務資料，是否繼續？`
        )
      ) {
        return;
      }
      await Promise.resolve(importBusinessData(payload));
      const summary = summarizeBusinessImport(payload);
      setImportMessage(
        `匯入完成：帳戶 ${summary.accounts}、客戶 ${summary.customers}、買入 ${summary.purchases}、售出 ${summary.sales}、流水 ${summary.ledger} 筆。`
      );
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "匯入失敗");
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-3 sm:space-y-4 xl:grid xl:grid-cols-2 xl:gap-4 xl:space-y-0">
      <Card className="min-w-0 xl:col-span-1">
        <CardHeader className={cn(adminCardHeader, "flex-col items-stretch sm:flex-row sm:items-center sm:justify-between")}>
          <CardTitle className="text-base sm:text-lg">系統設定</CardTitle>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Link
              to="/admin/backup"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-input bg-background/40 px-3 text-sm font-medium sm:w-auto"
            >
              <Shield className="h-4 w-4 shrink-0" />
              備份與稽核
            </Link>
            <Button variant="destructive" size="sm" className="h-10 w-full sm:w-auto" onClick={() => setClearConfirmOpen(true)}>
              <Trash2 className="h-4 w-4 shrink-0" />
              清除數據
            </Button>
            {!serverMode ? (
              <Button variant="outline" size="sm" className="h-10 w-full sm:w-auto" onClick={resetDemo}>
                <RefreshCw className="h-4 w-4 shrink-0" />
                重置 demo
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className={cn(adminCardContent, "space-y-4 text-sm text-muted-foreground")}>
          <div className="space-y-2">
            <p>本機 demo 將使用者與權限存在 localStorage，密碼僅供示範，正式環境請改用 API 雜湊儲存。</p>
            <p>
              <span className="font-medium text-foreground">清除數據</span>：刪除所有帳務紀錄，保留使用者，方便匯入試算表前測試。
            </p>
            <p>
              <span className="font-medium text-foreground">重置 demo</span>：還原內建示範資料。
            </p>
          </div>
          <div className="space-y-3 rounded-md border border-dashed border-border/80 bg-muted/20 p-3 sm:p-4">
            <p className="font-medium text-foreground">試算表匯入（JSON）</p>
            <p className="text-xs leading-relaxed sm:text-sm">
              請先將 Google 試算表／Excel 整理成系統 JSON 格式後匯入。若你提供試算表檔案，我可協助對應欄位並產生匯入檔。
            </p>
            <p className="text-xs leading-relaxed sm:text-sm">
              建議流程：清除數據 → 選擇 JSON 檔匯入 → 至各頁面核對餘額與流水。
            </p>
            <a
              className="inline-block text-sm text-primary underline"
              href="/import-template.json"
              download="import-template.json"
            >
              下載 JSON 範本
            </a>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-10 w-full"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 shrink-0" />
              選擇 JSON 匯入
            </Button>
            {importMessage ? (
              <p
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs sm:text-sm",
                  importMessage.startsWith("匯入完成") || importMessage.startsWith("已清除")
                    ? "bg-muted/50 text-foreground"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {importMessage}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 xl:col-span-2">
        <CardHeader className={cn(adminCardHeader, "flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between")}>
          <CardTitle className="text-base sm:text-lg">使用者管理</CardTitle>
          <Button size="sm" className="h-10 w-full shrink-0 sm:w-auto" onClick={openCreate}>
            <Plus className="h-4 w-4 shrink-0" />
            新增使用者
          </Button>
        </CardHeader>
        <CardContent className={adminCardContent}>
          {formError && !createOpen && !editUserId ? (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>
          ) : null}
          <div className="space-y-2 md:hidden">
            {state.users.map((user) => (
              <article
                key={user.id}
                className="rounded-lg border border-border/80 bg-muted/15 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{user.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-xs",
                      user.isActive ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {user.isActive ? "啟用" : "停用"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {levelLabel(detectLevel(user.permissions))} · {permissionsSummary(user.permissions)}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => openEdit(user)}>
                    <Pencil className="h-3.5 w-3.5" />
                    編輯
                  </Button>
                  {user.id !== sessionUser.id ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => {
                        void (async () => {
                          try {
                            await Promise.resolve(setUserActive(user.id, !user.isActive));
                            setFormError("");
                          } catch (error) {
                            setFormError(error instanceof Error ? error.message : "更新狀態失敗");
                          }
                        })();
                      }}
                    >
                      {user.isActive ? "停用" : "啟用"}
                    </Button>
                  ) : (
                    <span className="flex h-9 items-center justify-center text-xs text-muted-foreground">目前登入</span>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <THead>
                <TR>
                  <TH>帳號</TH>
                  <TH>名稱</TH>
                  <TH>等級</TH>
                  <TH>權限</TH>
                  <TH>狀態</TH>
                  <TH className="text-right">操作</TH>
                </TR>
              </THead>
              <TBody>
                {state.users.map((user) => (
                  <TR key={user.id}>
                    <TD className="font-medium">{user.username}</TD>
                    <TD>{user.displayName}</TD>
                    <TD>{levelLabel(detectLevel(user.permissions))}</TD>
                    <TD className="text-muted-foreground">{permissionsSummary(user.permissions)}</TD>
                    <TD>{user.isActive ? "啟用" : "停用"}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" />
                          編輯
                        </Button>
                        {user.id !== sessionUser.id ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void (async () => {
                                try {
                                  await Promise.resolve(setUserActive(user.id, !user.isActive));
                                } catch (error) {
                                  setFormError(error instanceof Error ? error.message : "更新狀態失敗");
                                }
                              })();
                            }}
                          >
                            {user.isActive ? "停用" : "啟用"}
                          </Button>
                        ) : (
                          <span className="inline-flex h-8 items-center px-2 text-xs text-muted-foreground">目前登入</span>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className={adminCardHeader}>
          <CardTitle className="text-base sm:text-lg">持有人</CardTitle>
        </CardHeader>
        <CardContent className={adminCardContent}>
          <ul className="space-y-2 md:hidden">
            {state.holders.map((holder) => (
              <li
                key={holder.id}
                className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/15 px-3 py-2.5"
              >
                <span className="font-medium">{holder.name}</span>
                <span className="text-xs text-muted-foreground">{holder.isActive ? "啟用" : "停用"}</span>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>名稱</TH>
                  <TH>狀態</TH>
                </TR>
              </THead>
              <TBody>
                {state.holders.map((holder) => (
                  <TR key={holder.id}>
                    <TD>{holder.name}</TD>
                    <TD>{holder.isActive ? "啟用" : "停用"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className={adminCardHeader}>
          <CardTitle className="text-base sm:text-lg">常用渠道</CardTitle>
        </CardHeader>
        <CardContent className={adminCardContent}>
          <ChannelListManager />
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={clearConfirmOpen}
        title="確認清除數據"
        description={
          "確定要清除所有帳務資料嗎？\n\n將刪除：帳戶、客戶、渠道、買入、售出、庫存與流水。\n使用者帳號會保留。\n\n此操作無法復原。"
        }
        confirmLabel="確認清除"
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={confirmClearData}
      />

      {createOpen ? (
        <div className={adminModalOverlay} onClick={closeCreate}>
          <Card className={adminModalCard} onClick={(event) => event.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-3 border-b p-3 sm:gap-4 sm:p-4">
              <CardTitle>新增使用者</CardTitle>
              <Button aria-label="關閉" onClick={closeCreate} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[calc(92dvh-4.5rem)] overflow-y-auto overscroll-contain p-3 sm:max-h-[calc(90vh-5rem)] sm:p-4">
              <form className="space-y-4" onSubmit={submitCreate}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block space-y-1 text-sm font-medium">
                    <span>帳號</span>
                    <Input
                      value={createForm.username}
                      onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))}
                      placeholder="登入帳號"
                      required
                    />
                  </label>
                  <label className="block space-y-1 text-sm font-medium">
                    <span>密碼</span>
                    <Input
                      type="password"
                      value={createForm.password}
                      onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="至少 4 碼"
                      required
                    />
                  </label>
                  <label className="block space-y-1 text-sm font-medium sm:col-span-2">
                    <span>名稱</span>
                    <Input
                      value={createForm.displayName}
                      onChange={(event) => setCreateForm((current) => ({ ...current, displayName: event.target.value }))}
                      placeholder="顯示名稱"
                      required
                    />
                  </label>
                </div>
                <UserPermissionEditor
                  level={createForm.level}
                  permissions={createPermissions}
                  onLevelChange={(value) => {
                    if (value === "custom") {
                      setCreateForm((current) => ({ ...current, level: "custom" }));
                      return;
                    }
                    applyLevel(value, setCreatePermissions, setCreateForm);
                  }}
                  onTogglePermission={(key, checked) => togglePermission(key, checked, setCreatePermissions, setCreateForm)}
                />
                {formError && createOpen && !editUserId ? <p className="text-sm text-destructive">{formError}</p> : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button type="button" variant="outline" className="h-10 flex-1" onClick={closeCreate}>
                    取消
                  </Button>
                  <Button type="submit" className="h-10 flex-1">
                    <Plus className="h-4 w-4" />
                    建立帳戶
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {editingUser ? (
        <div className={adminModalOverlay} onClick={closeEdit}>
          <Card className={adminModalCard} onClick={(event) => event.stopPropagation()}>
            <CardHeader className="flex-row items-start justify-between gap-3 border-b p-3 sm:gap-4 sm:p-4">
              <CardTitle>編輯使用者</CardTitle>
              <Button aria-label="關閉" onClick={closeEdit} size="icon" variant="ghost">
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[calc(92dvh-4.5rem)] overflow-y-auto overscroll-contain p-3 sm:max-h-[calc(90vh-5rem)] sm:p-4">
              <form className="space-y-4" onSubmit={submitEdit}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block space-y-1 text-sm font-medium">
                    <span>帳號</span>
                    <Input
                      value={editForm.username}
                      onChange={(event) => setEditForm((current) => ({ ...current, username: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="block space-y-1 text-sm font-medium">
                    <span>密碼</span>
                    <Input
                      type="password"
                      value={editForm.password}
                      onChange={(event) => setEditForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="留空則不變更"
                    />
                  </label>
                  <label className="block space-y-1 text-sm font-medium sm:col-span-2">
                    <span>名稱</span>
                    <Input
                      value={editForm.displayName}
                      onChange={(event) => setEditForm((current) => ({ ...current, displayName: event.target.value }))}
                      required
                    />
                  </label>
                </div>
                <UserPermissionEditor
                  level={editForm.level}
                  permissions={editPermissions}
                  onLevelChange={(value) => {
                    if (value === "custom") {
                      setEditForm((current) => ({ ...current, level: "custom" }));
                      return;
                    }
                    applyLevel(value, setEditPermissions, setEditForm);
                  }}
                  onTogglePermission={(key, checked) => togglePermission(key, checked, setEditPermissions, setEditForm)}
                />
                {formError && editUserId ? <p className="text-sm text-destructive">{formError}</p> : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button type="button" variant="outline" className="h-10 flex-1" onClick={closeEdit}>
                    取消
                  </Button>
                  <Button type="submit" className="h-10 flex-1">
                    儲存變更
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
