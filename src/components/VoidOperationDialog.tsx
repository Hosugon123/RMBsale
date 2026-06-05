import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

type VoidOperationDialogProps = {
  open: boolean;
  title?: string;
  description?: string;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function VoidOperationDialog({
  open,
  title = "確認作廢",
  description = "作廢會以沖銷方式還原帳戶餘額與庫存，並保留原始流水供稽核。確定要作廢這筆操作嗎？",
  error,
  onClose,
  onConfirm
}: VoidOperationDialogProps) {
  if (!open) return null;
  return (
    <DeleteConfirmDialog
      open={open}
      title={title}
      description={description}
      error={error}
      confirmLabel="確認作廢"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
