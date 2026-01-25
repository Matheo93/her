"use client";

/**
 * Splitter Components - Sprint 698
 *
 * Resizable panel dividers:
 * - Horizontal/Vertical splits
 * - Min/Max constraints
 * - Collapse support
 * - Persistent state
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useCallback, ReactNode, useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type SplitterDirection = "horizontal" | "vertical";

interface SplitterProps {
  children: [ReactNode, ReactNode];
  direction?: SplitterDirection;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  collapsible?: boolean;
  collapseThreshold?: number;
  onResize?: (size: number) => void;
  storageKey?: string;
  className?: string;
}

/**
 * Splitter Component
 */
export const Splitter = memo(function Splitter({
  children,
  direction = "horizontal",
  defaultSize = 50,
  minSize = 10,
  maxSize = 90,
  collapsible = false,
  collapseThreshold = 5,
  onResize,
  storageKey,
  className = "",
}: SplitterProps) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      const stored = localStorage.getItem(`splitter:${storageKey}`);
      if (stored) return parseFloat(stored);
    }
    return defaultSize;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isHorizontal = direction === "horizontal";

  // Persist size
  useEffect(() => {
    if (storageKey && typeof window !== "undefined") {
      localStorage.setItem(`splitter:${storageKey}`, size.toString());
    }
  }, [size, storageKey]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      let newSize: number;

      if (isHorizontal) {
        newSize = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        newSize = ((e.clientY - rect.top) / rect.height) * 100;
      }

      // Apply constraints
      if (collapsible && newSize < collapseThreshold) {
        setIsCollapsed(true);
        newSize = 0;
      } else if (collapsible && isCollapsed && newSize > collapseThreshold) {
        setIsCollapsed(false);
      }

      newSize = Math.max(isCollapsed ? 0 : minSize, Math.min(maxSize, newSize));
      setSize(newSize);
      onResize?.(newSize);
    },
    [isDragging, isHorizontal, minSize, maxSize, collapsible, collapseThreshold, isCollapsed, onResize]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, isHorizontal]);

  const handleDoubleClick = useCallback(() => {
    if (collapsible) {
      if (isCollapsed) {
        setIsCollapsed(false);
        setSize(defaultSize);
      } else {
        setIsCollapsed(true);
        setSize(0);
      }
    } else {
      setSize(50);
    }
  }, [collapsible, isCollapsed, defaultSize]);

  return (
    <div
      ref={containerRef}
      className={"flex relative " + (isHorizontal ? "flex-row" : "flex-col") + " " + className}
      style={{ height: "100%", width: "100%" }}
    >
      {/* First Panel */}
      <div
        style={{
          [isHorizontal ? "width" : "height"]: `${size}%`,
          overflow: "auto",
          flexShrink: 0,
          transition: isDragging ? "none" : "all 0.2s ease",
        }}
      >
        {children[0]}
      </div>

      {/* Handle */}
      <motion.div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className="flex items-center justify-center shrink-0"
        style={{
          [isHorizontal ? "width" : "height"]: 8,
          backgroundColor: isDragging ? colors.coral : colors.cream,
          cursor: isHorizontal ? "col-resize" : "row-resize",
        }}
        whileHover={{ backgroundColor: colors.coral }}
      >
        <div
          className="rounded-full"
          style={{
            [isHorizontal ? "height" : "width"]: 40,
            [isHorizontal ? "width" : "height"]: 4,
            backgroundColor: isDragging ? colors.warmWhite : colors.textMuted,
          }}
        />
      </motion.div>

      {/* Second Panel */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          transition: isDragging ? "none" : "all 0.2s ease",
        }}
      >
        {children[1]}
      </div>
    </div>
  );
});

interface SplitterPanelProps {
  children: ReactNode;
  minSize?: string;
  maxSize?: string;
  defaultSize?: string;
  className?: string;
}

/**
 * Panel wrapper for styling
 */
export const SplitterPanel = memo(function SplitterPanel({
  children,
  className = "",
}: SplitterPanelProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"h-full w-full overflow-auto " + className}
      style={{ backgroundColor: colors.warmWhite }}
    >
      {children}
    </div>
  );
});

interface TripleSplitterProps {
  children: [ReactNode, ReactNode, ReactNode];
  direction?: SplitterDirection;
  defaultSizes?: [number, number, number];
  minSize?: number;
  onResize?: (sizes: [number, number, number]) => void;
  className?: string;
}

/**
 * Three-way Splitter
 */
export const TripleSplitter = memo(function TripleSplitter({
  children,
  direction = "horizontal",
  defaultSizes = [33, 34, 33],
  minSize = 10,
  onResize,
  className = "",
}: TripleSplitterProps) {
  const [sizes, setSizes] = useState(defaultSizes);

  const handleFirstResize = useCallback(
    (newSize: number) => {
      const remaining = 100 - newSize;
      const ratio = sizes[1] / (sizes[1] + sizes[2]);
      const secondSize = remaining * ratio;
      const thirdSize = remaining - secondSize;
      const newSizes: [number, number, number] = [newSize, secondSize, thirdSize];
      setSizes(newSizes);
      onResize?.(newSizes);
    },
    [sizes, onResize]
  );

  return (
    <Splitter
      direction={direction}
      defaultSize={sizes[0]}
      minSize={minSize}
      maxSize={100 - 2 * minSize}
      onResize={handleFirstResize}
      className={className}
    >
      {children[0]}
      <Splitter
        direction={direction}
        defaultSize={(sizes[1] / (sizes[1] + sizes[2])) * 100}
        minSize={(minSize / (100 - sizes[0])) * 100}
        maxSize={100 - (minSize / (100 - sizes[0])) * 100}
      >
        {children[1]}
        {children[2]}
      </Splitter>
    </Splitter>
  );
});

interface CollapsibleSidebarProps {
  sidebar: ReactNode;
  content: ReactNode;
  side?: "left" | "right";
  sidebarWidth?: number;
  minWidth?: number;
  collapsedWidth?: number;
  storageKey?: string;
  className?: string;
}

/**
 * Collapsible Sidebar Layout
 */
export const CollapsibleSidebar = memo(function CollapsibleSidebar({
  sidebar,
  content,
  side = "left",
  sidebarWidth = 25,
  minWidth = 15,
  collapsedWidth = 0,
  storageKey,
  className = "",
}: CollapsibleSidebarProps) {
  const { colors } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(sidebarWidth);

  const handleResize = useCallback((size: number) => {
    if (size < 5) {
      setIsCollapsed(true);
      setWidth(collapsedWidth);
    } else {
      setIsCollapsed(false);
      setWidth(size);
    }
  }, [collapsedWidth]);

  const toggleCollapse = useCallback(() => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setWidth(sidebarWidth);
    } else {
      setIsCollapsed(true);
      setWidth(collapsedWidth);
    }
  }, [isCollapsed, sidebarWidth, collapsedWidth]);

  const sidebarElement = (
    <div className="relative h-full">
      {sidebar}
      <motion.button
        onClick={toggleCollapse}
        className="absolute top-2 p-1.5 rounded-lg"
        style={{
          [side === "left" ? "right" : "left"]: 8,
          backgroundColor: colors.cream,
          color: colors.textPrimary,
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          style={{
            transform: isCollapsed
              ? side === "left"
                ? "rotate(0deg)"
                : "rotate(180deg)"
              : side === "left"
              ? "rotate(180deg)"
              : "rotate(0deg)",
          }}
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </motion.button>
    </div>
  );

  const children: [ReactNode, ReactNode] =
    side === "left" ? [sidebarElement, content] : [content, sidebarElement];

  return (
    <Splitter
      direction="horizontal"
      defaultSize={side === "left" ? width : 100 - width}
      minSize={side === "left" ? collapsedWidth : 100 - 85}
      maxSize={side === "left" ? 40 : 100 - collapsedWidth}
      collapsible
      collapseThreshold={5}
      onResize={handleResize}
      storageKey={storageKey}
      className={className}
    >
      {children}
    </Splitter>
  );
});

// Custom hook for splitter state
export function useSplitter(
  defaultSize: number = 50,
  storageKey?: string
) {
  const [size, setSize] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      const stored = localStorage.getItem(`splitter:${storageKey}`);
      if (stored) return parseFloat(stored);
    }
    return defaultSize;
  });

  const [isCollapsed, setIsCollapsed] = useState(false);

  const resize = useCallback((newSize: number) => {
    setSize(newSize);
    if (storageKey && typeof window !== "undefined") {
      localStorage.setItem(`splitter:${storageKey}`, newSize.toString());
    }
  }, [storageKey]);

  const collapse = useCallback(() => {
    setIsCollapsed(true);
    setSize(0);
  }, []);

  const expand = useCallback(() => {
    setIsCollapsed(false);
    setSize(defaultSize);
  }, [defaultSize]);

  const toggle = useCallback(() => {
    if (isCollapsed) {
      expand();
    } else {
      collapse();
    }
  }, [isCollapsed, expand, collapse]);

  const reset = useCallback(() => {
    setSize(defaultSize);
    setIsCollapsed(false);
  }, [defaultSize]);

  return {
    size,
    isCollapsed,
    resize,
    collapse,
    expand,
    toggle,
    reset,
  };
}

export default Splitter;
