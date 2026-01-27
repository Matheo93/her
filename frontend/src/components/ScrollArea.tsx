"use client";

/**
 * Scroll Area Components - Sprint 752
 *
 * Custom scrollable areas:
 * - Custom scrollbars
 * - Scroll indicators
 * - Scroll to top
 * - Infinite scroll
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface ScrollAreaProps {
  children: ReactNode;
  height?: string | number;
  maxHeight?: string | number;
  showScrollbar?: "auto" | "always" | "hover" | "never";
  scrollbarWidth?: "thin" | "normal";
  showScrollToTop?: boolean;
  scrollToTopThreshold?: number;
  onScroll?: (scrollTop: number, scrollHeight: number) => void;
  onReachEnd?: () => void;
  endThreshold?: number;
  className?: string;
}

/**
 * Scroll Area
 */
export const ScrollArea = memo(function ScrollArea({
  children,
  height,
  maxHeight,
  showScrollbar = "auto",
  scrollbarWidth = "thin",
  showScrollToTop = true,
  scrollToTopThreshold = 200,
  onScroll,
  onReachEnd,
  endThreshold = 100,
  className = "",
}: ScrollAreaProps) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTopButton, setShowTopButton] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;

    // Show/hide scroll to top button
    setShowTopButton(scrollTop > scrollToTopThreshold);

    // Trigger onScroll callback
    onScroll?.(scrollTop, scrollHeight);

    // Check if reached end
    if (onReachEnd && scrollHeight - scrollTop - clientHeight < endThreshold) {
      onReachEnd();
    }

    // Track scrolling state
    setIsScrolling(true);
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  }, [scrollToTopThreshold, onScroll, onReachEnd, endThreshold]);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const scrollbarStyles = {
    thin: { width: 6 },
    normal: { width: 10 },
  };

  const scrollbarVisibility = {
    auto: "hover:opacity-100 opacity-0",
    always: "opacity-100",
    hover: "group-hover:opacity-100 opacity-0",
    never: "opacity-0 pointer-events-none",
  };

  return (
    <div className={"relative group " + className}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto scrollbar-thin"
        style={{
          height,
          maxHeight,
          scrollbarWidth: scrollbarWidth,
          scrollbarColor: colors.coral + " " + colors.cream,
        }}
      >
        {children}
      </div>

      {/* Custom scrollbar overlay */}
      <div
        className={"absolute right-0 top-0 bottom-0 transition-opacity duration-200 " + scrollbarVisibility[showScrollbar]}
        style={{ width: scrollbarStyles[scrollbarWidth].width }}
      >
        <ScrollbarTrack
          containerRef={containerRef}
          color={colors.coral}
          trackColor={colors.cream}
          width={scrollbarStyles[scrollbarWidth].width}
        />
      </div>

      {/* Scroll to top button */}
      <AnimatePresence>
        {showScrollToTop && showTopButton && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToTop}
            className="absolute bottom-4 right-4 w-10 h-10 rounded-full shadow-lg flex items-center justify-center"
            style={{ backgroundColor: colors.coral }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <ChevronUpIcon color={colors.warmWhite} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
});

interface ScrollbarTrackProps {
  containerRef: React.RefObject<HTMLDivElement>;
  color: string;
  trackColor: string;
  width: number;
}

/**
 * Custom Scrollbar Track
 */
const ScrollbarTrack = memo(function ScrollbarTrack({
  containerRef,
  color,
  trackColor,
  width,
}: ScrollbarTrackProps) {
  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop, setThumbTop] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartScrollTop = useRef(0);

  const updateThumb = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const trackHeight = clientHeight;
    const ratio = clientHeight / scrollHeight;

    setThumbHeight(Math.max(30, trackHeight * ratio));
    setThumbTop((scrollTop / scrollHeight) * trackHeight);
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateThumb();
    container.addEventListener("scroll", updateThumb);

    const resizeObserver = new ResizeObserver(updateThumb);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", updateThumb);
      resizeObserver.disconnect();
    };
  }, [containerRef, updateThumb]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartScrollTop.current = containerRef.current?.scrollTop || 0;
  }, [containerRef]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const deltaY = e.clientY - dragStartY.current;
      const { scrollHeight, clientHeight } = container;
      const scrollRatio = scrollHeight / clientHeight;
      container.scrollTop = dragStartScrollTop.current + deltaY * scrollRatio;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, containerRef]);

  const container = containerRef.current;
  if (!container || container.scrollHeight <= container.clientHeight) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 rounded-full"
      style={{ backgroundColor: trackColor }}
    >
      <motion.div
        className="absolute rounded-full cursor-pointer"
        style={{
          backgroundColor: color,
          width: width,
          height: thumbHeight,
          top: thumbTop,
        }}
        onMouseDown={handleMouseDown}
        whileHover={{ opacity: 0.8 }}
      />
    </div>
  );
});

interface ScrollIndicatorProps {
  direction?: "top" | "bottom" | "both";
  fadeHeight?: number;
  className?: string;
}

/**
 * Scroll Fade Indicator
 */
export const ScrollFadeIndicator = memo(function ScrollFadeIndicator({
  direction = "both",
  fadeHeight = 40,
  className = "",
}: ScrollIndicatorProps) {
  const { colors } = useTheme();

  return (
    <>
      {(direction === "top" || direction === "both") && (
        <div
          className={"absolute top-0 left-0 right-0 pointer-events-none z-10 " + className}
          style={{
            height: fadeHeight,
            background: "linear-gradient(to bottom, " + colors.warmWhite + ", transparent)",
          }}
        />
      )}
      {(direction === "bottom" || direction === "both") && (
        <div
          className={"absolute bottom-0 left-0 right-0 pointer-events-none z-10 " + className}
          style={{
            height: fadeHeight,
            background: "linear-gradient(to top, " + colors.warmWhite + ", transparent)",
          }}
        />
      )}
    </>
  );
});

interface ScrollProgressProps {
  target?: React.RefObject<HTMLElement>;
  position?: "top" | "bottom";
  height?: number;
  className?: string;
}

/**
 * Scroll Progress Bar
 */
export const ScrollProgress = memo(function ScrollProgress({
  target,
  position = "top",
  height = 3,
  className = "",
}: ScrollProgressProps) {
  const { colors } = useTheme();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const element = target?.current || window;
    
    const handleScroll = () => {
      if (target?.current) {
        const { scrollTop, scrollHeight, clientHeight } = target.current;
        setProgress((scrollTop / (scrollHeight - clientHeight)) * 100);
      } else {
        const { scrollY } = window;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        setProgress((scrollY / docHeight) * 100);
      }
    };

    element.addEventListener("scroll", handleScroll);
    return () => element.removeEventListener("scroll", handleScroll);
  }, [target]);

  return (
    <div
      className={"fixed left-0 right-0 z-50 " + (position === "top" ? "top-0" : "bottom-0") + " " + className}
      style={{ height, backgroundColor: colors.cream }}
    >
      <motion.div
        className="h-full"
        style={{ backgroundColor: colors.coral }}
        animate={{ width: progress + "%" }}
        transition={{ duration: 0.1 }}
      />
    </div>
  );
});

interface VirtualScrollProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
}

/**
 * Virtual Scroll for large lists
 */
export function VirtualScroll<T>({
  items,
  itemHeight,
  renderItem,
  overscan = 3,
  className = "",
}: VirtualScrollProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });

    container.addEventListener("scroll", handleScroll);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      className={"overflow-y-auto " + className}
      style={{ height: containerHeight || "100%" }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.map((item, i) => (
          <div
            key={startIndex + i}
            style={{
              position: "absolute",
              top: (startIndex + i) * itemHeight,
              height: itemHeight,
              left: 0,
              right: 0,
            }}
          >
            {renderItem(item, startIndex + i)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Icons
const ChevronUpIcon = ({ color = "currentColor" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

export default ScrollArea;
