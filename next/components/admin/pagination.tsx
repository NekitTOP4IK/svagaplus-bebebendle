"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

type PaginationItem = number | "ellipsis-left" | "ellipsis-right";

function paginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages]);
  for (
    let page = Math.max(2, currentPage - 1);
    page <= Math.min(totalPages - 1, currentPage + 1);
    page += 1
  ) {
    pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: PaginationItem[] = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous != null && page - previous > 1) {
      result.push(index === 1 ? "ellipsis-left" : "ellipsis-right");
    }
    result.push(page);
  });
  return result;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Пагинация"
      className="mt-6 flex flex-wrap items-center justify-between gap-3"
    >
      <div className="pixel-text text-sm text-white">
        Страница {currentPage} из {totalPages}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="pixel-btn px-3 py-2 text-sm font-bold"
        >
          Назад
        </button>
        {paginationItems(currentPage, totalPages).map((item) =>
          typeof item === "number" ? (
            <button
              type="button"
              key={item}
              aria-current={currentPage === item ? "page" : undefined}
              onClick={() => onPageChange(item)}
              className={`pixel-btn min-w-10 px-3 py-2 text-sm font-bold ${
                currentPage === item ? "pixel-btn-warn" : ""
              }`}
            >
              {item}
            </button>
          ) : (
            <span key={item} aria-hidden="true" className="px-1 text-white/50">
              …
            </span>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="pixel-btn px-3 py-2 text-sm font-bold"
        >
          Вперёд
        </button>
      </div>
    </nav>
  );
}
