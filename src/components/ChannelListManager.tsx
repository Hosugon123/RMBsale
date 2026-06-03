import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useAppStore } from "../features/AppStore";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { PresetCreateRow } from "./PresetCreateRow";
import { RenameNameDialog } from "./RenameNameDialog";
import { Button } from "./ui/button";
import { Table, TBody, TD, TH, THead, TR } from "./ui/table";

export function ChannelListManager() {
  const { state, createChannel, renameChannel, deleteChannel } = useAppStore();
  const [newName, setNewName] = React.useState("");
  const [renameId, setRenameId] = React.useState<number | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renameError, setRenameError] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: number; name: string } | null>(null);
  const [error, setError] = React.useState("");

  const sortedChannels = React.useMemo(
    () =>
      [...state.channels]
        .filter((channel) => channel.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant")),
    [state.channels]
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
      setRenameError("請輸入渠道名稱");
      return;
    }
    setRenameError("");
    try {
      renameChannel({ channelId: renameId, name });
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
        placeholder="新增常用渠道名稱"
        emptyError="請輸入渠道名稱"
        onCreate={(name) => createChannel({ name })}
      />

      {sortedChannels.length > 0 ? (
        <div className="space-y-2 md:hidden">
          {sortedChannels.map((channel) => (
            <article
              key={channel.id}
              className="rounded-lg border border-border/80 bg-muted/15 px-3 py-3"
            >
              <p className="font-medium leading-snug">{channel.name}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setRenameId(channel.id);
                    setRenameValue(channel.name);
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
                  className="h-9"
                  onClick={() => {
                    setError("");
                    setDeleteTarget({ id: channel.id, name: channel.name });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  刪除
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground md:hidden">
          尚無常用渠道，請先新增。
        </p>
      )}

      <div className="hidden overflow-x-auto rounded-md border md:block">
        <Table>
          <THead>
            <TR>
              <TH>名稱</TH>
              <TH className="text-right">操作</TH>
            </TR>
          </THead>
          <TBody>
            {sortedChannels.length > 0 ? (
              sortedChannels.map((channel) => (
                <TR key={channel.id}>
                  <TD className="font-medium">{channel.name}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRenameId(channel.id);
                          setRenameValue(channel.name);
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
                          setDeleteTarget({ id: channel.id, name: channel.name });
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
                  尚無常用渠道，請先新增。
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        刪除僅自常用清單移除，不影響既有買入與帳務；可再次新增同名渠道以恢復常用。
      </p>

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        description={
          deleteTarget
            ? `確定要從常用清單移除「${deleteTarget.name}」嗎？僅影響買入登記的常用選項，不會刪除或變更既有買入與帳務資料。`
            : ""
        }
        error={error}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          run(
            () => deleteChannel(deleteTarget.id),
            () => setDeleteTarget(null)
          );
        }}
      />

      <RenameNameDialog
        open={renameId !== null}
        title="更名渠道"
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
