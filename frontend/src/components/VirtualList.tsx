"use client";

/**
 * Virtual List Components - Sprint 806
 *
 * Virtualized list rendering:
 * - Fixed height items
 * - Variable height items
 * - Grid layout
 * - Horizontal list
 * - Windowing
 * - HER-themed styling
 */

import React, {
  memo,
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
  CSSProperties,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  width?: number | string;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
  onScroll?: (scrollTop: number) => void;
  onEndReached?: () => void;
  endReachedThreshold?: number;
  gap?: number;
}

/**
 * Virtual List - Fixed height virtualized list
 */
export const VirtualList = memo(function VirtualList<T>({
  items,
  itemHeight,
  height,
  width = "100%",
  renderItem,
  overscan = 3,
  className = "",
  onScroll,
  onEndReached,
  endReachedThreshold = 200,
  gap = 0,
}: VirtualListProps<T>) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const endReachedRef = useRef(false);

  const totalHeight = items.length * (itemHeight + gap) - gap;

  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / (itemHeight + gap)) - overscan);
    const visibleCount = Math.ceil(height / (itemHeight + gap)) + 2 * overscan;
    const end = Math.min(items.length - 1, start + visibleCount);

    return { start, end };
  }, [scrollTop, itemHeight, height, overscan, items.length, gap]);

  const visibleItems = useMemo(() => {
    const result: { item: T; index: number; style: CSSProperties }[] = [];

    for (let i = visibleRange.start; i <= visibleRange.end; i++) {
      result.push({
        item: items[i],
        index: i,
        style: {
          position: "absolute",
          top: i * (itemHeight + gap),
          left: 0,
          right: 0,
          height: itemHeight,
        },
      });
    }

    return result;
  }, [items, visibleRange, itemHeight, gap]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      const newScrollTop = target.scrollTop;
      setScrollTop(newScrollTop);
      onScroll?.(newScrollTop);

      // Check if end reached
      const distanceFromEnd = totalHeight - newScrollTop - height;
      if (distanceFromEnd < endReachedThreshold && !endReachedRef.current) {
        endReachedRef.current = true;
        onEndReached?.();
      } else if (distanceFromEnd >= endReachedThreshold) {
        endReachedRef.current = false;
      }
    },
    [totalHeight, height, endReachedThreshold, onScroll, onEndReached]
  );

  return (
    <div
      ref={containerRef}
      className={"overflow-auto " + className}
      style={{
        height,
        width,
        position: "relative",
        backgroundColor: colors.background,
      }}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: totalHeight,
          position: "relative",
        }}
      >
        {visibleItems.map(({ item, index, style }) => (
          <div key={index} style={style}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}) as <T>(props: VirtualListProps<T>) => JSX.Element;

interface VariableVirtualListProps<T> {
  items: T[];
  estimatedItemHeight: number;
  height: number;
  width?: number | string;
  renderItem: (item: T, index: number) => ReactNode;
  getItemHeight?: (item: T, index: number) => number;
  overscan?: number;
  className?: string;
  onScroll?: (scrollTop: number) => void;
  gap?: number;
}

/**
 * Variable Virtual List - Variable height items
 */
export const VariableVirtualList = memo(function VariableVirtualList<T>({
  items,
  estimatedItemHeight,
  height,
  width = "100%",
  renderItem,
  getItemHeight,
  overscan = 3,
  className = "",
  onScroll,
  gap = 0,
}: VariableVirtualListProps<T>) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const measuredHeights = useRef<Map<number, number>>(new Map());

  const getHeight = useCallback(
    (item: T, index: number): number => {
      if (measuredHeights.current.has(index)) {
        return measuredHeights.current.get(index)!;
      }
      if (getItemHeight) {
        return getItemHeight(item, index);
      }
      return estimatedItemHeight;
    },
    [getItemHeight, estimatedItemHeight]
  );

  const { totalHeight, itemPositions } = useMemo(() => {
    const positions: number[] = [];
    let currentPosition = 0;

    for (let i = 0; i < items.length; i++) {
      positions.push(currentPosition);
      currentPosition += getHeight(items[i], i) + gap;
    }

    return {
      totalHeight: currentPosition - gap,
      itemPositions: positions,
    };
  }, [items, getHeight, gap]);

  const visibleItems = useMemo(() => {
    const result: { item: T; index: number; style: CSSProperties }[] = [];

    // Binary search for start
    let start = 0;
    let end = items.length - 1;

    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      if (itemPositions[mid] < scrollTop) {
        start = mid + 1;
      } else {
        end = mid;
      }
    }

    start = Math.max(0, start - overscan);

    // Find visible items
    let i = start;
    while (i < items.length) {
      const top = itemPositions[i];
      const itemHeight = getHeight(items[i], i);

      if (top > scrollTop + height + overscan * estimatedItemHeight) {
        break;
      }

      result.push({
        item: items[i],
        index: i,
        style: {
          position: "absolute",
          top,
          left: 0,
          right: 0,
          minHeight: itemHeight,
        },
      });

      i++;
    }

    return result;
  }, [items, scrollTop, height, itemPositions, overscan, estimatedItemHeight, getHeight]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      setScrollTop(target.scrollTop);
      onScroll?.(target.scrollTop);
    },
    [onScroll]
  );

  const measureItem = useCallback((index: number, element: HTMLElement) => {
    const measuredHeight = element.getBoundingClientRect().height;
    if (measuredHeights.current.get(index) !== measuredHeight) {
      measuredHeights.current.set(index, measuredHeight);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={"overflow-auto " + className}
      style={{
        height,
        width,
        position: "relative",
        backgroundColor: colors.background,
      }}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: totalHeight,
          position: "relative",
        }}
      >
        {visibleItems.map(({ item, index, style }) => (
          <div
            key={index}
            style={style}
            ref={(el) => el && measureItem(index, el)}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}) as <T>(props: VariableVirtualListProps<T>) => JSX.Element;

interface VirtualGridProps<T> {
  items: T[];
  itemWidth: number;
  itemHeight: number;
  height: number;
  width?: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
  gap?: number;
  onScroll?: (scrollTop: number) => void;
}

/**
 * Virtual Grid - Grid layout virtualization
 */
export const VirtualGrid = memo(function VirtualGrid<T>({
  items,
  itemWidth,
  itemHeight,
  height,
  width = 800,
  renderItem,
  overscan = 2,
  className = "",
  gap = 8,
  onScroll,
}: VirtualGridProps<T>) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerWidth, setContainerWidth] = useState(width);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const columnsCount = Math.max(1, Math.floor((containerWidth + gap) / (itemWidth + gap)));
  const rowsCount = Math.ceil(items.length / columnsCount);
  const totalHeight = rowsCount * (itemHeight + gap) - gap;

  const visibleRange = useMemo(() => {
    const startRow = Math.max(0, Math.floor(scrollTop / (itemHeight + gap)) - overscan);
    const visibleRows = Math.ceil(height / (itemHeight + gap)) + 2 * overscan;
    const endRow = Math.min(rowsCount - 1, startRow + visibleRows);

    return { startRow, endRow };
  }, [scrollTop, itemHeight, height, overscan, rowsCount, gap]);

  const visibleItems = useMemo(() => {
    const result: { item: T; index: number; style: CSSProperties }[] = [];

    for (let row = visibleRange.startRow; row <= visibleRange.endRow; row++) {
      for (let col = 0; col < columnsCount; col++) {
        const index = row * columnsCount + col;
        if (index >= items.length) break;

        result.push({
          item: items[index],
          index,
          style: {
            position: "absolute",
            top: row * (itemHeight + gap),
            left: col * (itemWidth + gap),
            width: itemWidth,
            height: itemHeight,
          },
        });
      }
    }

    return result;
  }, [items, visibleRange, columnsCount, itemWidth, itemHeight, gap]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      setScrollTop(target.scrollTop);
      onScroll?.(target.scrollTop);
    },
    [onScroll]
  );

  return (
    <div
      ref={containerRef}
      className={"overflow-auto " + className}
      style={{
        height,
        width: width === 800 ? "100%" : width,
        position: "relative",
        backgroundColor: colors.background,
      }}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: totalHeight,
          position: "relative",
        }}
      >
        {visibleItems.map(({ item, index, style }) => (
          <div key={index} style={style}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}) as <T>(props: VirtualGridProps<T>) => JSX.Element;

interface HorizontalVirtualListProps<T> {
  items: T[];
  itemWidth: number;
  height: number;
  width?: number | string;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
  gap?: number;
  onScroll?: (scrollLeft: number) => void;
}

/**
 * Horizontal Virtual List - Horizontal scrolling list
 */
export const HorizontalVirtualList = memo(function HorizontalVirtualList<T>({
  items,
  itemWidth,
  height,
  width = "100%",
  renderItem,
  overscan = 3,
  className = "",
  gap = 0,
  onScroll,
}: HorizontalVirtualListProps<T>) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setContainerWidth(container.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const totalWidth = items.length * (itemWidth + gap) - gap;

  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollLeft / (itemWidth + gap)) - overscan);
    const visibleCount = Math.ceil(containerWidth / (itemWidth + gap)) + 2 * overscan;
    const end = Math.min(items.length - 1, start + visibleCount);

    return { start, end };
  }, [scrollLeft, itemWidth, containerWidth, overscan, items.length, gap]);

  const visibleItems = useMemo(() => {
    const result: { item: T; index: number; style: CSSProperties }[] = [];

    for (let i = visibleRange.start; i <= visibleRange.end; i++) {
      result.push({
        item: items[i],
        index: i,
        style: {
          position: "absolute",
          left: i * (itemWidth + gap),
          top: 0,
          bottom: 0,
          width: itemWidth,
        },
      });
    }

    return result;
  }, [items, visibleRange, itemWidth, gap]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      setScrollLeft(target.scrollLeft);
      onScroll?.(target.scrollLeft);
    },
    [onScroll]
  );

  return (
    <div
      ref={containerRef}
      className={"overflow-x-auto overflow-y-hidden " + className}
      style={{
        height,
        width,
        position: "relative",
        backgroundColor: colors.background,
      }}
      onScroll={handleScroll}
    >
      <div
        style={{
          width: totalWidth,
          height: "100%",
          position: "relative",
        }}
      >
        {visibleItems.map(({ item, index, style }) => (
          <div key={index} style={style}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}) as <T>(props: HorizontalVirtualListProps<T>) => JSX.Element;

interface WindowedListProps<T> {
  items: T[];
  itemHeight: number;
  windowSize: number;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  onWindowChange?: (startIndex: number, endIndex: number) => void;
}

/**
 * Windowed List - Shows a window of items
 */
export const WindowedList = memo(function WindowedList<T>({
  items,
  itemHeight,
  windowSize,
  renderItem,
  className = "",
  onWindowChange,
}: WindowedListProps<T>) {
  const { colors } = useTheme();
  const [startIndex, setStartIndex] = useState(0);

  const endIndex = Math.min(startIndex + windowSize, items.length);
  const windowItems = items.slice(startIndex, endIndex);

  useEffect(() => {
    onWindowChange?.(startIndex, endIndex);
  }, [startIndex, endIndex, onWindowChange]);

  const scrollUp = useCallback(() => {
    setStartIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const scrollDown = useCallback(() => {
    setStartIndex((prev) => Math.min(items.length - windowSize, prev + 1));
  }, [items.length, windowSize]);

  return (
    <div className={className} style={{ color: colors.textPrimary }}>
      <button
        onClick={scrollUp}
        disabled={startIndex === 0}
        className="w-full p-2 disabled:opacity-30"
        style={{ backgroundColor: colors.coral + "20" }}
      >
        ▲
      </button>

      <div>
        <AnimatePresence mode="popLayout">
          {windowItems.map((item, i) => (
            <motion.div
              key={startIndex + i}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              style={{ height: itemHeight }}
            >
              {renderItem(item, startIndex + i)}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <button
        onClick={scrollDown}
        disabled={endIndex >= items.length}
        className="w-full p-2 disabled:opacity-30"
        style={{ backgroundColor: colors.coral + "20" }}
      >
        ▼
      </button>
    </div>
  );
}) as <T>(props: WindowedListProps<T>) => JSX.Element;

interface VirtualTableProps<T> {
  data: T[];
  columns: {
    key: string;
    header: string;
    width?: number;
    render?: (item: T, index: number) => ReactNode;
  }[];
  rowHeight: number;
  height: number;
  headerHeight?: number;
  className?: string;
  onRowClick?: (item: T, index: number) => void;
}

/**
 * Virtual Table - Virtualized table component
 */
export const VirtualTable = memo(function VirtualTable<T>({
  data,
  columns,
  rowHeight,
  height,
  headerHeight = 40,
  className = "",
  onRowClick,
}: VirtualTableProps<T>) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const bodyHeight = height - headerHeight;
  const totalHeight = data.length * rowHeight;

  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
    const visibleCount = Math.ceil(bodyHeight / rowHeight) + 4;
    const end = Math.min(data.length - 1, start + visibleCount);

    return { start, end };
  }, [scrollTop, rowHeight, bodyHeight, data.length]);

  const visibleRows = useMemo(() => {
    const result: { item: T; index: number; top: number }[] = [];

    for (let i = visibleRange.start; i <= visibleRange.end; i++) {
      result.push({
        item: data[i],
        index: i,
        top: i * rowHeight,
      });
    }

    return result;
  }, [data, visibleRange, rowHeight]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  }, []);

  return (
    <div
      className={"border rounded-lg overflow-hidden " + className}
      style={{
        height,
        borderColor: colors.textSecondary + "30",
        backgroundColor: colors.background,
      }}
    >
      {/* Header */}
      <div
        className="flex border-b"
        style={{
          height: headerHeight,
          backgroundColor: colors.coral + "10",
          borderColor: colors.textSecondary + "30",
        }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className="flex items-center px-4 font-semibold"
            style={{
              width: col.width || "auto",
              flex: col.width ? "none" : 1,
              color: colors.textPrimary,
            }}
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* Body */}
      <div
        ref={containerRef}
        className="overflow-auto"
        style={{ height: bodyHeight }}
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          {visibleRows.map(({ item, index, top }) => (
            <div
              key={index}
              className="flex border-b cursor-pointer hover:bg-opacity-50"
              style={{
                position: "absolute",
                top,
                left: 0,
                right: 0,
                height: rowHeight,
                borderColor: colors.textSecondary + "20",
                backgroundColor: index % 2 === 0 ? "transparent" : colors.coral + "05",
              }}
              onClick={() => onRowClick?.(item, index)}
            >
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="flex items-center px-4"
                  style={{
                    width: col.width || "auto",
                    flex: col.width ? "none" : 1,
                    color: colors.textPrimary,
                  }}
                >
                  {col.render
                    ? col.render(item, index)
                    : String((item as Record<string, unknown>)[col.key] ?? "")}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}) as <T>(props: VirtualTableProps<T>) => JSX.Element;

interface VirtualMasonryProps<T> {
  items: T[];
  columnCount: number;
  getItemHeight: (item: T, index: number, width: number) => number;
  renderItem: (item: T, index: number) => ReactNode;
  height: number;
  width?: number;
  gap?: number;
  className?: string;
  overscan?: number;
}

/**
 * Virtual Masonry - Masonry layout virtualization
 */
export const VirtualMasonry = memo(function VirtualMasonry<T>({
  items,
  columnCount,
  getItemHeight,
  renderItem,
  height,
  width = 800,
  gap = 8,
  className = "",
  overscan = 3,
}: VirtualMasonryProps<T>) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerWidth, setContainerWidth] = useState(width);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const columnWidth = (containerWidth - (columnCount - 1) * gap) / columnCount;

  const { positions, totalHeight } = useMemo(() => {
    const columnHeights = new Array(columnCount).fill(0);
    const itemPositions: { top: number; left: number; width: number; height: number }[] = [];

    for (let i = 0; i < items.length; i++) {
      // Find shortest column
      let minCol = 0;
      let minHeight = columnHeights[0];

      for (let col = 1; col < columnCount; col++) {
        if (columnHeights[col] < minHeight) {
          minHeight = columnHeights[col];
          minCol = col;
        }
      }

      const itemHeight = getItemHeight(items[i], i, columnWidth);

      itemPositions.push({
        top: minHeight,
        left: minCol * (columnWidth + gap),
        width: columnWidth,
        height: itemHeight,
      });

      columnHeights[minCol] = minHeight + itemHeight + gap;
    }

    return {
      positions: itemPositions,
      totalHeight: Math.max(...columnHeights) - gap,
    };
  }, [items, columnCount, columnWidth, gap, getItemHeight]);

  const visibleItems = useMemo(() => {
    const result: { item: T; index: number; style: CSSProperties }[] = [];
    const viewTop = scrollTop - overscan * 100;
    const viewBottom = scrollTop + height + overscan * 100;

    for (let i = 0; i < items.length; i++) {
      const pos = positions[i];
      const itemBottom = pos.top + pos.height;

      if (itemBottom >= viewTop && pos.top <= viewBottom) {
        result.push({
          item: items[i],
          index: i,
          style: {
            position: "absolute",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            height: pos.height,
          },
        });
      }
    }

    return result;
  }, [items, positions, scrollTop, height, overscan]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  }, []);

  return (
    <div
      ref={containerRef}
      className={"overflow-auto " + className}
      style={{
        height,
        width: width === 800 ? "100%" : width,
        position: "relative",
        backgroundColor: colors.background,
      }}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: totalHeight,
          position: "relative",
        }}
      >
        {visibleItems.map(({ item, index, style }) => (
          <div key={index} style={style}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}) as <T>(props: VirtualMasonryProps<T>) => JSX.Element;

interface GroupedVirtualListProps<T> {
  groups: { title: string; items: T[] }[];
  itemHeight: number;
  groupHeaderHeight: number;
  height: number;
  width?: number | string;
  renderItem: (item: T, index: number, groupIndex: number) => ReactNode;
  renderGroupHeader: (title: string, groupIndex: number) => ReactNode;
  overscan?: number;
  className?: string;
  stickyHeaders?: boolean;
}

/**
 * Grouped Virtual List - Virtualized list with groups
 */
export const GroupedVirtualList = memo(function GroupedVirtualList<T>({
  groups,
  itemHeight,
  groupHeaderHeight,
  height,
  width = "100%",
  renderItem,
  renderGroupHeader,
  overscan = 3,
  className = "",
  stickyHeaders = true,
}: GroupedVirtualListProps<T>) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const { flatItems, totalHeight, groupPositions } = useMemo(() => {
    const flat: { type: "header" | "item"; data: any; groupIndex: number; itemIndex: number }[] = [];
    const positions: { title: string; top: number }[] = [];
    let currentTop = 0;

    groups.forEach((group, groupIndex) => {
      positions.push({ title: group.title, top: currentTop });
      flat.push({ type: "header", data: group.title, groupIndex, itemIndex: -1 });
      currentTop += groupHeaderHeight;

      group.items.forEach((item, itemIndex) => {
        flat.push({ type: "item", data: item, groupIndex, itemIndex });
        currentTop += itemHeight;
      });
    });

    return { flatItems: flat, totalHeight: currentTop, groupPositions: positions };
  }, [groups, itemHeight, groupHeaderHeight]);

  const visibleItems = useMemo(() => {
    const result: { entry: typeof flatItems[0]; top: number }[] = [];
    let currentTop = 0;
    const viewTop = scrollTop - overscan * itemHeight;
    const viewBottom = scrollTop + height + overscan * itemHeight;

    for (const entry of flatItems) {
      const entryHeight = entry.type === "header" ? groupHeaderHeight : itemHeight;
      const entryBottom = currentTop + entryHeight;

      if (entryBottom >= viewTop && currentTop <= viewBottom) {
        result.push({ entry, top: currentTop });
      }

      currentTop += entryHeight;
    }

    return result;
  }, [flatItems, scrollTop, height, overscan, itemHeight, groupHeaderHeight]);

  const currentGroup = useMemo(() => {
    for (let i = groupPositions.length - 1; i >= 0; i--) {
      if (groupPositions[i].top <= scrollTop) {
        return groupPositions[i];
      }
    }
    return groupPositions[0];
  }, [groupPositions, scrollTop]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  }, []);

  return (
    <div
      ref={containerRef}
      className={"overflow-auto " + className}
      style={{
        height,
        width,
        position: "relative",
        backgroundColor: colors.background,
      }}
      onScroll={handleScroll}
    >
      {/* Sticky header */}
      {stickyHeaders && currentGroup && (
        <div
          className="sticky top-0 z-10"
          style={{
            height: groupHeaderHeight,
            backgroundColor: colors.background,
            borderBottom: "1px solid " + colors.textSecondary + "30",
          }}
        >
          {renderGroupHeader(
            currentGroup.title,
            groupPositions.indexOf(currentGroup)
          )}
        </div>
      )}

      <div
        style={{
          height: totalHeight,
          position: "relative",
          marginTop: stickyHeaders ? -groupHeaderHeight : 0,
        }}
      >
        {visibleItems.map(({ entry, top }, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top,
              left: 0,
              right: 0,
              height: entry.type === "header" ? groupHeaderHeight : itemHeight,
            }}
          >
            {entry.type === "header"
              ? renderGroupHeader(entry.data, entry.groupIndex)
              : renderItem(entry.data, entry.itemIndex, entry.groupIndex)}
          </div>
        ))}
      </div>
    </div>
  );
}) as <T>(props: GroupedVirtualListProps<T>) => JSX.Element;

export default VirtualList;
