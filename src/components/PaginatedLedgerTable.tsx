import * as React from "react";
import type { ReversalTarget } from "../lib/reversalUi";
import { LedgerTable, type LedgerTableRow } from "./LedgerTable";
import { NumberPagination } from "./NumberPagination";
import { cn } from "../lib/utils";

export const LEDGER_PAGE_SIZE = 10;

type PaginatedLedgerTableProps = {
  entries: LedgerTableRow[];
  emptyMessage?: string;
  pageSize?: number;
  className?: string;
  layout?: "table" | "responsive";
  resolveVoidTarget?: (entry: LedgerTableRow) => ReversalTarget | null;
  onVoid?: (entry: LedgerTableRow, target: ReversalTarget) => void;
};

export function PaginatedLedgerTable({
  entries,
  emptyMessage,
  pageSize = LEDGER_PAGE_SIZE,
  className = "space-y-4",
  layout = "responsive",
  resolveVoidTarget,
  onVoid
}: PaginatedLedgerTableProps) {
  const [page, setPage] = React.useState(1);
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));

  React.useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  React.useEffect(() => {
    setPage(1);
  }, [entries.length]);

  const pagedEntries = React.useMemo(
    () => entries.slice((page - 1) * pageSize, page * pageSize),
    [entries, page, pageSize]
  );

  return (
    <div className={cn("min-w-0 max-w-full", className)}>
      <LedgerTable
        entries={pagedEntries}
        emptyMessage={emptyMessage}
        layout={layout}
        resolveVoidTarget={resolveVoidTarget}
        onVoid={onVoid}
      />
      <NumberPagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}
