import { Button } from "./ui/button";
import { cn } from "../lib/utils";

type NumberPaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
};

function visiblePageNumbers(current: number, total: number, maxVisible = 5): number[] {
  if (total <= 0) return [1];
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  let start = Math.max(1, current - Math.floor(maxVisible / 2));
  let end = start + maxVisible - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - maxVisible + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function NumberPagination({ page, pageCount, onPageChange, className }: NumberPaginationProps) {
  const safePage = Math.min(Math.max(1, page), Math.max(1, pageCount));
  const pages = visiblePageNumbers(safePage, pageCount);

  if (pageCount <= 1) return null;

  return (
    <nav className={cn("flex flex-wrap items-center justify-center gap-1", className)} aria-label="分頁">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-w-9 px-2"
        disabled={safePage <= 1}
        onClick={() => onPageChange(safePage - 1)}
        aria-label="上一頁"
      >
        &lt;
      </Button>
      {pages.map((pageNumber) => (
        <Button
          key={pageNumber}
          type="button"
          variant={pageNumber === safePage ? "default" : "outline"}
          size="sm"
          className="min-w-9 px-2"
          onClick={() => onPageChange(pageNumber)}
          aria-current={pageNumber === safePage ? "page" : undefined}
        >
          {pageNumber}
        </Button>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-w-9 px-2"
        disabled={safePage >= pageCount}
        onClick={() => onPageChange(safePage + 1)}
        aria-label="下一頁"
      >
        &gt;
      </Button>
    </nav>
  );
}
