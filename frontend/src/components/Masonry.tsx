"use client";

/**
 * Masonry Components - Sprint 694
 *
 * Pinterest-style grid layouts:
 * - Auto-flowing columns
 * - Responsive breakpoints
 * - Animated layout
 * - Virtual scrolling ready
 * - HER-themed styling
 */

import React, { memo, useState, useEffect, useRef, useCallback, ReactNode, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface MasonryItem {
  id: string;
  height?: number;
  [key: string]: any;
}

interface MasonryProps<T extends MasonryItem> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  columns?: number | { sm?: number; md?: number; lg?: number; xl?: number };
  gap?: number;
  animated?: boolean;
  className?: string;
}

/**
 * Masonry Layout Component
 */
export const Masonry = memo(function Masonry<T extends MasonryItem>({
  items,
  renderItem,
  columns = 3,
  gap = 16,
  animated = true,
  className = "",
}: MasonryProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(
    typeof columns === "number" ? columns : 3
  );

  // Handle responsive columns
  useEffect(() => {
    if (typeof columns === "number") {
      setColumnCount(columns);
      return;
    }

    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 1280 && columns.xl) {
        setColumnCount(columns.xl);
      } else if (width >= 1024 && columns.lg) {
        setColumnCount(columns.lg);
      } else if (width >= 768 && columns.md) {
        setColumnCount(columns.md);
      } else if (columns.sm) {
        setColumnCount(columns.sm);
      } else {
        setColumnCount(2);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [columns]);

  // Distribute items across columns
  const columnItems = useMemo(() => {
    const cols: T[][] = Array.from({ length: columnCount }, () => []);
    const heights = Array(columnCount).fill(0);

    items.forEach((item) => {
      const shortestColumn = heights.indexOf(Math.min(...heights));
      cols[shortestColumn].push(item);
      heights[shortestColumn] += item.height || 200;
    });

    return cols;
  }, [items, columnCount]);

  const MotionWrapper = animated ? motion.div : "div" as any;
  const motionProps = animated
    ? {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95 },
        transition: { duration: 0.3 },
      }
    : {};

  return (
    <div
      ref={containerRef}
      className={"flex " + className}
      style={{ gap }}
    >
      {columnItems.map((column, colIndex) => (
        <div
          key={colIndex}
          className="flex-1 flex flex-col"
          style={{ gap }}
        >
          <AnimatePresence mode="popLayout">
            {column.map((item, itemIndex) => (
              <MotionWrapper
                key={item.id}
                {...motionProps}
                layout={animated}
              >
                {renderItem(item, items.indexOf(item))}
              </MotionWrapper>
            ))}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}) as <T extends MasonryItem>(props: MasonryProps<T>) => JSX.Element;

interface MasonryCardProps {
  children: ReactNode;
  aspectRatio?: number;
  onClick?: () => void;
  className?: string;
}

/**
 * Pre-styled Masonry Card
 */
export const MasonryCard = memo(function MasonryCard({
  children,
  aspectRatio,
  onClick,
  className = "",
}: MasonryCardProps) {
  const { colors } = useTheme();

  return (
    <motion.div
      onClick={onClick}
      className={"rounded-xl overflow-hidden " + className}
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${colors.cream}`,
        aspectRatio: aspectRatio ? `${aspectRatio}` : undefined,
        cursor: onClick ? "pointer" : "default",
      }}
      whileHover={onClick ? { scale: 1.02, y: -4 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
    >
      {children}
    </motion.div>
  );
});

interface ImageMasonryItem extends MasonryItem {
  src: string;
  alt?: string;
  title?: string;
  description?: string;
}

interface ImageMasonryProps {
  items: ImageMasonryItem[];
  columns?: number | { sm?: number; md?: number; lg?: number; xl?: number };
  gap?: number;
  onItemClick?: (item: ImageMasonryItem) => void;
  className?: string;
}

/**
 * Image-specific Masonry Layout
 */
export const ImageMasonry = memo(function ImageMasonry({
  items,
  columns = { sm: 2, md: 3, lg: 4 },
  gap = 16,
  onItemClick,
  className = "",
}: ImageMasonryProps) {
  const { colors } = useTheme();

  return (
    <Masonry
      items={items}
      columns={columns}
      gap={gap}
      className={className}
      renderItem={(item) => (
        <MasonryCard
          onClick={onItemClick ? () => onItemClick(item) : undefined}
        >
          <div className="relative">
            <img
              src={item.src}
              alt={item.alt || ""}
              className="w-full h-auto object-cover"
              loading="lazy"
            />
            {(item.title || item.description) && (
              <div
                className="absolute bottom-0 left-0 right-0 p-3"
                style={{
                  background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
                }}
              >
                {item.title && (
                  <h3 className="text-white font-medium text-sm">
                    {item.title}
                  </h3>
                )}
                {item.description && (
                  <p className="text-white/80 text-xs mt-1">
                    {item.description}
                  </p>
                )}
              </div>
            )}
          </div>
        </MasonryCard>
      )}
    />
  );
});

interface CardMasonryItem extends MasonryItem {
  title: string;
  content?: ReactNode;
  image?: string;
  tags?: string[];
  footer?: ReactNode;
}

interface CardMasonryProps {
  items: CardMasonryItem[];
  columns?: number | { sm?: number; md?: number; lg?: number; xl?: number };
  gap?: number;
  onItemClick?: (item: CardMasonryItem) => void;
  className?: string;
}

/**
 * Card-based Masonry Layout
 */
export const CardMasonry = memo(function CardMasonry({
  items,
  columns = { sm: 1, md: 2, lg: 3 },
  gap = 16,
  onItemClick,
  className = "",
}: CardMasonryProps) {
  const { colors } = useTheme();

  return (
    <Masonry
      items={items}
      columns={columns}
      gap={gap}
      className={className}
      renderItem={(item) => (
        <MasonryCard onClick={onItemClick ? () => onItemClick(item) : undefined}>
          {item.image && (
            <img
              src={item.image}
              alt={item.title}
              className="w-full h-40 object-cover"
              loading="lazy"
            />
          )}
          <div className="p-4">
            <h3
              className="font-semibold text-base"
              style={{ color: colors.textPrimary }}
            >
              {item.title}
            </h3>
            {item.content && (
              <div className="mt-2" style={{ color: colors.textMuted }}>
                {item.content}
              </div>
            )}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {item.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs rounded-full"
                    style={{
                      backgroundColor: colors.cream,
                      color: colors.textPrimary,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {item.footer && (
              <div
                className="mt-3 pt-3 border-t"
                style={{ borderColor: colors.cream }}
              >
                {item.footer}
              </div>
            )}
          </div>
        </MasonryCard>
      )}
    />
  );
});

interface QuoteMasonryItem extends MasonryItem {
  quote: string;
  author: string;
  source?: string;
}

interface QuoteMasonryProps {
  items: QuoteMasonryItem[];
  columns?: number;
  gap?: number;
  className?: string;
}

/**
 * Quote-specific Masonry Layout
 */
export const QuoteMasonry = memo(function QuoteMasonry({
  items,
  columns = 3,
  gap = 16,
  className = "",
}: QuoteMasonryProps) {
  const { colors } = useTheme();

  return (
    <Masonry
      items={items}
      columns={columns}
      gap={gap}
      className={className}
      renderItem={(item) => (
        <MasonryCard>
          <div className="p-5">
            <svg
              width={24}
              height={24}
              viewBox="0 0 24 24"
              fill={colors.coral}
              className="mb-3 opacity-50"
            >
              <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
            </svg>
            <p
              className="text-base italic leading-relaxed"
              style={{ color: colors.textPrimary }}
            >
              "{item.quote}"
            </p>
            <div className="mt-4">
              <p
                className="font-medium text-sm"
                style={{ color: colors.textPrimary }}
              >
                — {item.author}
              </p>
              {item.source && (
                <p
                  className="text-xs mt-0.5"
                  style={{ color: colors.textMuted }}
                >
                  {item.source}
                </p>
              )}
            </div>
          </div>
        </MasonryCard>
      )}
    />
  );
});

// Hook for creating masonry items with unique IDs
export function useMasonryItems<T extends Omit<MasonryItem, "id">>(
  initialItems: T[]
): [
  (T & { id: string })[],
  {
    add: (item: T) => void;
    remove: (id: string) => void;
    update: (id: string, updates: Partial<T>) => void;
    reset: () => void;
  }
] {
  const [items, setItems] = useState<(T & { id: string })[]>(
    initialItems.map((item, i) => ({ ...item, id: `item-${i}-${Date.now()}` }))
  );

  const add = useCallback((item: T) => {
    setItems((prev) => [...prev, { ...item, id: `item-${Date.now()}` }]);
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const update = useCallback((id: string, updates: Partial<T>) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      )
    );
  }, []);

  const reset = useCallback(() => {
    setItems(
      initialItems.map((item, i) => ({ ...item, id: `item-${i}-${Date.now()}` }))
    );
  }, [initialItems]);

  return [items, { add, remove, update, reset }];
}

export default Masonry;
