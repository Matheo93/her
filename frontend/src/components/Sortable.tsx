"use client";

/**
 * Sortable Components - Sprint 692
 *
 * Drag and drop sorting:
 * - Vertical/Horizontal lists
 * - Drag handles
 * - Smooth animations
 * - Touch support
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useCallback, ReactNode, useEffect } from "react";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface SortableItem {
  id: string;
  [key: string]: any;
}

interface SortableListProps<T extends SortableItem> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number, dragControls?: any) => ReactNode;
  direction?: "vertical" | "horizontal";
  gap?: number;
  showHandle?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Sortable List Component
 */
export const SortableList = memo(function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  direction = "vertical",
  gap = 8,
  showHandle = false,
  disabled = false,
  className = "",
}: SortableListProps<T>) {
  const { colors } = useTheme();

  const axis = direction === "horizontal" ? "x" : "y";

  return (
    <Reorder.Group
      axis={axis}
      values={items}
      onReorder={onReorder}
      className={
        (direction === "horizontal" ? "flex flex-row" : "flex flex-col") +
        " " +
        className
      }
      style={{ gap }}
    >
      <AnimatePresence>
        {items.map((item, index) => (
          <SortableItemWrapper
            key={item.id}
            item={item}
            disabled={disabled}
            showHandle={showHandle}
          >
            {(dragControls) => renderItem(item, index, showHandle ? dragControls : undefined)}
          </SortableItemWrapper>
        ))}
      </AnimatePresence>
    </Reorder.Group>
  );
}) as <T extends SortableItem>(props: SortableListProps<T>) => JSX.Element;

interface SortableItemWrapperProps<T extends SortableItem> {
  item: T;
  disabled?: boolean;
  showHandle?: boolean;
  children: (dragControls: any) => ReactNode;
}

const SortableItemWrapper = memo(function SortableItemWrapper<T extends SortableItem>({
  item,
  disabled = false,
  showHandle = false,
  children,
}: SortableItemWrapperProps<T>) {
  const { colors } = useTheme();
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={item}
      dragListener={!showHandle}
      dragControls={dragControls}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileDrag={{
        scale: 1.02,
        boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
        zIndex: 50,
      }}
      transition={{ duration: 0.2 }}
      style={{
        cursor: showHandle || disabled ? "default" : "grab",
        touchAction: "none",
      }}
    >
      {children(dragControls)}
    </Reorder.Item>
  );
}) as <T extends SortableItem>(props: SortableItemWrapperProps<T>) => JSX.Element;

interface DragHandleProps {
  dragControls: any;
  className?: string;
}

/**
 * Drag Handle Component
 */
export const DragHandle = memo(function DragHandle({
  dragControls,
  className = "",
}: DragHandleProps) {
  const { colors } = useTheme();

  return (
    <motion.div
      className={"p-1 cursor-grab active:cursor-grabbing " + className}
      style={{ color: colors.textMuted }}
      onPointerDown={(e) => {
        e.preventDefault();
        dragControls.start(e);
      }}
      whileHover={{ color: colors.textPrimary }}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
        <circle cx={9} cy={6} r={1.5} />
        <circle cx={15} cy={6} r={1.5} />
        <circle cx={9} cy={12} r={1.5} />
        <circle cx={15} cy={12} r={1.5} />
        <circle cx={9} cy={18} r={1.5} />
        <circle cx={15} cy={18} r={1.5} />
      </svg>
    </motion.div>
  );
});

interface SortableCardProps {
  children: ReactNode;
  dragControls?: any;
  showHandle?: boolean;
  className?: string;
}

/**
 * Pre-styled Sortable Card
 */
export const SortableCard = memo(function SortableCard({
  children,
  dragControls,
  showHandle = false,
  className = "",
}: SortableCardProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"flex items-center gap-2 p-3 rounded-lg " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${colors.cream}`,
      }}
    >
      {showHandle && dragControls && <DragHandle dragControls={dragControls} />}
      <div className="flex-1">{children}</div>
    </div>
  );
});

interface SimpleSortableListProps {
  items: string[];
  onReorder: (items: string[]) => void;
  showHandle?: boolean;
  className?: string;
}

/**
 * Simple String Sortable List
 */
export const SimpleSortableList = memo(function SimpleSortableList({
  items,
  onReorder,
  showHandle = false,
  className = "",
}: SimpleSortableListProps) {
  const { colors } = useTheme();

  const itemsWithId = items.map((text, i) => ({ id: `item-${i}-${text}`, text }));

  const handleReorder = useCallback(
    (newItems: typeof itemsWithId) => {
      onReorder(newItems.map((item) => item.text));
    },
    [onReorder]
  );

  return (
    <SortableList
      items={itemsWithId}
      onReorder={handleReorder}
      showHandle={showHandle}
      className={className}
      renderItem={(item, _index, dragControls) => (
        <SortableCard dragControls={dragControls} showHandle={showHandle}>
          <span style={{ color: colors.textPrimary }}>{item.text}</span>
        </SortableCard>
      )}
    />
  );
});

interface SortableGridProps<T extends SortableItem> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  columns?: number;
  gap?: number;
  className?: string;
}

/**
 * Sortable Grid (Horizontal Reorder per Row)
 */
export const SortableGrid = memo(function SortableGrid<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  columns = 3,
  gap = 8,
  className = "",
}: SortableGridProps<T>) {
  const { colors } = useTheme();

  // Split items into rows
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }

  const handleRowReorder = useCallback(
    (rowIndex: number, newRowItems: T[]) => {
      const newItems = [...items];
      const startIdx = rowIndex * columns;
      newRowItems.forEach((item, i) => {
        newItems[startIdx + i] = item;
      });
      onReorder(newItems);
    },
    [items, columns, onReorder]
  );

  return (
    <div className={"flex flex-col " + className} style={{ gap }}>
      {rows.map((row, rowIndex) => (
        <Reorder.Group
          key={rowIndex}
          axis="x"
          values={row}
          onReorder={(newRow) => handleRowReorder(rowIndex, newRow)}
          className="flex flex-row"
          style={{ gap }}
        >
          {row.map((item, colIndex) => (
            <Reorder.Item
              key={item.id}
              value={item}
              whileDrag={{ scale: 1.05, zIndex: 50 }}
              style={{ touchAction: "none" }}
            >
              {renderItem(item, rowIndex * columns + colIndex)}
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ))}
    </div>
  );
}) as <T extends SortableItem>(props: SortableGridProps<T>) => JSX.Element;

interface RankingListProps<T extends SortableItem> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, rank: number) => ReactNode;
  showRank?: boolean;
  className?: string;
}

/**
 * Ranking List with Position Numbers
 */
export const RankingList = memo(function RankingList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  showRank = true,
  className = "",
}: RankingListProps<T>) {
  const { colors } = useTheme();

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={onReorder}
      className={"flex flex-col gap-2 " + className}
    >
      {items.map((item, index) => (
        <Reorder.Item
          key={item.id}
          value={item}
          whileDrag={{ scale: 1.02, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
          style={{ touchAction: "none" }}
        >
          <div className="flex items-center gap-3">
            {showRank && (
              <motion.div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                style={{
                  backgroundColor: index === 0 ? colors.coral : colors.cream,
                  color: index === 0 ? colors.warmWhite : colors.textPrimary,
                }}
                layout
              >
                {index + 1}
              </motion.div>
            )}
            <div className="flex-1">{renderItem(item, index + 1)}</div>
          </div>
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}) as <T extends SortableItem>(props: RankingListProps<T>) => JSX.Element;

// Custom hook for managing sortable state
export function useSortable<T extends SortableItem>(initialItems: T[]) {
  const [items, setItems] = useState<T[]>(initialItems);

  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    setItems((prev) => {
      const newItems = [...prev];
      const [removed] = newItems.splice(fromIndex, 1);
      newItems.splice(toIndex, 0, removed);
      return newItems;
    });
  }, []);

  const addItem = useCallback((item: T, index?: number) => {
    setItems((prev) => {
      if (index === undefined) {
        return [...prev, item];
      }
      const newItems = [...prev];
      newItems.splice(index, 0, item);
      return newItems;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const reset = useCallback(() => {
    setItems(initialItems);
  }, [initialItems]);

  return {
    items,
    setItems,
    moveItem,
    addItem,
    removeItem,
    reset,
  };
}

export default SortableList;
