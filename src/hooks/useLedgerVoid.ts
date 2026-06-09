import * as React from "react";
import type { LedgerTableRow } from "../components/LedgerTable";
import { useAppStore } from "../features/AppStore";
import { canWriteLedger } from "../lib/permissions";
import { canVoidLedgerEntry, type ReversalTarget } from "../lib/reversalUi";

export function useLedgerVoid() {
  const { state, sessionUser, reverseOperation } = useAppStore();
  const canVoid = canWriteLedger(sessionUser);
  const [pending, setPending] = React.useState<{ entry: LedgerTableRow; target: ReversalTarget } | null>(null);
  const [error, setError] = React.useState("");

  const resolveVoidTarget = React.useCallback(
    (entry: LedgerTableRow) => (canVoid ? canVoidLedgerEntry(state, entry) : null),
    [canVoid, state]
  );

  const requestVoid = React.useCallback((entry: LedgerTableRow, target: ReversalTarget) => {
    setError("");
    setPending({ entry, target });
  }, []);

  const cancelVoid = React.useCallback(() => {
    setPending(null);
    setError("");
  }, []);

  const confirmVoid = React.useCallback(async () => {
    if (!pending) return;
    try {
      await reverseOperation({
        entityType: pending.target.entityType,
        entityId: pending.target.entityId
      });
      setPending(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "作廢失敗");
    }
  }, [pending, reverseOperation]);

  return {
    resolveVoidTarget,
    requestVoid,
    pending,
    error,
    cancelVoid,
    confirmVoid
  };
}
