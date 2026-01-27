"use client";

/**
 * List Box Components - Sprint 768
 *
 * Selectable list components:
 * - ListBox (single/multi select)
 * - Virtualized list
 * - Grouped items
 * - Searchable list
 * - Drag reorder
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
  KeyboardEvent,
} from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface ListBoxItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  group?: string;
  metadata?: Record<string, any>;
}

interface ListBoxProps {
  items: ListBoxItem[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  multiple?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  maxHeight?: number;
  emptyMessage?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * List Box - Selectable List
 */
export const ListBox = memo(function ListBox({
  items,
  value,
  onChange,
  multiple = false,
  searchable = false,
  searchPlaceholder = "Search...",
  maxHeight = 300,
  emptyMessage = "No items",
  size = "md",
  className = "",
}: ListBoxProps) {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const sizeStyles = {
    sm: { padding: "6px 10px", fontSize: 13, gap: 6 },
    md: { padding: "10px 14px", fontSize: 14, gap: 8 },
    lg: { padding: "14px 18px", fontSize: 15, gap: 10 },
  };

  const s = sizeStyles[size];

  const selectedSet = useMemo(() => {
    if (!value) return new Set<string>();
    if (Array.isArray(value)) return new Set(value);
    return new Set([value]);
  }, [value]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const lower = search.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        item.description?.toLowerCase().includes(lower)
    );
  }, [items, search]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, ListBoxItem[]> = {};
    filteredItems.forEach((item) => {
      const group = item.group || "";
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
    });
    return groups;
  }, [filteredItems]);

  const handleSelect = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      if (item?.disabled) return;

      if (multiple) {
        const newSet = new Set(selectedSet);
        if (newSet.has(itemId)) {
          newSet.delete(itemId);
        } else {
          newSet.add(itemId);
        }
        onChange?.(Array.from(newSet));
      } else {
        onChange?.(itemId);
      }
    },
    [items, multiple, selectedSet, onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const enabledItems = filteredItems.filter((i) => !i.disabled);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < enabledItems.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev > 0 ? prev - 1 : enabledItems.length - 1
        );
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < enabledItems.length) {
          handleSelect(enabledItems[focusedIndex].id);
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        setFocusedIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setFocusedIndex(enabledItems.length - 1);
      }
    },
    [filteredItems, focusedIndex, handleSelect]
  );

  const selectAll = useCallback(() => {
    if (!multiple) return;
    const allIds = items.filter((i) => !i.disabled).map((i) => i.id);
    onChange?.(allIds);
  }, [items, multiple, onChange]);

  const clearAll = useCallback(() => {
    onChange?.(multiple ? [] : "");
  }, [multiple, onChange]);

  return (
    <div
      className={"rounded-xl overflow-hidden " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
    >
      {searchable && (
        <div
          className="p-2 border-b"
          style={{ borderColor: colors.cream }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full px-3 py-2 rounded-lg outline-none text-sm"
            style={{
              backgroundColor: colors.cream,
              color: colors.textPrimary,
            }}
          />
        </div>
      )}

      {multiple && filteredItems.length > 0 && (
        <div
          className="p-2 flex items-center justify-between text-xs border-b"
          style={{ borderColor: colors.cream, color: colors.textMuted }}
        >
          <span>{selectedSet.size} selected</span>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="hover:underline"
              style={{ color: colors.coral }}
            >
              Select all
            </button>
            <button
              onClick={clearAll}
              className="hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div
        ref={listRef}
        className="overflow-y-auto"
        style={{ maxHeight }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="listbox"
        aria-multiselectable={multiple}
      >
        {filteredItems.length === 0 ? (
          <div
            className="p-4 text-center text-sm"
            style={{ color: colors.textMuted }}
          >
            {emptyMessage}
          </div>
        ) : (
          Object.entries(groupedItems).map(([group, groupItems]) => (
            <div key={group}>
              {group && (
                <div
                  className="px-3 py-2 text-xs font-semibold uppercase tracking-wider sticky top-0"
                  style={{
                    backgroundColor: colors.cream,
                    color: colors.textMuted,
                  }}
                >
                  {group}
                </div>
              )}
              {groupItems.map((item, index) => {
                const isSelected = selectedSet.has(item.id);
                const isFocused =
                  filteredItems.indexOf(item) === focusedIndex;

                return (
                  <motion.button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    disabled={item.disabled}
                    className="w-full flex items-center gap-3 text-left transition-colors"
                    style={{
                      padding: s.padding,
                      backgroundColor: isSelected
                        ? colors.coral + "15"
                        : isFocused
                        ? colors.cream
                        : "transparent",
                      opacity: item.disabled ? 0.5 : 1,
                      cursor: item.disabled ? "not-allowed" : "pointer",
                      borderLeft: isSelected
                        ? "3px solid " + colors.coral
                        : "3px solid transparent",
                    }}
                    whileHover={
                      !item.disabled
                        ? { backgroundColor: colors.cream }
                        : undefined
                    }
                    role="option"
                    aria-selected={isSelected}
                  >
                    {multiple && (
                      <div
                        className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0"
                        style={{
                          borderColor: isSelected
                            ? colors.coral
                            : colors.textMuted,
                          backgroundColor: isSelected
                            ? colors.coral
                            : "transparent",
                        }}
                      >
                        {isSelected && (
                          <CheckIcon
                            size={12}
                            color={colors.warmWhite}
                          />
                        )}
                      </div>
                    )}

                    {item.icon && (
                      <div
                        className="flex-shrink-0"
                        style={{ color: colors.textMuted }}
                      >
                        {item.icon}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div
                        className="font-medium truncate"
                        style={{
                          fontSize: s.fontSize,
                          color: colors.textPrimary,
                        }}
                      >
                        {item.label}
                      </div>
                      {item.description && (
                        <div
                          className="text-xs truncate mt-0.5"
                          style={{ color: colors.textMuted }}
                        >
                          {item.description}
                        </div>
                      )}
                    </div>

                    {!multiple && isSelected && (
                      <CheckIcon size={16} color={colors.coral} />
                    )}
                  </motion.button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
});

interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  itemHeight: number;
  height: number;
  overscan?: number;
  className?: string;
}

/**
 * Virtualized List
 */
export const VirtualList = memo(function VirtualList<T>({
  items,
  renderItem,
  itemHeight,
  height,
  overscan = 3,
  className = "",
}: VirtualListProps<T>) {
  const { colors } = useTheme();
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalHeight = items.length * itemHeight;

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / itemHeight) - overscan
  );
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + height) / itemHeight) + overscan
  );

  const visibleItems = useMemo(() => {
    const result = [];
    for (let i = startIndex; i <= endIndex; i++) {
      result.push({
        item: items[i],
        index: i,
        style: {
          position: "absolute" as const,
          top: i * itemHeight,
          left: 0,
          right: 0,
          height: itemHeight,
        },
      });
    }
    return result;
  }, [items, startIndex, endIndex, itemHeight]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    },
    []
  );

  return (
    <div
      ref={containerRef}
      className={"overflow-auto " + className}
      style={{ height }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.map(({ item, index, style }) => (
          <div key={index} style={style}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}) as <T>(props: VirtualListProps<T>) => React.ReactElement;

interface ReorderListProps {
  items: ListBoxItem[];
  onReorder: (items: ListBoxItem[]) => void;
  renderItem?: (item: ListBoxItem) => ReactNode;
  className?: string;
}

/**
 * Reorderable List
 */
export const ReorderList = memo(function ReorderList({
  items,
  onReorder,
  renderItem,
  className = "",
}: ReorderListProps) {
  const { colors } = useTheme();

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={onReorder}
      className={className}
    >
      {items.map((item) => (
        <Reorder.Item
          key={item.id}
          value={item}
          className="flex items-center gap-3 p-3 rounded-lg cursor-grab active:cursor-grabbing"
          style={{
            backgroundColor: colors.warmWhite,
            marginBottom: 4,
          }}
          whileDrag={{
            scale: 1.02,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ color: colors.textMuted }}>
            <DragHandleIcon size={16} />
          </div>
          {renderItem ? (
            renderItem(item)
          ) : (
            <span style={{ color: colors.textPrimary }}>{item.label}</span>
          )}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
});

interface SelectableListProps {
  items: ListBoxItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onItemClick?: (item: ListBoxItem) => void;
  showCheckboxes?: boolean;
  className?: string;
}

/**
 * Selectable List with Actions
 */
export const SelectableList = memo(function SelectableList({
  items,
  selectedIds,
  onSelectionChange,
  onItemClick,
  showCheckboxes = true,
  className = "",
}: SelectableListProps) {
  const { colors } = useTheme();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleItem = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newSet = new Set(selectedSet);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      onSelectionChange(Array.from(newSet));
    },
    [selectedSet, onSelectionChange]
  );

  const toggleAll = useCallback(() => {
    if (selectedSet.size === items.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(items.map((i) => i.id));
    }
  }, [items, selectedSet, onSelectionChange]);

  const allSelected = selectedSet.size === items.length && items.length > 0;
  const someSelected = selectedSet.size > 0 && selectedSet.size < items.length;

  return (
    <div
      className={"rounded-xl overflow-hidden " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
    >
      {showCheckboxes && (
        <div
          className="p-3 flex items-center gap-3 border-b"
          style={{ borderColor: colors.cream }}
        >
          <button
            onClick={toggleAll}
            className="w-5 h-5 rounded border-2 flex items-center justify-center"
            style={{
              borderColor: allSelected || someSelected
                ? colors.coral
                : colors.textMuted,
              backgroundColor: allSelected
                ? colors.coral
                : "transparent",
            }}
          >
            {allSelected && (
              <CheckIcon size={12} color={colors.warmWhite} />
            )}
            {someSelected && (
              <MinusIcon size={12} color={colors.coral} />
            )}
          </button>
          <span
            className="text-sm"
            style={{ color: colors.textMuted }}
          >
            {selectedSet.size > 0
              ? selectedSet.size + " selected"
              : "Select all"}
          </span>
        </div>
      )}

      <div className="divide-y" style={{ borderColor: colors.cream }}>
        {items.map((item) => {
          const isSelected = selectedSet.has(item.id);

          return (
            <motion.div
              key={item.id}
              className="flex items-center gap-3 p-3 cursor-pointer transition-colors"
              style={{
                backgroundColor: isSelected
                  ? colors.coral + "10"
                  : "transparent",
              }}
              onClick={() => onItemClick?.(item)}
              whileHover={{ backgroundColor: colors.cream }}
            >
              {showCheckboxes && (
                <button
                  onClick={(e) => toggleItem(item.id, e)}
                  className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: isSelected
                      ? colors.coral
                      : colors.textMuted,
                    backgroundColor: isSelected
                      ? colors.coral
                      : "transparent",
                  }}
                >
                  {isSelected && (
                    <CheckIcon size={12} color={colors.warmWhite} />
                  )}
                </button>
              )}

              {item.icon && (
                <div style={{ color: colors.textMuted }}>{item.icon}</div>
              )}

              <div className="flex-1 min-w-0">
                <div
                  className="font-medium truncate"
                  style={{ color: colors.textPrimary }}
                >
                  {item.label}
                </div>
                {item.description && (
                  <div
                    className="text-xs truncate"
                    style={{ color: colors.textMuted }}
                  >
                    {item.description}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
});

interface ActionListProps {
  items: Array<{
    id: string;
    label: string;
    icon?: ReactNode;
    danger?: boolean;
    disabled?: boolean;
    onClick?: () => void;
  }>;
  className?: string;
}

/**
 * Action List (Menu Items)
 */
export const ActionList = memo(function ActionList({
  items,
  className = "",
}: ActionListProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"rounded-xl overflow-hidden py-1 " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: "1px solid " + colors.cream,
      }}
    >
      {items.map((item) => (
        <motion.button
          key={item.id}
          onClick={item.onClick}
          disabled={item.disabled}
          className="w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors"
          style={{
            color: item.danger ? "#ef4444" : colors.textPrimary,
            opacity: item.disabled ? 0.5 : 1,
            cursor: item.disabled ? "not-allowed" : "pointer",
          }}
          whileHover={
            !item.disabled
              ? { backgroundColor: colors.cream }
              : undefined
          }
        >
          {item.icon && (
            <span
              style={{
                color: item.danger ? "#ef4444" : colors.textMuted,
              }}
            >
              {item.icon}
            </span>
          )}
          <span className="font-medium">{item.label}</span>
        </motion.button>
      ))}
    </div>
  );
});

interface DescriptionListProps {
  items: Array<{
    term: string;
    description: ReactNode;
  }>;
  layout?: "horizontal" | "vertical";
  className?: string;
}

/**
 * Description List
 */
export const DescriptionList = memo(function DescriptionList({
  items,
  layout = "horizontal",
  className = "",
}: DescriptionListProps) {
  const { colors } = useTheme();

  return (
    <dl className={className}>
      {items.map((item, index) => (
        <div
          key={index}
          className={
            layout === "horizontal"
              ? "flex items-start gap-4 py-3"
              : "py-3"
          }
          style={{
            borderBottom:
              index < items.length - 1
                ? "1px solid " + colors.cream
                : "none",
          }}
        >
          <dt
            className={
              layout === "horizontal"
                ? "w-1/3 flex-shrink-0 text-sm font-medium"
                : "text-sm font-medium mb-1"
            }
            style={{ color: colors.textMuted }}
          >
            {item.term}
          </dt>
          <dd
            className={layout === "horizontal" ? "flex-1" : ""}
            style={{ color: colors.textPrimary }}
          >
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  );
});

// Icons
const CheckIcon = ({ size = 16, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="3"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const MinusIcon = ({ size = 16, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="3"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const DragHandleIcon = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

export default ListBox;
