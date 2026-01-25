"use client";

/**
 * Sheet Components - Sprint 702
 *
 * Bottom/side sheet overlays:
 * - Multiple positions
 * - Snap points
 * - Swipe gestures
 * - Focus trap
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type SheetPosition = "bottom" | "top" | "left" | "right";

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  position?: SheetPosition;
  snapPoints?: number[];
  defaultSnapPoint?: number;
  onSnapChange?: (snapPoint: number) => void;
  showHandle?: boolean;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Sheet Component
 */
export const Sheet = memo(function Sheet({
  isOpen,
  onClose,
  position = "bottom",
  snapPoints = [0.4, 0.9],
  defaultSnapPoint = 0,
  onSnapChange,
  showHandle = true,
  closeOnOverlay = true,
  closeOnEscape = true,
  title,
  children,
  footer,
  className = "",
}: SheetProps) {
  const { colors } = useTheme();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [currentSnap, setCurrentSnap] = useState(defaultSnapPoint);
  const [containerSize, setContainerSize] = useState(0);

  const isVertical = position === "bottom" || position === "top";

  // Get container size on mount
  useEffect(() => {
    if (isOpen) {
      setContainerSize(
        isVertical ? window.innerHeight : window.innerWidth
      );
    }
  }, [isOpen, isVertical]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  const currentSize = snapPoints[currentSnap] * containerSize;

  const handleDragEnd = useCallback(
    (_: any, info: PanInfo) => {
      const velocity = isVertical ? info.velocity.y : info.velocity.x;
      const offset = isVertical ? info.offset.y : info.offset.x;

      // Calculate drag direction
      const shouldClose =
        (position === "bottom" && (offset > 100 || velocity > 500)) ||
        (position === "top" && (offset < -100 || velocity < -500)) ||
        (position === "left" && (offset < -100 || velocity < -500)) ||
        (position === "right" && (offset > 100 || velocity > 500));

      if (shouldClose) {
        onClose();
        return;
      }

      // Find nearest snap point
      const currentPos = currentSize + (position === "bottom" || position === "right" ? offset : -offset);
      const currentRatio = currentPos / containerSize;

      let nearestSnap = 0;
      let minDiff = Math.abs(snapPoints[0] - currentRatio);

      snapPoints.forEach((point, index) => {
        const diff = Math.abs(point - currentRatio);
        if (diff < minDiff) {
          minDiff = diff;
          nearestSnap = index;
        }
      });

      setCurrentSnap(nearestSnap);
      onSnapChange?.(nearestSnap);
    },
    [position, currentSize, containerSize, snapPoints, onSnapChange, onClose, isVertical]
  );

  const getSheetStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "fixed",
      zIndex: 50,
      backgroundColor: colors.warmWhite,
      boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
    };

    switch (position) {
      case "bottom":
        return {
          ...base,
          bottom: 0,
          left: 0,
          right: 0,
          height: currentSize,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        };
      case "top":
        return {
          ...base,
          top: 0,
          left: 0,
          right: 0,
          height: currentSize,
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
        };
      case "left":
        return {
          ...base,
          top: 0,
          left: 0,
          bottom: 0,
          width: currentSize,
          borderTopRightRadius: 16,
          borderBottomRightRadius: 16,
        };
      case "right":
        return {
          ...base,
          top: 0,
          right: 0,
          bottom: 0,
          width: currentSize,
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
        };
    }
  };

  const getMotionProps = () => {
    switch (position) {
      case "bottom":
        return {
          initial: { y: "100%" },
          animate: { y: 0 },
          exit: { y: "100%" },
        };
      case "top":
        return {
          initial: { y: "-100%" },
          animate: { y: 0 },
          exit: { y: "-100%" },
        };
      case "left":
        return {
          initial: { x: "-100%" },
          animate: { x: 0 },
          exit: { x: "-100%" },
        };
      case "right":
        return {
          initial: { x: "100%" },
          animate: { x: 0 },
          exit: { x: "100%" },
        };
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
            onClick={closeOnOverlay ? onClose : undefined}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            className={"flex flex-col " + className}
            style={getSheetStyles()}
            {...getMotionProps()}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag={isVertical ? "y" : "x"}
            dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={handleDragEnd}
          >
            {/* Handle */}
            {showHandle && (
              <div
                className="flex justify-center py-2 cursor-grab active:cursor-grabbing"
              >
                <div
                  className="rounded-full"
                  style={{
                    width: isVertical ? 40 : 4,
                    height: isVertical ? 4 : 40,
                    backgroundColor: colors.textMuted,
                    opacity: 0.5,
                  }}
                />
              </div>
            )}

            {/* Header */}
            {title && (
              <div
                className="flex items-center justify-between px-4 py-2 border-b"
                style={{ borderColor: colors.cream }}
              >
                <h2
                  className="font-semibold text-lg"
                  style={{ color: colors.textPrimary }}
                >
                  {title}
                </h2>
                <motion.button
                  onClick={onClose}
                  className="p-1 rounded-lg"
                  style={{ color: colors.textMuted }}
                  whileHover={{ backgroundColor: colors.cream }}
                  whileTap={{ scale: 0.95 }}
                >
                  <CloseIcon />
                </motion.button>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">{children}</div>

            {/* Footer */}
            {footer && (
              <div
                className="px-4 py-3 border-t"
                style={{ borderColor: colors.cream }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

interface ActionSheetOption {
  id: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (optionId: string) => void;
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  cancelLabel?: string;
}

/**
 * Action Sheet (iOS-style)
 */
export const ActionSheet = memo(function ActionSheet({
  isOpen,
  onClose,
  onSelect,
  title,
  message,
  options,
  cancelLabel = "Cancel",
}: ActionSheetProps) {
  const { colors } = useTheme();

  const handleSelect = (optionId: string) => {
    onSelect(optionId);
    onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      position="bottom"
      snapPoints={[0.5]}
      showHandle={false}
    >
      <div className="flex flex-col gap-2">
        {/* Header */}
        {(title || message) && (
          <div className="text-center pb-3 border-b" style={{ borderColor: colors.cream }}>
            {title && (
              <p className="font-medium" style={{ color: colors.textPrimary }}>
                {title}
              </p>
            )}
            {message && (
              <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
                {message}
              </p>
            )}
          </div>
        )}

        {/* Options */}
        <div className="flex flex-col gap-1">
          {options.map((option) => (
            <motion.button
              key={option.id}
              onClick={() => !option.disabled && handleSelect(option.id)}
              disabled={option.disabled}
              className="flex items-center gap-3 w-full p-3 rounded-lg"
              style={{
                backgroundColor: "transparent",
                color: option.destructive
                  ? "#EF4444"
                  : option.disabled
                  ? colors.textMuted
                  : colors.textPrimary,
                opacity: option.disabled ? 0.5 : 1,
              }}
              whileHover={{ backgroundColor: colors.cream }}
              whileTap={{ scale: 0.98 }}
            >
              {option.icon && <span>{option.icon}</span>}
              <span className="font-medium">{option.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Cancel */}
        <motion.button
          onClick={onClose}
          className="w-full p-3 mt-2 rounded-lg font-medium"
          style={{
            backgroundColor: colors.cream,
            color: colors.textPrimary,
          }}
          whileHover={{ opacity: 0.9 }}
          whileTap={{ scale: 0.98 }}
        >
          {cancelLabel}
        </motion.button>
      </div>
    </Sheet>
  );
});

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  height?: "auto" | "half" | "full";
}

/**
 * Simple Bottom Sheet
 */
export const BottomSheet = memo(function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  footer,
  height = "half",
}: BottomSheetProps) {
  const snapPoints: Record<string, number[]> = {
    auto: [0.3],
    half: [0.5],
    full: [0.9],
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      position="bottom"
      snapPoints={snapPoints[height]}
      title={title}
      footer={footer}
    >
      {children}
    </Sheet>
  );
});

// Custom hook for sheet state
export function useSheet(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [data, setData] = useState<any>(null);

  const open = useCallback((openData?: any) => {
    setData(openData);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setData(null);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    data,
    open,
    close,
    toggle,
  };
}

// Icons
function CloseIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export default Sheet;
