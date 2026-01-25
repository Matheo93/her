"use client";

/**
 * Pagination Components - Sprint 674
 *
 * Data pagination controls:
 * - Page numbers
 * - Prev/Next buttons
 * - Page size selector
 * - Jump to page
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  showFirstLast?: boolean;
  showPrevNext?: boolean;
  className?: string;
}

/**
 * Main Pagination Component
 */
export const Pagination = memo(function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  showFirstLast = true,
  showPrevNext = true,
  className = "",
}: PaginationProps) {
  const { colors } = useTheme();

  const pages = useMemo(() => {
    const range = (start: number, end: number) =>
      Array.from({ length: end - start + 1 }, (_, i) => start + i);

    const totalNumbers = siblingCount * 2 + 3;
    const totalBlocks = totalNumbers + 2;

    if (totalPages <= totalBlocks) {
      return range(1, totalPages);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
    const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < totalPages - 1;

    if (!shouldShowLeftDots && shouldShowRightDots) {
      const leftRange = range(1, 3 + 2 * siblingCount);
      return [...leftRange, "...", totalPages];
    }

    if (shouldShowLeftDots && !shouldShowRightDots) {
      const rightRange = range(totalPages - (2 + 2 * siblingCount), totalPages);
      return [1, "...", ...rightRange];
    }

    const middleRange = range(leftSiblingIndex, rightSiblingIndex);
    return [1, "...", ...middleRange, "...", totalPages];
  }, [currentPage, totalPages, siblingCount]);

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <nav className={"flex items-center gap-1 " + className} aria-label="Pagination">
      {/* First */}
      {showFirstLast && (
        <PageButton
          onClick={() => onPageChange(1)}
          disabled={!canGoPrev}
          aria-label="First page"
        >
          <DoubleChevronLeftIcon />
        </PageButton>
      )}

      {/* Previous */}
      {showPrevNext && (
        <PageButton
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrev}
          aria-label="Previous page"
        >
          <ChevronLeftIcon />
        </PageButton>
      )}

      {/* Page numbers */}
      {pages.map((page, index) => {
        if (page === "...") {
          return (
            <span
              key={"dots-" + index}
              className="px-2 py-1"
              style={{ color: colors.textMuted }}
            >
              ...
            </span>
          );
        }

        const pageNum = page as number;
        const isActive = pageNum === currentPage;

        return (
          <PageButton
            key={pageNum}
            onClick={() => onPageChange(pageNum)}
            isActive={isActive}
            aria-label={"Page " + pageNum}
            aria-current={isActive ? "page" : undefined}
          >
            {pageNum}
          </PageButton>
        );
      })}

      {/* Next */}
      {showPrevNext && (
        <PageButton
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          aria-label="Next page"
        >
          <ChevronRightIcon />
        </PageButton>
      )}

      {/* Last */}
      {showFirstLast && (
        <PageButton
          onClick={() => onPageChange(totalPages)}
          disabled={!canGoNext}
          aria-label="Last page"
        >
          <DoubleChevronRightIcon />
        </PageButton>
      )}
    </nav>
  );
});

interface PageButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isActive?: boolean;
  children: React.ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page" | undefined;
}

const PageButton = memo(function PageButton({
  onClick,
  disabled = false,
  isActive = false,
  children,
  ...props
}: PageButtonProps) {
  const { colors } = useTheme();

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="min-w-[36px] h-9 px-3 rounded-lg text-sm font-medium"
      style={{
        backgroundColor: isActive ? colors.coral : "transparent",
        color: isActive ? colors.warmWhite : disabled ? colors.textMuted : colors.textPrimary,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      whileHover={disabled ? {} : { backgroundColor: isActive ? colors.coral : colors.cream }}
      whileTap={disabled ? {} : { scale: 0.95 }}
      {...props}
    >
      {children}
    </motion.button>
  );
});

interface SimplePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Simple Prev/Next Pagination
 */
export const SimplePagination = memo(function SimplePagination({
  currentPage,
  totalPages,
  onPageChange,
  className = "",
}: SimplePaginationProps) {
  const { colors } = useTheme();

  return (
    <div className={"flex items-center justify-between " + className}>
      <motion.button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-4 py-2 rounded-lg text-sm font-medium"
        style={{
          backgroundColor: colors.cream,
          color: currentPage <= 1 ? colors.textMuted : colors.textPrimary,
          opacity: currentPage <= 1 ? 0.5 : 1,
        }}
        whileHover={currentPage > 1 ? { scale: 1.02 } : {}}
      >
        Previous
      </motion.button>

      <span className="text-sm" style={{ color: colors.textMuted }}>
        Page {currentPage} of {totalPages}
      </span>

      <motion.button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-4 py-2 rounded-lg text-sm font-medium"
        style={{
          backgroundColor: colors.coral,
          color: colors.warmWhite,
          opacity: currentPage >= totalPages ? 0.5 : 1,
        }}
        whileHover={currentPage < totalPages ? { scale: 1.02 } : {}}
      >
        Next
      </motion.button>
    </div>
  );
});

interface PageSizeSelectorProps {
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  options?: number[];
  className?: string;
}

/**
 * Page Size Selector
 */
export const PageSizeSelector = memo(function PageSizeSelector({
  pageSize,
  onPageSizeChange,
  options = [10, 25, 50, 100],
  className = "",
}: PageSizeSelectorProps) {
  const { colors } = useTheme();

  return (
    <div className={"flex items-center gap-2 " + className}>
      <span className="text-sm" style={{ color: colors.textMuted }}>
        Show
      </span>
      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        className="px-3 py-1.5 rounded-lg border text-sm"
        style={{
          backgroundColor: colors.warmWhite,
          borderColor: colors.cream,
          color: colors.textPrimary,
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <span className="text-sm" style={{ color: colors.textMuted }}>
        per page
      </span>
    </div>
  );
});

interface JumpToPageProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Jump to Page Input
 */
export const JumpToPage = memo(function JumpToPage({
  currentPage,
  totalPages,
  onPageChange,
  className = "",
}: JumpToPageProps) {
  const { colors } = useTheme();
  const [inputValue, setInputValue] = useState(String(currentPage));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(inputValue, 10);
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    } else {
      setInputValue(String(currentPage));
    }
  };

  return (
    <form onSubmit={handleSubmit} className={"flex items-center gap-2 " + className}>
      <span className="text-sm" style={{ color: colors.textMuted }}>
        Go to
      </span>
      <input
        type="number"
        min={1}
        max={totalPages}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="w-16 px-2 py-1.5 rounded-lg border text-sm text-center"
        style={{
          backgroundColor: colors.warmWhite,
          borderColor: colors.cream,
          color: colors.textPrimary,
        }}
      />
      <motion.button
        type="submit"
        className="px-3 py-1.5 rounded-lg text-sm font-medium"
        style={{
          backgroundColor: colors.coral,
          color: colors.warmWhite,
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        Go
      </motion.button>
    </form>
  );
});

interface PaginationInfoProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  className?: string;
}

/**
 * Pagination Info Display
 */
export const PaginationInfo = memo(function PaginationInfo({
  currentPage,
  pageSize,
  totalItems,
  className = "",
}: PaginationInfoProps) {
  const { colors } = useTheme();

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <p className={"text-sm " + className} style={{ color: colors.textMuted }}>
      Showing <span style={{ color: colors.textPrimary }}>{start}</span> to{" "}
      <span style={{ color: colors.textPrimary }}>{end}</span> of{" "}
      <span style={{ color: colors.textPrimary }}>{totalItems}</span> results
    </p>
  );
});

// Icons
function ChevronLeftIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function DoubleChevronLeftIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
    </svg>
  );
}

function DoubleChevronRightIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M13 7l5 5-5 5M6 7l5 5-5 5" />
    </svg>
  );
}

export default Pagination;
