import { modalOverlayClass } from "../lib/formStyles";
import { cn } from "../lib/utils";
import { PortalOverlay } from "./PortalOverlay";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type DeleteConfirmDialogProps = {
  open: boolean;
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteConfirmDialog({
  open,
  title = "確認刪除",
  description,
  confirmLabel = "確認刪除",
  cancelLabel = "取消",
  error,
  onClose,
  onConfirm
}: DeleteConfirmDialogProps) {
  if (!open) return null;

  return (
    <PortalOverlay>
      <div className={cn(modalOverlayClass, "z-[70]")} onClick={onClose}>
        <Card className="w-full max-w-sm overflow-hidden" onClick={(event) => event.stopPropagation()}>
          <CardHeader className="border-b p-3 sm:p-4">
            <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-3 sm:p-4">
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{description}</p>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={onClose}>
                {cancelLabel}
              </Button>
              <Button type="button" variant="destructive" className="h-10" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalOverlay>
  );
}
