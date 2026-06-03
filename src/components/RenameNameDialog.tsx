import { X } from "lucide-react";
import { PortalOverlay } from "./PortalOverlay";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type RenameNameDialogProps = {
  open: boolean;
  title: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function RenameNameDialog({ open, title, value, error, onChange, onClose, onSave }: RenameNameDialogProps) {
  if (!open) return null;

  return (
    <PortalOverlay>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <div
          className="w-full max-w-sm space-y-3 rounded-lg border bg-card p-4 shadow-lg"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-dialog-title"
        >
          <div className="flex items-center justify-between">
            <p id="rename-dialog-title" className="font-semibold">
              {title}
            </p>
            <Button type="button" variant="ghost" size="icon" aria-label="關閉" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSave();
              }
            }}
            autoFocus
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              取消
            </Button>
            <Button type="button" className="flex-1" onClick={onSave}>
              儲存
            </Button>
          </div>
        </div>
      </div>
    </PortalOverlay>
  );
}
