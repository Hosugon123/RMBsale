import { Settings, X } from "lucide-react";
import { CustomerListManager } from "./CustomerListManager";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type CustomerManagerModalProps = {
  open: boolean;
  onClose: () => void;
};

export function CustomerManagerModal({ open, onClose }: CustomerManagerModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <Card className="max-h-[88vh] w-full max-w-lg overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-start justify-between gap-4 border-b">
          <div>
            <CardTitle>常用客戶</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">管理售出錄入的常用客戶選項</p>
          </div>
          <Button aria-label="關閉" onClick={onClose} size="icon" variant="ghost">
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="max-h-[calc(88vh-5rem)] overflow-y-auto p-4">
          <CustomerListManager />
        </CardContent>
      </Card>
    </div>
  );
}

export function CustomerManageButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Settings className="h-3.5 w-3.5" />
      管理常用
    </Button>
  );
}
