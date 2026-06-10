import * as React from "react";
import { RefreshCw } from "lucide-react";
import { applyPendingPwaUpdate, setupPwaUpdate, type PwaUpdateStatus } from "../lib/pwaUpdate";
import { Button } from "./ui/button";

const STATUS_MESSAGE: Record<Exclude<PwaUpdateStatus, "hidden">, string> = {
  pending: "有新版本可用，請點「立即更新」",
  waiting_mutation: "新版本已就緒，請先完成目前操作再更新",
  updating: "正在更新，請稍候…"
};

export function PwaUpdateHost() {
  const [status, setStatus] = React.useState<PwaUpdateStatus>("hidden");

  React.useEffect(() => setupPwaUpdate(setStatus), []);

  if (status === "hidden") return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-[100] flex justify-center sm:left-auto sm:right-4 sm:max-w-md">
      <div className="flex w-full items-center gap-3 rounded-lg border border-primary/30 bg-background/95 px-3 py-2.5 text-sm shadow-lg backdrop-blur">
        <RefreshCw className={cnIcon(status)} />
        <p className="min-w-0 flex-1 leading-snug">{STATUS_MESSAGE[status]}</p>
        {status === "pending" || status === "waiting_mutation" ? (
          <Button type="button" size="sm" variant="outline" className="shrink-0 h-8" onClick={applyPendingPwaUpdate}>
            立即更新
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function cnIcon(status: PwaUpdateStatus) {
  return status === "updating" ? "h-4 w-4 shrink-0 animate-spin text-primary" : "h-4 w-4 shrink-0 text-primary";
}
