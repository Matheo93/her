"use client";

/**
 * Table Components - Sprint 624
 *
 * Data table components:
 * - Basic table
 * - Sortable table
 * - Selectable rows
 * - Expandable rows
 * - Responsive table
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface Column<T> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  width?: string;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  render?: (value: unknown, row: T) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedRows?: string[];
  onSelectionChange?: (keys: string[]) => void;
  sortable?: boolean;
  defaultSort?: { column: string; direction: "asc" | "desc" };
  expandable?: boolean;
  renderExpanded?: (row: T) => ReactNode;
  striped?: boolean;
  hoverable?: boolean;
  bordered?: boolean;
  compact?: boolean;
  stickyHeader?: boolean;
  emptyMessage?: string;
  className?: string;
}

type SortDirection = "asc" | "desc" | null;

/**
 * Sort Icon
 */
function SortIcon({ direction }: { direction: SortDirection }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ opacity: direction ? 1 : 0.3 }}
    >
      {direction === "asc" ? (
        <polyline points="18 15 12 9 6 15" />
      ) : direction === "desc" ? (
        <polyline points="6 9 12 15 18 9" />
      ) : (
        <>
          <polyline points="18 15 12 9 6 15" />
        </>
      )}
    </svg>
  );
}

/**
 * Checkbox Component
 */
function Checkbox({
  checked,
  indeterminate,
  onChange,
  color,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  color: string;
}) {
  return (
    <motion.button
      type="button"
      className="w-5 h-5 rounded border-2 flex items-center justify-center"
      style={{
        borderColor: checked || indeterminate ? color : "#ccc",
        backgroundColor: checked || indeterminate ? color : "transparent",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      whileTap={{ scale: 0.9 }}
    >
      {checked && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {indeterminate && !checked && (
        <div className="w-2.5 h-0.5 bg-white rounded" />
      )}
    </motion.button>
  );
}

/**
 * Expand Icon
 */
function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <motion.svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      animate={{ rotate: expanded ? 90 : 0 }}
    >
      <polyline points="9 18 15 12 9 6" />
    </motion.svg>
  );
}

/**
 * Basic Table
 */
export const Table = memo(function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  sortable = false,
  defaultSort,
  expandable = false,
  renderExpanded,
  striped = false,
  hoverable = true,
  bordered = false,
  compact = false,
  stickyHeader = false,
  emptyMessage = "Aucune donnée",
  className = "",
}: TableProps<T>) {
  const { colors } = useTheme();
  const [sortState, setSortState] = useState<{
    column: string | null;
    direction: SortDirection;
  }>({
    column: defaultSort?.column || null,
    direction: defaultSort?.direction || null,
  });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Handle sorting
  const handleSort = useCallback((columnId: string) => {
    setSortState((prev) => {
      if (prev.column !== columnId) {
        return { column: columnId, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { column: columnId, direction: "desc" };
      }
      return { column: null, direction: null };
    });
  }, []);

  // Sorted data
  const sortedData = useMemo(() => {
    if (!sortState.column || !sortState.direction) return data;

    const column = columns.find((c) => c.id === sortState.column);
    if (!column) return data;

    return [...data].sort((a, b) => {
      const accessor = column.accessor;
      const aValue = typeof accessor === "function" ? accessor(a) : a[accessor];
      const bValue = typeof accessor === "function" ? accessor(b) : b[accessor];

      let comparison = 0;
      if (aValue == null && bValue == null) comparison = 0;
      else if (aValue == null) comparison = -1;
      else if (bValue == null) comparison = 1;
      else if (aValue < bValue) comparison = -1;
      else if (aValue > bValue) comparison = 1;

      return sortState.direction === "desc" ? -comparison : comparison;
    });
  }, [data, sortState, columns]);

  // Selection handlers
  const isAllSelected = selectedRows.length === data.length && data.length > 0;
  const isSomeSelected = selectedRows.length > 0 && selectedRows.length < data.length;

  const handleSelectAll = useCallback(() => {
    if (isAllSelected) {
      onSelectionChange?.([]);
    } else {
      onSelectionChange?.(data.map(keyExtractor));
    }
  }, [isAllSelected, data, keyExtractor, onSelectionChange]);

  const handleSelectRow = useCallback(
    (key: string) => {
      const newSelection = selectedRows.includes(key)
        ? selectedRows.filter((k) => k !== key)
        : [...selectedRows, key];
      onSelectionChange?.(newSelection);
    },
    [selectedRows, onSelectionChange]
  );

  // Expand handlers
  const toggleExpand = useCallback((key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Cell value
  const getCellValue = (row: T, column: Column<T>) => {
    const accessor = column.accessor;
    const value = typeof accessor === "function" ? accessor(row) : row[accessor];
    if (column.render) {
      return column.render(value, row);
    }
    return value as ReactNode;
  };

  const paddingClass = compact ? "px-3 py-2" : "px-4 py-3";
  const alignClasses = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  return (
    <div
      className={`overflow-auto rounded-xl ${className}`}
      style={{
        backgroundColor: colors.warmWhite,
        border: bordered ? `1px solid ${colors.cream}` : undefined,
      }}
    >
      <table className="w-full">
        {/* Header */}
        <thead>
          <tr
            style={{
              backgroundColor: colors.cream,
              position: stickyHeader ? "sticky" : undefined,
              top: stickyHeader ? 0 : undefined,
              zIndex: stickyHeader ? 10 : undefined,
            }}
          >
            {/* Expand column */}
            {expandable && <th className={`${paddingClass} w-10`} />}

            {/* Select column */}
            {selectable && (
              <th className={`${paddingClass} w-10`}>
                <Checkbox
                  checked={isAllSelected}
                  indeterminate={isSomeSelected}
                  onChange={handleSelectAll}
                  color={colors.coral}
                />
              </th>
            )}

            {/* Data columns */}
            {columns.map((column) => (
              <th
                key={column.id}
                className={`${paddingClass} ${alignClasses[column.align || "left"]} font-semibold text-sm`}
                style={{
                  color: colors.textPrimary,
                  width: column.width,
                  cursor: sortable && column.sortable !== false ? "pointer" : "default",
                }}
                onClick={() => {
                  if (sortable && column.sortable !== false) {
                    handleSort(column.id);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  {column.header}
                  {sortable && column.sortable !== false && (
                    <SortIcon
                      direction={
                        sortState.column === column.id
                          ? sortState.direction
                          : null
                      }
                    />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={
                  columns.length + (selectable ? 1 : 0) + (expandable ? 1 : 0)
                }
                className={`${paddingClass} text-center`}
                style={{ color: colors.textMuted }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, index) => {
              const key = keyExtractor(row);
              const isSelected = selectedRows.includes(key);
              const isExpanded = expandedRows.has(key);

              return (
                <React.Fragment key={key}>
                  <motion.tr
                    className="group"
                    style={{
                      backgroundColor: isSelected
                        ? `${colors.coral}15`
                        : striped && index % 2 === 1
                        ? `${colors.cream}50`
                        : undefined,
                      borderBottom: `1px solid ${colors.cream}`,
                      cursor: onRowClick ? "pointer" : "default",
                    }}
                    onClick={() => onRowClick?.(row)}
                    whileHover={
                      hoverable
                        ? {
                            backgroundColor: isSelected
                              ? `${colors.coral}20`
                              : `${colors.cream}80`,
                          }
                        : undefined
                    }
                  >
                    {/* Expand cell */}
                    {expandable && (
                      <td className={paddingClass}>
                        <motion.button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(key);
                          }}
                          style={{ color: colors.textMuted }}
                          whileHover={{ color: colors.coral }}
                        >
                          <ExpandIcon expanded={isExpanded} />
                        </motion.button>
                      </td>
                    )}

                    {/* Select cell */}
                    {selectable && (
                      <td className={paddingClass}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleSelectRow(key)}
                          color={colors.coral}
                        />
                      </td>
                    )}

                    {/* Data cells */}
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={`${paddingClass} ${alignClasses[column.align || "left"]} text-sm`}
                        style={{
                          color: colors.textPrimary,
                          width: column.width,
                        }}
                      >
                        {getCellValue(row, column)}
                      </td>
                    ))}
                  </motion.tr>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {expandable && isExpanded && renderExpanded && (
                      <motion.tr
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <td
                          colSpan={
                            columns.length +
                            (selectable ? 1 : 0) +
                            (expandable ? 1 : 0)
                          }
                          className={paddingClass}
                          style={{
                            backgroundColor: `${colors.cream}30`,
                          }}
                        >
                          {renderExpanded(row)}
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}) as <T>(props: TableProps<T>) => React.ReactElement;

/**
 * Simple Table (no generics)
 */
export const SimpleTable = memo(function SimpleTable({
  headers,
  rows,
  striped = true,
  className = "",
}: {
  headers: string[];
  rows: ReactNode[][];
  striped?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div
      className={`overflow-auto rounded-xl ${className}`}
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${colors.cream}`,
      }}
    >
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: colors.cream }}>
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-3 text-left font-semibold text-sm"
                style={{ color: colors.textPrimary }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              style={{
                backgroundColor:
                  striped && rowIndex % 2 === 1 ? `${colors.cream}50` : undefined,
                borderBottom: `1px solid ${colors.cream}`,
              }}
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-4 py-3 text-sm"
                  style={{ color: colors.textPrimary }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

/**
 * Data Grid (card layout for mobile)
 */
export const DataGrid = memo(function DataGrid<T>({
  data,
  keyExtractor,
  renderItem,
  columns = 3,
  gap = 4,
  className = "",
}: {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: 2 | 4 | 6 | 8;
  className?: string;
}) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  const gapClasses = {
    2: "gap-2",
    4: "gap-4",
    6: "gap-6",
    8: "gap-8",
  };

  return (
    <div className={`grid ${gridCols[columns]} ${gapClasses[gap]} ${className}`}>
      {data.map((item) => (
        <div key={keyExtractor(item)}>{renderItem(item)}</div>
      ))}
    </div>
  );
}) as <T>(props: {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: 2 | 4 | 6 | 8;
  className?: string;
}) => React.ReactElement;

/**
 * Table with Pagination
 */
export const PaginatedTable = memo(function PaginatedTable<T>({
  columns,
  data,
  keyExtractor,
  pageSize = 10,
  ...tableProps
}: TableProps<T> & { pageSize?: number }) {
  const { colors } = useTheme();
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = Math.ceil(data.length / pageSize);
  const paginatedData = data.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );

  return (
    <div>
      <Table
        columns={columns}
        data={paginatedData}
        keyExtractor={keyExtractor}
        {...tableProps}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-4">
          <span className="text-sm" style={{ color: colors.textMuted }}>
            Page {currentPage + 1} sur {totalPages}
          </span>

          <div className="flex gap-2">
            <motion.button
              type="button"
              className="px-3 py-1 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: colors.cream,
                color: colors.textPrimary,
                opacity: currentPage === 0 ? 0.5 : 1,
              }}
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              whileHover={currentPage > 0 ? { scale: 1.02 } : undefined}
              whileTap={currentPage > 0 ? { scale: 0.98 } : undefined}
            >
              Précédent
            </motion.button>

            <motion.button
              type="button"
              className="px-3 py-1 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: colors.cream,
                color: colors.textPrimary,
                opacity: currentPage >= totalPages - 1 ? 0.5 : 1,
              }}
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={currentPage >= totalPages - 1}
              whileHover={
                currentPage < totalPages - 1 ? { scale: 1.02 } : undefined
              }
              whileTap={
                currentPage < totalPages - 1 ? { scale: 0.98 } : undefined
              }
            >
              Suivant
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}) as <T>(props: TableProps<T> & { pageSize?: number }) => React.ReactElement;

export default Table;
