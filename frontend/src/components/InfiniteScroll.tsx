"use client";

/**
 * InfiniteScroll Components - Sprint 684
 *
 * Infinite scrolling patterns:
 * - Scroll detection
 * - Load more
 * - Virtual scrolling
 * - Pull to refresh
 * - HER-themed styling
 */

import React, { memo, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface InfiniteScrollProps {
  children: ReactNode;
  hasMore: boolean;
  loadMore: () => void | Promise<void>;
  loading?: boolean;
  threshold?: number;
  loader?: ReactNode;
  endMessage?: ReactNode;
  className?: string;
}

/**
 * Basic Infinite Scroll
 */
export const InfiniteScroll = memo(function InfiniteScroll({
  children,
  hasMore,
  loadMore,
  loading = false,
  threshold = 100,
  loader,
  endMessage,
  className = "",
}: InfiniteScrollProps) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const handleScroll = useCallback(() => {
    if (!containerRef.current || !hasMore || loading || loadingRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceFromBottom <= threshold) {
      loadingRef.current = true;
      Promise.resolve(loadMore()).finally(() => {
        loadingRef.current = false;
      });
    }
  }, [hasMore, loading, loadMore, threshold]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <div
      ref={containerRef}
      className={"overflow-auto " + className}
      style={{ scrollBehavior: "smooth" }}
    >
      {children}

      {loading && (
        <div className="flex justify-center py-4">
          {loader || <LoadingSpinner />}
        </div>
      )}

      {!hasMore && !loading && endMessage && (
        <div className="text-center py-4" style={{ color: colors.textMuted }}>
          {endMessage}
        </div>
      )}
    </div>
  );
});

interface WindowInfiniteScrollProps {
  children: ReactNode;
  hasMore: boolean;
  loadMore: () => void | Promise<void>;
  loading?: boolean;
  threshold?: number;
  loader?: ReactNode;
  className?: string;
}

/**
 * Window-based Infinite Scroll
 */
export const WindowInfiniteScroll = memo(function WindowInfiniteScroll({
  children,
  hasMore,
  loadMore,
  loading = false,
  threshold = 200,
  loader,
  className = "",
}: WindowInfiniteScrollProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !loadingRef.current) {
          loadingRef.current = true;
          Promise.resolve(loadMore()).finally(() => {
            loadingRef.current = false;
          });
        }
      },
      {
        rootMargin: `${threshold}px`,
      }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loading, loadMore, threshold]);

  return (
    <div className={className}>
      {children}

      {hasMore && (
        <div ref={sentinelRef} className="h-1">
          {loading && (
            <div className="flex justify-center py-4">
              {loader || <LoadingSpinner />}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  pullDistance?: number;
  refreshingContent?: ReactNode;
  pullingContent?: ReactNode;
  className?: string;
}

/**
 * Pull to Refresh Component
 */
export const PullToRefresh = memo(function PullToRefresh({
  children,
  onRefresh,
  pullDistance = 80,
  refreshingContent,
  pullingContent,
  className = "",
}: PullToRefreshProps) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullProgress, setPullProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (containerRef.current?.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startY.current === 0 || refreshing) return;

    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;

    if (delta > 0 && containerRef.current?.scrollTop === 0) {
      e.preventDefault();
      const progress = Math.min(delta / pullDistance, 1.5);
      setPullProgress(progress);
    }
  }, [pullDistance, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (pullProgress >= 1 && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    startY.current = 0;
    currentY.current = 0;
    setPullProgress(0);
  }, [pullProgress, refreshing, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div
      ref={containerRef}
      className={"overflow-auto touch-pan-y " + className}
      style={{
        transform: pullProgress > 0 ? `translateY(${pullProgress * pullDistance * 0.5}px)` : undefined,
        transition: pullProgress === 0 ? "transform 0.2s ease-out" : undefined,
      }}
    >
      {/* Pull indicator */}
      <AnimatePresence>
        {(pullProgress > 0 || refreshing) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{
              opacity: 1,
              height: refreshing ? 60 : pullProgress * pullDistance,
            }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-center overflow-hidden"
            style={{ color: colors.textMuted }}
          >
            {refreshing ? (
              refreshingContent || <LoadingSpinner />
            ) : (
              pullingContent || (
                <motion.div
                  animate={{ rotate: pullProgress * 180 }}
                  className="text-sm"
                >
                  {pullProgress >= 1 ? "Release to refresh" : "Pull to refresh"}
                </motion.div>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </div>
  );
});

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
}

/**
 * Virtual List for large datasets
 */
export const VirtualList = memo(function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  overscan = 3,
  className = "",
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight) + 2 * overscan;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      className={"overflow-auto " + className}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.map((item, index) => (
          <div
            key={startIndex + index}
            style={{
              position: "absolute",
              top: (startIndex + index) * itemHeight,
              left: 0,
              right: 0,
              height: itemHeight,
            }}
          >
            {renderItem(item, startIndex + index)}
          </div>
        ))}
      </div>
    </div>
  );
}) as <T>(props: VirtualListProps<T>) => JSX.Element;

interface LoadMoreButtonProps {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  loadingText?: string;
  buttonText?: string;
  className?: string;
}

/**
 * Load More Button
 */
export const LoadMoreButton = memo(function LoadMoreButton({
  hasMore,
  loading,
  onClick,
  loadingText = "Loading...",
  buttonText = "Load More",
  className = "",
}: LoadMoreButtonProps) {
  const { colors } = useTheme();

  if (!hasMore) return null;

  return (
    <div className={"flex justify-center py-4 " + className}>
      <motion.button
        onClick={onClick}
        disabled={loading}
        className="px-6 py-2.5 rounded-lg text-sm font-medium"
        style={{
          backgroundColor: colors.coral,
          color: colors.warmWhite,
          opacity: loading ? 0.7 : 1,
          cursor: loading ? "not-allowed" : "pointer",
        }}
        whileHover={loading ? {} : { scale: 1.02 }}
        whileTap={loading ? {} : { scale: 0.98 }}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <LoadingSpinner size={16} />
            {loadingText}
          </span>
        ) : (
          buttonText
        )}
      </motion.button>
    </div>
  );
});

interface ScrollToTopProps {
  showAfter?: number;
  smooth?: boolean;
  className?: string;
}

/**
 * Scroll to Top Button
 */
export const ScrollToTop = memo(function ScrollToTop({
  showAfter = 300,
  smooth = true,
  className = "",
}: ScrollToTopProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > showAfter);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [showAfter]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={scrollToTop}
          className={
            "fixed bottom-6 right-6 w-12 h-12 rounded-full shadow-lg " +
            "flex items-center justify-center " +
            className
          }
          style={{
            backgroundColor: colors.coral,
            color: colors.warmWhite,
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronUpIcon />
        </motion.button>
      )}
    </AnimatePresence>
  );
});

// Icons
function LoadingSpinner({ size = 24 }: { size?: number }) {
  const { colors } = useTheme();

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.coral}
      strokeWidth={2}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    >
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </motion.svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

export default InfiniteScroll;
