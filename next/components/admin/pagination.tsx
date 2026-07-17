"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-6 flex items-center justify-between">
      <div className="pixel-text text-sm text-white">
        Page {currentPage} of {totalPages}
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="pixel-btn px-4 py-2 text-sm font-bold"
        >
          Previous
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            type="button"
            key={page}
            onClick={() => onPageChange(page)}
            className={`pixel-btn px-4 py-2 text-sm font-bold ${
              currentPage === page
                ? "pixel-btn-warn"
                : ""
            }`}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="pixel-btn px-4 py-2 text-sm font-bold"
        >
          Next
        </button>
      </div>
    </div>
  );
}
