"use client";

/**
 * Side Panel Components - Sprint 810
 *
 * Side panel and drawer components:
 * - Slide-in panels
 * - Multiple positions
 * - Overlay options
 * - Resizable panels
 * - Nested panels
 * - HER-themed styling
 */

import React, {
  memo,
  useRef,
  useEffect,
  useState,
  useCallback,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { motion, AnimatePresence, useDragControls, PanInfo } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type Position = "left" | "right" | "top" | "bottom";
type Size = "sm" | "md" | "lg" | "xl" | "full";

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  position?: Position;
  size?: Size;
  children: ReactNode;
  overlay?: boolean;
  overlayClickClose?: boolean;
  showCloseButton?: boolean;
  title?: string;
  className?: string;
  resizable?: boolean;
  minSize?: number;
  maxSize?: number;
}

const SIZE_MAP: Record<Size, string | number> = {
  sm: 280,
  md: 360,
  lg: 480,
  xl: 640,
  full: "100%",
};

/**
 * SidePanel - Slide-in side panel
 */
export const SidePanel = memo(function SidePanel({
  isOpen,
  onClose,
  position = "right",
  size = "md",
  children,
  overlay = true,
  overlayClickClose = true,
  showCloseButton = true,
  title,
  className = "",
  resizable = false,
  minSize = 200,
  maxSize = 800,
}: SidePanelProps) {
  const { colors } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const [currentSize, setCurrentSize] = useState<number>(
    typeof SIZE_MAP[size] === "number" ? SIZE_MAP[size] as number : 360
  );
  const dragControls = useDragControls();

  const isHorizontal = position === "left" || position === "right";
  const sizeValue = typeof SIZE_MAP[size] === "number" ? SIZE_MAP[size] + "px" : SIZE_MAP[size];

  const variants = {
    left: {
      initial: { x: "-100%" },
      animate: { x: 0 },
      exit: { x: "-100%" },
    },
    right: {
      initial: { x: "100%" },
      animate: { x: 0 },
      exit: { x: "100%" },
    },
    top: {
      initial: { y: "-100%" },
      animate: { y: 0 },
      exit: { y: "-100%" },
    },
    bottom: {
      initial: { y: "100%" },
      animate: { y: 0 },
      exit: { y: "100%" },
    },
  };

  const handleResize = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const delta = isHorizontal
        ? position === "left" ? info.delta.x : -info.delta.x
        : position === "top" ? info.delta.y : -info.delta.y;

      setCurrentSize((prev) => {
        const newSize = prev + delta;
        return Math.max(minSize, Math.min(maxSize, newSize));
      });
    },
    [isHorizontal, position, minSize, maxSize]
  );

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    backgroundColor: colors.background,
    boxShadow: "-4px 0 20px rgba(0, 0, 0, 0.15)",
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    ...(isHorizontal
      ? {
          top: 0,
          bottom: 0,
          width: resizable ? currentSize : sizeValue,
          [position]: 0,
        }
      : {
          left: 0,
          right: 0,
          height: resizable ? currentSize : sizeValue,
          [position]: 0,
        }),
  };

  const resizeHandleStyle: React.CSSProperties = {
    position: "absolute",
    backgroundColor: "transparent",
    zIndex: 10,
    ...(isHorizontal
      ? {
          top: 0,
          bottom: 0,
          width: 8,
          cursor: "ew-resize",
          [position === "left" ? "right" : "left"]: -4,
        }
      : {
          left: 0,
          right: 0,
          height: 8,
          cursor: "ns-resize",
          [position === "top" ? "bottom" : "top"]: -4,
        }),
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          {overlay && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40"
              style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
              onClick={overlayClickClose ? onClose : undefined}
            />
          )}

          {/* Panel */}
          <motion.div
            ref={panelRef}
            variants={variants[position]}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={panelStyle}
            className={className}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: colors.textSecondary + "20" }}
              >
                {title && (
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: colors.textPrimary }}
                  >
                    {title}
                  </h2>
                )}
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="p-1 rounded hover:opacity-70 transition-opacity"
                    style={{ color: colors.textSecondary }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">{children}</div>

            {/* Resize handle */}
            {resizable && (
              <motion.div
                style={resizeHandleStyle}
                drag={isHorizontal ? "x" : "y"}
                dragControls={dragControls}
                dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
                dragElastic={0}
                onDrag={handleResize}
                whileHover={{ backgroundColor: colors.coral + "30" }}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  position?: Position;
  children: ReactNode;
  className?: string;
  handle?: boolean;
}

/**
 * Drawer - Mobile-friendly drawer with swipe
 */
export const Drawer = memo(function Drawer({
  isOpen,
  onClose,
  position = "bottom",
  children,
  className = "",
  handle = true,
}: DrawerProps) {
  const { colors } = useTheme();
  const [dragY, setDragY] = useState(0);

  const isVertical = position === "top" || position === "bottom";

  const handleDragEnd = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = 100;
      const velocity = isVertical ? info.velocity.y : info.velocity.x;
      const offset = isVertical ? info.offset.y : info.offset.x;

      const shouldClose =
        (position === "bottom" && (offset > threshold || velocity > 500)) ||
        (position === "top" && (offset < -threshold || velocity < -500)) ||
        (position === "right" && (offset > threshold || velocity > 500)) ||
        (position === "left" && (offset < -threshold || velocity < -500));

      if (shouldClose) {
        onClose();
      }
      setDragY(0);
    },
    [isVertical, position, onClose]
  );

  const variants = {
    bottom: {
      initial: { y: "100%" },
      animate: { y: 0 },
      exit: { y: "100%" },
    },
    top: {
      initial: { y: "-100%" },
      animate: { y: 0 },
      exit: { y: "-100%" },
    },
    left: {
      initial: { x: "-100%" },
      animate: { x: 0 },
      exit: { x: "-100%" },
    },
    right: {
      initial: { x: "100%" },
      animate: { x: 0 },
      exit: { x: "100%" },
    },
  };

  const dragConstraints = {
    bottom: { top: 0, bottom: 0 },
    top: { top: 0, bottom: 0 },
    left: { left: 0, right: 0 },
    right: { left: 0, right: 0 },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
            onClick={onClose}
          />

          <motion.div
            variants={variants[position]}
            initial="initial"
            animate="animate"
            exit="exit"
            drag={isVertical ? "y" : "x"}
            dragConstraints={dragConstraints[position]}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className={"fixed z-50 " + className}
            style={{
              backgroundColor: colors.background,
              borderRadius: position === "bottom" ? "24px 24px 0 0" : position === "top" ? "0 0 24px 24px" : 0,
              ...(isVertical
                ? { left: 0, right: 0, maxHeight: "80vh", [position]: 0 }
                : { top: 0, bottom: 0, maxWidth: "80vw", [position]: 0 }),
            }}
          >
            {/* Handle */}
            {handle && (
              <div
                className="flex justify-center py-3"
                style={{
                  order: position === "bottom" ? -1 : 1,
                }}
              >
                <div
                  className="w-12 h-1 rounded-full"
                  style={{ backgroundColor: colors.textSecondary + "40" }}
                />
              </div>
            )}

            <div className="overflow-auto p-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  snapPoints?: number[];
  defaultSnap?: number;
}

/**
 * Sheet - Bottom sheet with snap points
 */
export const Sheet = memo(function Sheet({
  isOpen,
  onClose,
  children,
  className = "",
  snapPoints = [0.25, 0.5, 0.9],
  defaultSnap = 0.5,
}: SheetProps) {
  const { colors } = useTheme();
  const [currentSnap, setCurrentSnap] = useState(defaultSnap);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const containerHeight = containerRef.current?.offsetHeight || window.innerHeight;
      const currentPosition = 1 - (info.point.y / containerHeight);

      // Find closest snap point
      let closest = snapPoints[0];
      let minDiff = Math.abs(currentPosition - snapPoints[0]);

      for (const snap of snapPoints) {
        const diff = Math.abs(currentPosition - snap);
        if (diff < minDiff) {
          minDiff = diff;
          closest = snap;
        }
      }

      // Close if dragged below minimum snap
      if (currentPosition < snapPoints[0] * 0.5 || info.velocity.y > 500) {
        onClose();
      } else {
        setCurrentSnap(closest);
      }
    },
    [snapPoints, onClose]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
            onClick={onClose}
          />

          <motion.div
            ref={containerRef}
            initial={{ y: "100%" }}
            animate={{ y: (1 - currentSnap) * 100 + "%" }}
            exit={{ y: "100%" }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.2 }}
            onDragEnd={handleDragEnd}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className={"fixed bottom-0 left-0 right-0 z-50 " + className}
            style={{
              height: "100vh",
              backgroundColor: colors.background,
              borderRadius: "24px 24px 0 0",
              boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.15)",
            }}
          >
            {/* Handle */}
            <div className="flex justify-center py-4">
              <div
                className="w-12 h-1 rounded-full"
                style={{ backgroundColor: colors.textSecondary + "40" }}
              />
            </div>

            {/* Snap indicators */}
            <div className="absolute right-4 top-1/4 flex flex-col gap-2">
              {snapPoints.map((snap) => (
                <button
                  key={snap}
                  onClick={() => setCurrentSnap(snap)}
                  className="w-2 h-2 rounded-full transition-colors"
                  style={{
                    backgroundColor:
                      currentSnap === snap
                        ? colors.coral
                        : colors.textSecondary + "30",
                  }}
                />
              ))}
            </div>

            <div className="overflow-auto h-full px-4 pb-8">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

// Nested panel context
interface PanelStackContextType {
  stack: string[];
  push: (id: string) => void;
  pop: () => void;
  clear: () => void;
}

const PanelStackContext = createContext<PanelStackContextType | null>(null);

interface PanelStackProviderProps {
  children: ReactNode;
}

/**
 * PanelStackProvider - Manage nested panel stack
 */
export const PanelStackProvider = memo(function PanelStackProvider({
  children,
}: PanelStackProviderProps) {
  const [stack, setStack] = useState<string[]>([]);

  const push = useCallback((id: string) => {
    setStack((prev) => [...prev, id]);
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setStack([]);
  }, []);

  return (
    <PanelStackContext.Provider value={{ stack, push, pop, clear }}>
      {children}
    </PanelStackContext.Provider>
  );
});

export function usePanelStack() {
  const context = useContext(PanelStackContext);
  if (!context) {
    throw new Error("usePanelStack must be used within a PanelStackProvider");
  }
  return context;
}

interface NestedPanelProps {
  id: string;
  children: ReactNode;
  title?: string;
  className?: string;
}

/**
 * NestedPanel - Panel that stacks on top of others
 */
export const NestedPanel = memo(function NestedPanel({
  id,
  children,
  title,
  className = "",
}: NestedPanelProps) {
  const { colors } = useTheme();
  const { stack, pop } = usePanelStack();

  const isOpen = stack.includes(id);
  const index = stack.indexOf(id);
  const offset = index * 40;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%", opacity: 0 }}
          animate={{
            x: offset,
            opacity: 1,
            scale: 1 - index * 0.02,
          }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={"fixed top-0 right-0 bottom-0 z-50 " + className}
          style={{
            width: "min(400px, 90vw)",
            backgroundColor: colors.background,
            boxShadow: "-4px 0 20px rgba(0, 0, 0, 0.15)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: colors.textSecondary + "20" }}
          >
            <button
              onClick={pop}
              className="p-1 hover:opacity-70"
              style={{ color: colors.textSecondary }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            {title && (
              <h2
                className="text-lg font-semibold flex-1 text-center"
                style={{ color: colors.textPrimary }}
              >
                {title}
              </h2>
            )}
            <div className="w-8" />
          </div>

          <div className="overflow-auto h-full p-4">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

interface SplitPanelProps {
  left: ReactNode;
  right: ReactNode;
  defaultSplit?: number;
  minLeft?: number;
  minRight?: number;
  className?: string;
}

/**
 * SplitPanel - Resizable split view
 */
export const SplitPanel = memo(function SplitPanel({
  left,
  right,
  defaultSplit = 50,
  minLeft = 20,
  minRight = 20,
  className = "",
}: SplitPanelProps) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(defaultSplit);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const newSplit = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(minLeft, Math.min(100 - minRight, newSplit));
      setSplit(clamped);
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
  }, [isDragging, minLeft, minRight]);

  return (
    <div
      ref={containerRef}
      className={"flex h-full " + className}
      style={{ userSelect: isDragging ? "none" : "auto" }}
    >
      <div
        className="overflow-auto"
        style={{ width: split + "%", flexShrink: 0 }}
      >
        {left}
      </div>

      <div
        className="w-1 cursor-col-resize hover:w-2 transition-all"
        style={{
          backgroundColor: isDragging ? colors.coral : colors.textSecondary + "30",
        }}
        onMouseDown={handleMouseDown}
      />

      <div className="flex-1 overflow-auto">{right}</div>
    </div>
  );
});

interface CollapsiblePanelProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  position?: "left" | "right";
  width?: number;
  className?: string;
}

/**
 * CollapsiblePanel - Panel that can collapse
 */
export const CollapsiblePanel = memo(function CollapsiblePanel({
  title,
  children,
  defaultOpen = true,
  position = "left",
  width = 280,
  className = "",
}: CollapsiblePanelProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <motion.div
      animate={{ width: isOpen ? width : 48 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className={"h-full flex flex-col overflow-hidden " + className}
      style={{
        backgroundColor: colors.background,
        borderRight: position === "left" ? "1px solid " + colors.textSecondary + "20" : undefined,
        borderLeft: position === "right" ? "1px solid " + colors.textSecondary + "20" : undefined,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-3 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderBottom: "1px solid " + colors.textSecondary + "20" }}
      >
        <motion.div
          animate={{ rotate: isOpen ? (position === "left" ? 0 : 180) : (position === "left" ? 180 : 0) }}
          style={{ color: colors.textSecondary }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </motion.div>

        <AnimatePresence>
          {isOpen && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="font-semibold whitespace-nowrap overflow-hidden"
              style={{ color: colors.textPrimary }}
            >
              {title}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-auto p-3"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default SidePanel;
