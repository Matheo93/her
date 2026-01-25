"use client";

/**
 * Data Table Components - Sprint 652
 *
 * Advanced data table features:
 * - Sorting
 * - Filtering
 * - Pagination
 * - Row selection
 * - HER-themed styling
 */

import React, { memo, useState, useMemo, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type SortDirection = "asc" | "desc" | null;

interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: string;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, row: T, index: number) => ReactNode;
  align?: "left" | "center" | "right";
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  selectable?: boolean;
  selectedKeys?: Set<string | number>;
  onSelectionChange?: (keys: Set<string | number>) => void;
  sortable?: boolean;
  filterable?: boolean;
  paginate?: boolean;
  pageSize?: number;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
}

/**
 * Data Table Component
 */
export function DataTable<T>({
  data,
  columns,
  keyField,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  sortable = true,
  filterable = false,
  paginate = false,
  pageSize = 10,
  emptyMessage = "No data available",
  loading = false,
  className = "",
}: DataTableProps<T>) {
  const { colors } = useTheme();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);

  const getValue = useCallback((row: T, key: string): any => {
    const keys = key.split(".");
    let value: any = row;
    for (const k of keys) {
      value = value?.[k];
    }
    return value;
  }, []);

  const filteredData = useMemo(() => {
    if (!filterable || Object.keys(filters).length === 0) {
      return data;
    }

    return data.filter((row) => {
      for (const [key, filterValue] of Object.entries(filters)) {
        if (!filterValue) continue;
        const value = String(getValue(row, key) || "").toLowerCase();
        if (!value.includes(filterValue.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [data, filters, filterable, getValue]);

  const sortedData = useMemo(() => {
    if (!sortable || !sortKey || !sortDir) {
      return filteredData;
    }

    return [...filteredData].sort((a, b) => {
      const aValue = getValue(a, sortKey);
      const bValue = getValue(b, sortKey);

      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      const comparison = aValue < bValue ? -1 : 1;
      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [filteredData, sortKey, sortDir, sortable, getValue]);

  const paginatedData = useMemo(() => {
    if (!paginate) return sortedData;

    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, paginate]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = (key: string) => {
    if (!sortable) return;

    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortKey(null);
        setSortDir(null);
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleSelectAll = () => {
    if (!onSelectionChange) return;

    if (selectedKeys.size === paginatedData.length) {
      onSelectionChange(new Set());
    } else {
      const allKeys = new Set(
        paginatedData.map((row) => row[keyField] as string | number)
      );
      onSelectionChange(allKeys);
    }
  };

  const handleSelectRow = (key: string | number) => {
    if (!onSelectionChange) return;

    const newSelection = new Set(selectedKeys);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    onSelectionChange(newSelection);
  };

  const allSelected = paginatedData.length > 0 && selectedKeys.size === paginatedData.length;
  const someSelected = selectedKeys.size > 0 && selectedKeys.size < paginatedData.length;

  return (
    <div className={className}>
      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: colors.cream }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: colors.cream }}>
                {selectable && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={handleSelectAll}
                      className="rounded"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={String(col.key)}
                    className="px-4 py-3 text-left text-sm font-semibold"
                    style={{
                      width: col.width,
                      color: colors.textPrimary,
                      textAlign: col.align || "left",
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => col.sortable !== false && handleSort(String(col.key))}
                        disabled={col.sortable === false}
                        className="flex items-center gap-1 disabled:cursor-default"
                      >
                        {col.header}
                        {sortable && col.sortable !== false && (
                          <span className="text-xs" style={{ color: colors.textMuted }}>
                            {sortKey === String(col.key) && sortDir === "asc" && "↑"}
                            {sortKey === String(col.key) && sortDir === "desc" && "↓"}
                          </span>
                        )}
                      </button>
                      {filterable && col.filterable !== false && (
                        <input
                          type="text"
                          placeholder="Filter..."
                          value={filters[String(col.key)] || ""}
                          onChange={(e) => handleFilter(String(col.key), e.target.value)}
                          className="w-full px-2 py-1 text-xs rounded border outline-none"
                          style={{
                            backgroundColor: colors.warmWhite,
                            borderColor: colors.cream,
                            color: colors.textPrimary,
                          }}
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
                    className="px-4 py-8 text-center"
                    style={{ color: colors.textMuted }}
                  >
                    Loading...
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="px-4 py-8 text-center"
                    style={{ color: colors.textMuted }}
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                <AnimatePresence>
                  {paginatedData.map((row, index) => {
                    const rowKey = row[keyField] as string | number;
                    const isSelected = selectedKeys.has(rowKey);

                    return (
                      <motion.tr
                        key={String(rowKey)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-t"
                        style={{
                          borderColor: colors.cream,
                          backgroundColor: isSelected ? colors.cream + "50" : colors.warmWhite,
                        }}
                      >
                        {selectable && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectRow(rowKey)}
                              className="rounded"
                            />
                          </td>
                        )}
                        {columns.map((col) => {
                          const value = getValue(row, String(col.key));
                          return (
                            <td
                              key={String(col.key)}
                              className="px-4 py-3 text-sm"
                              style={{
                                color: colors.textPrimary,
                                textAlign: col.align || "left",
                              }}
                            >
                              {col.render ? col.render(value, row, index) : String(value ?? "")}
                            </td>
                          );
                        })}
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        {paginate && totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t"
            style={{ borderColor: colors.cream, backgroundColor: colors.cream }}
          >
            <span className="text-sm" style={{ color: colors.textMuted }}>
              Showing {(currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, sortedData.length)} of{" "}
              {sortedData.length} entries
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded text-sm disabled:opacity-50"
                style={{
                  backgroundColor: colors.warmWhite,
                  color: colors.textPrimary,
                }}
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded text-sm disabled:opacity-50"
                style={{
                  backgroundColor: colors.warmWhite,
                  color: colors.textPrimary,
                }}
              >
                Prev
              </button>
              <span
                className="px-3 py-1 text-sm"
                style={{ color: colors.textPrimary }}
              >
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded text-sm disabled:opacity-50"
                style={{
                  backgroundColor: colors.warmWhite,
                  color: colors.textPrimary,
                }}
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded text-sm disabled:opacity-50"
                style={{
                  backgroundColor: colors.warmWhite,
                  color: colors.textPrimary,
                }}
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface SimpleTableProps<T> {
  data: T[];
  columns: Array<{
    key: keyof T;
    header: string;
    render?: (value: any) => ReactNode;
  }>;
  className?: string;
}

/**
 * Simple Table (no sorting/filtering)
 */
export function SimpleTable<T>({
  data,
  columns,
  className = "",
}: SimpleTableProps<T>) {
  const { colors } = useTheme();

  return (
    <div className={"overflow-x-auto " + className}>
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: colors.cream }}>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className="px-4 py-2 text-left text-sm font-semibold"
                style={{ color: colors.textPrimary }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={index}
              className="border-t"
              style={{ borderColor: colors.cream }}
            >
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className="px-4 py-2 text-sm"
                  style={{ color: colors.textPrimary }}
                >
                  {col.render
                    ? col.render(row[col.key])
                    : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface KeyValueTableProps {
  data: Record<string, any>;
  labelWidth?: string;
  className?: string;
}

/**
 * Key-Value Table
 */
export const KeyValueTable = memo(function KeyValueTable({
  data,
  labelWidth = "40%",
  className = "",
}: KeyValueTableProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"rounded-lg border overflow-hidden " + className}
      style={{ borderColor: colors.cream }}
    >
      <table className="w-full">
        <tbody>
          {Object.entries(data).map(([key, value], index) => (
            <tr
              key={key}
              className={index > 0 ? "border-t" : ""}
              style={{ borderColor: colors.cream }}
            >
              <td
                className="px-4 py-2 text-sm font-medium"
                style={{
                  width: labelWidth,
                  backgroundColor: colors.cream,
                  color: colors.textMuted,
                }}
              >
                {key}
              </td>
              <td
                className="px-4 py-2 text-sm"
                style={{
                  backgroundColor: colors.warmWhite,
                  color: colors.textPrimary,
                }}
              >
                {typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value ?? "-")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default DataTable;
