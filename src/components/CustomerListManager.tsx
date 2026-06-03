import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useAppStore } from "../features/AppStore";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { PresetCreateRow } from "./PresetCreateRow";
import { RenameNameDialog } from "./RenameNameDialog";
import { Button } from "./ui/button";
import { Table, TBody, TD, TH, THead, TR } from "./ui/table";

export function CustomerListManager() {
  const { state, createCustomer, renameCustomer, deleteCustomer } = useAppStore();
  const [newName, setNewName] = React.useState("");
  const [renameId, setRenameId] = React.useState<number | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renameError, setRenameError] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: number; name: string } | null>(null);
  const [error, setError] = React.useState("");

  const sortedCustomers = React.useMemo(
    () =>
      [...state.customers]
        .filter((customer) => customer.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant")),
    [state.customers]
  );

  const run = (action: () => void, onSuccess?: () => void) => {
    setError("");
    try {
      action();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    }
  };

  const submitRename = () => {
    if (renameId === null) return;
    const name = renameValue.trim();
    if (!name) {
      setRenameError("請輸入客戶名稱");
      return;
    }
    setRenameError("");
    try {
      renameCustomer({ customerId: renameId, name });
      setRenameId(null);
      setRenameValue("");
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "更名失敗");
    }
  };

  return (
    <div className="space-y-4">
      <PresetCreateRow
        value={newName}
        onChange={setNewName}
        placeholder="新增常用客戶名稱"
        emptyError="請輸入客戶名稱"
        onCreate={(name) => createCustomer({ name })}
      />

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <THead>
            <TR>
              <TH>名稱</TH>
              <TH className="text-right">操作</TH>
            </TR>
          </THead>
          <TBody>
            {sortedCustomers.length > 0 ? (
              sortedCustomers.map((customer) => (
                <TR key={customer.id}>
                  <TD className="font-medium">{customer.name}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRenameId(customer.id);
                          setRenameValue(customer.name);
                          setRenameError("");
                          setError("");
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        更名
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setError("");
                          setDeleteTarget({ id: customer.id, name: customer.name });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        刪除
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))
            ) : (
              <TR>
                <TD colSpan={2} className="py-6 text-center text-muted-foreground">
                  尚無常用客戶，請先新增。
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        刪除僅自常用清單移除，不影響既有訂單、應收與帳務；可再次新增同名客戶以恢復常用。更名會同步更新該客戶的售出紀錄顯示名稱。
      </p>

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        description={
          deleteTarget
            ? `確定要從常用清單移除「${deleteTarget.name}」嗎？僅影響售出錄入的常用選項，不會刪除或變更既有訂單與帳務資料。`
            : ""
        }
        error={error}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          run(
            () => deleteCustomer(deleteTarget.id),
            () => setDeleteTarget(null)
          );
        }}
      />

      <RenameNameDialog
        open={renameId !== null}
        title="更名客戶"
        value={renameValue}
        error={renameError}
        onChange={setRenameValue}
        onClose={() => {
          setRenameId(null);
          setRenameValue("");
          setRenameError("");
        }}
        onSave={submitRename}
      />
    </div>
  );
}
