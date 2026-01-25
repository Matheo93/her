"use client";

/**
 * DataGrid Components - Sprint 682
 *
 * Advanced data table:
 * - Column definitions
 * - Sorting
 * - Filtering
 * - Row selection
 * - Pagination
 * - HER-themed styling
 */

import React, { memo, useState, useMemo, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type SortDirection = "asc" | "desc" | null;

interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: number | string;
  minWidth?: number;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, row: T, index: number) => ReactNode;
  align?: "left" | "center" | "right";
  sticky?: boolean;
}

interface DataGridProps<T extends Record<string, any>> {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  selectable?: boolean;
  selectedRows?: T[];
  onSelectionChange?: (selected: T[]) => void;
  onRowClick?: (row: T, index: number) => void;
  loading?: boolean;
  emptyMessage?: string;
  striped?: boolean;
  bordered?: boolean;
  compact?: boolean;
  stickyHeader?: boolean;
  className?: string;
}

/**
 * DataGrid Component
 */
export const DataGrid = memo(function DataGrid<T extends Record<string, any>>({
  data,
  columns,
  pageSize = 10,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  onRowClick,
  loading = false,
  emptyMessage = "No data available",
  striped = true,
  bordered = false,
  compact = false,
  stickyHeader = true,
  className = "",
}: DataGridProps<T>) {
  const { colors } = useTheme();
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: SortDirection }>({ key: "", direction: null });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);

  // Filter data
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      return Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        const cellValue = String(getValue(row, key)).toLowerCase();
        return cellValue.includes(value.toLowerCase());
      });
    });
  }, [data, filters]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = getValue(a, sortConfig.key);
      const bVal = getValue(b, sortConfig.key);

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
  }, [filteredData, sortConfig]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // Handlers
  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: "", direction: null };
    });
  }, []);

  const handleFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (selectedRows.length === paginatedData.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange([...paginatedData]);
    }
  }, [paginatedData, selectedRows, onSelectionChange]);

  const handleSelectRow = useCallback((row: T) => {
    if (!onSelectionChange) return;
    const isSelected = selectedRows.some((r) => r === row);
    if (isSelected) {
      onSelectionChange(selectedRows.filter((r) => r !== row));
    } else {
      onSelectionChange([...selectedRows, row]);
    }
  }, [selectedRows, onSelectionChange]);

  const isRowSelected = useCallback((row: T) => {
    return selectedRows.some((r) => r === row);
  }, [selectedRows]);

  const cellPadding = compact ? "px-2 py-1" : "px-4 py-3";

  return (
    <div className={"flex flex-col gap-4 " + className}>
      {/* Filter Row */}
      {columns.some((col) => col.filterable) && (
        <div className="flex gap-2 flex-wrap">
          {columns
            .filter((col) => col.filterable)
            .map((col) => (
              <input
                key={String(col.key)}
                type="text"
                placeholder={`Filter ${col.header}...`}
                value={filters[String(col.key)] || ""}
                onChange={(e) => handleFilter(String(col.key), e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border"
                style={{
                  backgroundColor: colors.warmWhite,
                  borderColor: colors.cream,
                  color: colors.textPrimary,
                }}
              />
            ))}
        </div>
      )}

      {/* Table */}
      <div
        className="overflow-auto rounded-lg"
        style={{
          border: bordered ? "1px solid " + colors.cream : "none",
        }}
      >
        <table className="w-full border-collapse">
          <thead
            className={stickyHeader ? "sticky top-0 z-10" : ""}
            style={{ backgroundColor: colors.cream }}
          >
            <tr>
              {selectable && (
                <th className={cellPadding + " text-left"} style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={paginatedData.length > 0 && selectedRows.length === paginatedData.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: colors.coral }}
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={
                    cellPadding +
                    " text-" + (col.align || "left") +
                    " text-sm font-medium" +
                    (col.sortable ? " cursor-pointer select-none" : "")
                  }
                  style={{
                    width: col.width,
                    minWidth: col.minWidth,
                    color: colors.textPrimary,
                    position: col.sticky ? "sticky" : undefined,
                    left: col.sticky ? 0 : undefined,
                    backgroundColor: col.sticky ? colors.cream : undefined,
                  }}
                  onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.header}</span>
                    {col.sortable && (
                      <SortIndicator
                        direction={sortConfig.key === String(col.key) ? sortConfig.direction : null}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="text-center py-8"
                  style={{ color: colors.textMuted }}
                >
                  <LoadingSpinner />
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="text-center py-8"
                  style={{ color: colors.textMuted }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => {
                const isSelected = isRowSelected(row);
                const globalIndex = (currentPage - 1) * pageSize + rowIndex;

                return (
                  <motion.tr
                    key={rowIndex}
                    className="border-t cursor-pointer"
                    style={{
                      backgroundColor: isSelected
                        ? colors.coral + "15"
                        : striped && rowIndex % 2 === 1
                        ? colors.cream + "50"
                        : colors.warmWhite,
                      borderColor: colors.cream,
                    }}
                    onClick={() => onRowClick?.(row, globalIndex)}
                    whileHover={{ backgroundColor: colors.cream }}
                  >
                    {selectable && (
                      <td className={cellPadding}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(row)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded"
                          style={{ accentColor: colors.coral }}
                        />
                      </td>
                    )}
                    {columns.map((col) => {
                      const value = getValue(row, String(col.key));
                      return (
                        <td
                          key={String(col.key)}
                          className={cellPadding + " text-sm text-" + (col.align || "left")}
                          style={{
                            color: colors.textPrimary,
                            position: col.sticky ? "sticky" : undefined,
                            left: col.sticky ? 0 : undefined,
                            backgroundColor: col.sticky
                              ? isSelected
                                ? colors.coral + "15"
                                : colors.warmWhite
                              : undefined,
                          }}
                        >
                          {col.render ? col.render(value, row, globalIndex) : String(value ?? "")}
                        </td>
                      );
                    })}
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: colors.textMuted }}>
            Showing {(currentPage - 1) * pageSize + 1} to{" "}
            {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length}
          </span>
          <div className="flex gap-1">
            <PaginationButton
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <DoubleChevronLeftIcon />
            </PaginationButton>
            <PaginationButton
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeftIcon />
            </PaginationButton>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
              if (page > totalPages) return null;
              return (
                <PaginationButton
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  active={page === currentPage}
                >
                  {page}
                </PaginationButton>
              );
            })}
            <PaginationButton
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRightIcon />
            </PaginationButton>
            <PaginationButton
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <DoubleChevronRightIcon />
            </PaginationButton>
          </div>
        </div>
      )}
    </div>
  );
}) as <T extends Record<string, any>>(props: DataGridProps<T>) => JSX.Element;

// Helper to get nested value
function getValue(obj: any, key: string): any {
  return key.split(".").reduce((acc, part) => acc?.[part], obj);
}

interface PaginationButtonProps {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}

const PaginationButton = memo(function PaginationButton({
  onClick,
  disabled = false,
  active = false,
  children,
}: PaginationButtonProps) {
  const { colors } = useTheme();

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="min-w-[32px] h-8 px-2 rounded text-sm font-medium"
      style={{
        backgroundColor: active ? colors.coral : "transparent",
        color: active ? colors.warmWhite : disabled ? colors.textMuted : colors.textPrimary,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      whileHover={disabled ? {} : { backgroundColor: active ? colors.coral : colors.cream }}
      whileTap={disabled ? {} : { scale: 0.95 }}
    >
      {children}
    </motion.button>
  );
});

interface SortIndicatorProps {
  direction: SortDirection;
}

const SortIndicator = memo(function SortIndicator({ direction }: SortIndicatorProps) {
  const { colors } = useTheme();

  return (
    <span style={{ color: direction ? colors.coral : colors.textMuted }}>
      {direction === "asc" ? "▲" : direction === "desc" ? "▼" : "○"}
    </span>
  );
});

const LoadingSpinner = memo(function LoadingSpinner() {
  const { colors } = useTheme();

  return (
    <motion.div
      className="w-6 h-6 border-2 rounded-full mx-auto"
      style={{
        borderColor: colors.cream,
        borderTopColor: colors.coral,
      }}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    />
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

export default DataGrid;
