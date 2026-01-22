"use client";

/**
 * MobileBottomSheet - Draggable bottom sheet component
 *
 * A mobile-native bottom sheet with:
 * - Drag to dismiss
 * - Multiple snap points
 * - Keyboard avoidance
 * - Focus trapping
 * - Backdrop blur
 *
 * Sprint 226: Mobile UX improvements
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
  type ReactNode,
} from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { useMobileDetect } from "@/hooks/useMobileDetect";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface SnapPoint {
  height: number | string; // px or percentage
  id: string;
}

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  snapPoints?: SnapPoint[];
  initialSnap?: string;
  showHandle?: boolean;
  showBackdrop?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  preventScroll?: boolean;
  className?: string;
  headerAction?: ReactNode;
}

const DEFAULT_SNAP_POINTS: SnapPoint[] = [
  { height: "50%", id: "half" },
  { height: "90%", id: "full" },
];

export const MobileBottomSheet = memo(function MobileBottomSheet({
  isOpen,
  onClose,
  children,
  title,
  subtitle,
  snapPoints = DEFAULT_SNAP_POINTS,
  initialSnap = "half",
  showHandle = true,
  showBackdrop = true,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  preventScroll = true,
  className = "",
  headerAction,
}: MobileBottomSheetProps) {
  const { trigger: haptic } = useHapticFeedback();
  const keyboard = useKeyboard();
  const { isMobile } = useMobileDetect();
  const reducedMotion = useReducedMotion();

  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [currentSnapIndex, setCurrentSnapIndex] = useState(
    snapPoints.findIndex((sp) => sp.id === initialSnap) || 0
  );
  const [isDragging, setIsDragging] = useState(false);

  // Motion values for drag
  const y = useMotionValue(0);
  const backdropOpacity = useTransform(
    y,
    [0, window.innerHeight * 0.5],
    [0.5, 0]
  );

  // Focus trap
  const { containerRef } = useFocusTrap({
    enabled: isOpen,
    onEscape: closeOnEscape ? onClose : undefined,
  });

  // Get snap point height in pixels
  const getSnapHeight = useCallback(
    (snapPoint: SnapPoint): number => {
      if (typeof snapPoint.height === "number") {
        return snapPoint.height;
      }
      const percentage = parseFloat(snapPoint.height) / 100;
      return window.innerHeight * percentage;
    },
    []
  );

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen && preventScroll) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen, preventScroll]);

  // Reset position when closed
  useEffect(() => {
    if (!isOpen) {
      y.set(0);
      setCurrentSnapIndex(
        snapPoints.findIndex((sp) => sp.id === initialSnap) || 0
      );
    }
  }, [isOpen, initialSnap, snapPoints, y]);

  // Handle drag end
  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      setIsDragging(false);
      const velocity = info.velocity.y;
      const offset = info.offset.y;

      // Dismiss if dragged down fast enough or far enough
      if (velocity > 500 || offset > 150) {
        haptic("light");
        onClose();
        return;
      }

      // Snap to nearest point
      const currentY = y.get();
      let nearestIndex = currentSnapIndex;
      let minDistance = Infinity;

      snapPoints.forEach((sp, index) => {
        const snapHeight = getSnapHeight(sp);
        const sheetTop = window.innerHeight - snapHeight;
        const distance = Math.abs(currentY - (currentSnapIndex === index ? 0 : sheetTop));

        if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = index;
        }
      });

      // If dragged up significantly, try to snap to next larger point
      if (offset < -50 && currentSnapIndex < snapPoints.length - 1) {
        nearestIndex = currentSnapIndex + 1;
      }

      // If dragged down significantly, try to snap to next smaller point
      if (offset > 50 && currentSnapIndex > 0) {
        nearestIndex = currentSnapIndex - 1;
      }

      haptic("selection");
      setCurrentSnapIndex(nearestIndex);
      y.set(0);
    },
    [currentSnapIndex, snapPoints, getSnapHeight, haptic, onClose, y]
  );

  // Handle backdrop click
  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdropClick) {
      haptic("light");
      onClose();
    }
  }, [closeOnBackdropClick, haptic, onClose]);

  // Current sheet height
  const currentSnapHeight = getSnapHeight(snapPoints[currentSnapIndex]);

  // Adjust for keyboard
  const keyboardOffset = keyboard.isOpen ? keyboard.height : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          {showBackdrop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              className="fixed inset-0 z-40 bg-black/50"
              style={{
                opacity: backdropOpacity,
                backdropFilter: "blur(4px)",
              }}
              onClick={handleBackdropClick}
              aria-hidden="true"
            />
          )}

          {/* Sheet */}
          <motion.div
            ref={containerRef as React.RefObject<HTMLDivElement>}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{
              type: reducedMotion ? "tween" : "spring",
              damping: 30,
              stiffness: 300,
              duration: reducedMotion ? 0.15 : undefined,
            }}
            style={{
              y,
              height: currentSnapHeight,
              bottom: keyboardOffset,
            }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
            className={`
              fixed
              left-0
              right-0
              z-50
              bg-white
              rounded-t-3xl
              shadow-2xl
              flex
              flex-col
              overflow-hidden
              ${className}
            `}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "sheet-title" : undefined}
          >
            {/* Drag handle */}
            {showHandle && (
              <div
                className="flex-shrink-0 py-3 flex justify-center cursor-grab active:cursor-grabbing"
                style={{ touchAction: "none" }}
              >
                <div
                  className="w-12 h-1.5 rounded-full bg-gray-300"
                  style={{
                    transform: isDragging ? "scaleX(1.2)" : "scaleX(1)",
                    transition: "transform 0.15s ease",
                  }}
                />
              </div>
            )}

            {/* Header */}
            {(title || headerAction) && (
              <div className="flex-shrink-0 px-4 pb-3 flex items-center justify-between border-b border-gray-100">
                <div>
                  {title && (
                    <h2
                      id="sheet-title"
                      className="text-lg font-semibold text-gray-900"
                    >
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
                  )}
                </div>
                {headerAction && (
                  <div className="flex-shrink-0 ml-4">{headerAction}</div>
                )}
              </div>
            )}

            {/* Content */}
            <div
              ref={contentRef}
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{
                WebkitOverflowScrolling: "touch",
                paddingBottom: isMobile
                  ? "calc(16px + env(safe-area-inset-bottom))"
                  : "16px",
              }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

/**
 * Action sheet variant - list of actions
 */
export const MobileActionSheet = memo(function MobileActionSheet({
  isOpen,
  onClose,
  title,
  actions,
  cancelLabel = "Annuler",
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions: Array<{
    label: string;
    icon?: ReactNode;
    destructive?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }>;
  cancelLabel?: string;
}) {
  const { trigger: haptic } = useHapticFeedback();

  const handleAction = useCallback(
    (action: (typeof actions)[number]) => {
      if (action.disabled) return;
      haptic(action.destructive ? "warning" : "light");
      action.onClick();
      onClose();
    },
    [haptic, onClose]
  );

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      snapPoints={[{ height: "auto", id: "auto" }]}
      initialSnap="auto"
    >
      <div className="px-2 py-2">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={() => handleAction(action)}
            disabled={action.disabled}
            className={`
              w-full
              flex
              items-center
              gap-3
              px-4
              py-3.5
              rounded-xl
              transition-colors
              ${action.disabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-gray-100 active:bg-gray-200"
              }
              ${action.destructive ? "text-red-600" : "text-gray-900"}
            `}
            style={{ touchAction: "manipulation" }}
          >
            {action.icon && (
              <span className="flex-shrink-0 w-6 h-6">{action.icon}</span>
            )}
            <span className="text-base font-medium">{action.label}</span>
          </button>
        ))}

        {/* Cancel button */}
        <div className="mt-2 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="
              w-full
              px-4
              py-3.5
              rounded-xl
              text-base
              font-semibold
              text-blue-600
              hover:bg-gray-100
              active:bg-gray-200
              transition-colors
            "
            style={{ touchAction: "manipulation" }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </MobileBottomSheet>
  );
});

/**
 * Confirmation sheet variant
 */
export const MobileConfirmSheet = memo(function MobileConfirmSheet({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  destructive = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}) {
  const { trigger: haptic } = useHapticFeedback();

  const handleConfirm = useCallback(() => {
    haptic(destructive ? "warning" : "medium");
    onConfirm();
    onClose();
  }, [haptic, destructive, onConfirm, onClose]);

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[{ height: "auto", id: "auto" }]}
      initialSnap="auto"
    >
      <div className="px-6 py-4 text-center">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {message && (
          <p className="mt-2 text-base text-gray-600">{message}</p>
        )}

        <div className="mt-6 space-y-3">
          <button
            onClick={handleConfirm}
            className={`
              w-full
              py-3.5
              rounded-xl
              text-base
              font-semibold
              text-white
              transition-colors
              ${destructive
                ? "bg-red-600 hover:bg-red-700 active:bg-red-800"
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
              }
            `}
            style={{ touchAction: "manipulation" }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onClose}
            className="
              w-full
              py-3.5
              rounded-xl
              text-base
              font-semibold
              text-gray-700
              bg-gray-100
              hover:bg-gray-200
              active:bg-gray-300
              transition-colors
            "
            style={{ touchAction: "manipulation" }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </MobileBottomSheet>
  );
});
