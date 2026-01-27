"use client";

/**
 * Bottom Sheet Components - Sprint 780
 *
 * Mobile-friendly bottom sheet dialogs:
 * - Swipe to dismiss
 * - Multiple snap points
 * - Nested scrolling
 * - Backdrop support
 * - Action sheets
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
  createContext,
  useContext,
} from "react";
import { motion, AnimatePresence, PanInfo, useAnimation } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  snapPoints?: number[];
  initialSnap?: number;
  showHandle?: boolean;
  showBackdrop?: boolean;
  closeOnBackdropClick?: boolean;
  preventScroll?: boolean;
  className?: string;
}

/**
 * Bottom Sheet with Snap Points
 */
export const BottomSheet = memo(function BottomSheet({
  isOpen,
  onClose,
  children,
  snapPoints = [0.5, 1],
  initialSnap = 0,
  showHandle = true,
  showBackdrop = true,
  closeOnBackdropClick = true,
  preventScroll = true,
  className = "",
}: BottomSheetProps) {
  const { colors } = useTheme();
  const controls = useAnimation();
  const [currentSnap, setCurrentSnap] = useState(initialSnap);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Prevent body scroll when open
  useEffect(() => {
    if (preventScroll && isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen, preventScroll]);

  const getSnapHeight = useCallback(
    (snapIndex: number) => {
      if (typeof window === "undefined") return 0;
      return window.innerHeight * snapPoints[snapIndex];
    },
    [snapPoints]
  );

  useEffect(() => {
    if (isOpen) {
      setCurrentSnap(initialSnap);
      controls.start({
        y: window.innerHeight - getSnapHeight(initialSnap),
        transition: { type: "spring", damping: 30, stiffness: 300 },
      });
    }
  }, [isOpen, initialSnap, controls, getSnapHeight]);

  const handleDragEnd = useCallback(
    (_: any, info: PanInfo) => {
      const velocity = info.velocity.y;
      const currentY = info.point.y;
      const windowHeight = window.innerHeight;

      // Fast swipe down -> close
      if (velocity > 500) {
        onClose();
        return;
      }

      // Fast swipe up -> max snap
      if (velocity < -500) {
        const maxSnap = snapPoints.length - 1;
        setCurrentSnap(maxSnap);
        controls.start({
          y: windowHeight - getSnapHeight(maxSnap),
          transition: { type: "spring", damping: 30, stiffness: 300 },
        });
        return;
      }

      // Find closest snap point
      let closestSnap = 0;
      let closestDistance = Infinity;

      snapPoints.forEach((snap, index) => {
        const snapY = windowHeight - windowHeight * snap;
        const distance = Math.abs(currentY - snapY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestSnap = index;
        }
      });

      // If dragged below minimum snap, close
      const minSnapY = windowHeight - getSnapHeight(0);
      if (currentY > minSnapY + 100) {
        onClose();
        return;
      }

      setCurrentSnap(closestSnap);
      controls.start({
        y: windowHeight - getSnapHeight(closestSnap),
        transition: { type: "spring", damping: 30, stiffness: 300 },
      });
    },
    [snapPoints, controls, getSnapHeight, onClose]
  );

  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdropClick) {
      onClose();
    }
  }, [closeOnBackdropClick, onClose]);

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
              className="fixed inset-0 z-40"
              style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
              onClick={handleBackdropClick}
            />
          )}

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: "100%" }}
            animate={controls}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className={
              "fixed left-0 right-0 bottom-0 z-50 rounded-t-3xl shadow-2xl " +
              className
            }
            style={{
              backgroundColor: colors.warmWhite,
              maxHeight: "95vh",
              touchAction: "none",
            }}
          >
            {/* Handle */}
            {showHandle && (
              <div className="flex justify-center pt-3 pb-2">
                <div
                  className="w-12 h-1.5 rounded-full"
                  style={{ backgroundColor: colors.textMuted + "40" }}
                />
              </div>
            )}

            {/* Content */}
            <div
              ref={contentRef}
              className="overflow-auto"
              style={{
                maxHeight: "calc(95vh - 40px)",
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
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  onSelect: (option: ActionSheetOption) => void;
  showCancel?: boolean;
  cancelLabel?: string;
}

/**
 * iOS-style Action Sheet
 */
export const ActionSheet = memo(function ActionSheet({
  isOpen,
  onClose,
  title,
  message,
  options,
  onSelect,
  showCancel = true,
  cancelLabel = "Cancel",
}: ActionSheetProps) {
  const { colors } = useTheme();

  const handleSelect = useCallback(
    (option: ActionSheetOption) => {
      if (!option.disabled) {
        onSelect(option);
        onClose();
      }
    },
    [onSelect, onClose]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
            onClick={onClose}
          />

          {/* Action Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed left-2 right-2 bottom-2 z-50 space-y-2"
          >
            {/* Main container */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.warmWhite }}
            >
              {/* Header */}
              {(title || message) && (
                <div
                  className="px-4 py-3 text-center border-b"
                  style={{ borderColor: colors.cream }}
                >
                  {title && (
                    <div
                      className="font-semibold"
                      style={{ color: colors.textPrimary }}
                    >
                      {title}
                    </div>
                  )}
                  {message && (
                    <div
                      className="text-sm mt-1"
                      style={{ color: colors.textMuted }}
                    >
                      {message}
                    </div>
                  )}
                </div>
              )}

              {/* Options */}
              {options.map((option, index) => (
                <motion.button
                  key={option.id}
                  onClick={() => handleSelect(option)}
                  className={
                    "w-full px-4 py-3.5 flex items-center justify-center gap-2 " +
                    (index < options.length - 1 ? "border-b" : "")
                  }
                  style={{
                    borderColor: colors.cream,
                    color: option.destructive
                      ? "#ef4444"
                      : option.disabled
                      ? colors.textMuted
                      : colors.coral,
                    cursor: option.disabled ? "not-allowed" : "pointer",
                    opacity: option.disabled ? 0.5 : 1,
                  }}
                  whileTap={!option.disabled ? { backgroundColor: colors.cream } : undefined}
                >
                  {option.icon && <span>{option.icon}</span>}
                  <span className="font-medium">{option.label}</span>
                </motion.button>
              ))}
            </div>

            {/* Cancel button */}
            {showCancel && (
              <motion.button
                onClick={onClose}
                className="w-full px-4 py-3.5 rounded-2xl font-semibold"
                style={{
                  backgroundColor: colors.warmWhite,
                  color: colors.coral,
                }}
                whileTap={{ backgroundColor: colors.cream }}
              >
                {cancelLabel}
              </motion.button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

interface ShareSheetItem {
  id: string;
  label: string;
  icon: ReactNode;
  color?: string;
}

interface ShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  items: ShareSheetItem[];
  onSelect: (item: ShareSheetItem) => void;
}

/**
 * Share Sheet Grid
 */
export const ShareSheet = memo(function ShareSheet({
  isOpen,
  onClose,
  title = "Share",
  items,
  onSelect,
}: ShareSheetProps) {
  const { colors } = useTheme();

  const handleSelect = useCallback(
    (item: ShareSheetItem) => {
      onSelect(item);
      onClose();
    },
    [onSelect, onClose]
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[0.4]}
      showHandle={true}
    >
      <div className="p-4">
        {/* Title */}
        <h3
          className="text-lg font-semibold text-center mb-4"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </h3>

        {/* Grid of share options */}
        <div className="grid grid-cols-4 gap-4">
          {items.map((item) => (
            <motion.button
              key={item.id}
              onClick={() => handleSelect(item)}
              className="flex flex-col items-center gap-2"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor: item.color || colors.coral,
                }}
              >
                {item.icon}
              </div>
              <span
                className="text-xs"
                style={{ color: colors.textMuted }}
              >
                {item.label}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
});

interface BottomSheetMenuProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Bottom Sheet Menu Container
 */
export const BottomSheetMenu = memo(function BottomSheetMenu({
  isOpen,
  onClose,
  title,
  children,
}: BottomSheetMenuProps) {
  const { colors } = useTheme();

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[0.5, 0.9]}
      showHandle={true}
    >
      <div className="pb-safe">
        {title && (
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: colors.cream }}
          >
            <h3
              className="text-lg font-semibold"
              style={{ color: colors.textPrimary }}
            >
              {title}
            </h3>
          </div>
        )}
        <div className="p-2">{children}</div>
      </div>
    </BottomSheet>
  );
});

interface BottomSheetMenuItemProps {
  icon?: ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  rightElement?: ReactNode;
}

/**
 * Bottom Sheet Menu Item
 */
export const BottomSheetMenuItem = memo(function BottomSheetMenuItem({
  icon,
  label,
  description,
  onClick,
  destructive = false,
  disabled = false,
  rightElement,
}: BottomSheetMenuItemProps) {
  const { colors } = useTheme();

  return (
    <motion.button
      onClick={disabled ? undefined : onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left"
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
      whileHover={!disabled ? { backgroundColor: colors.cream } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
    >
      {icon && (
        <span
          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            backgroundColor: destructive ? "#fef2f2" : colors.cream,
            color: destructive ? "#ef4444" : colors.textMuted,
          }}
        >
          {icon}
        </span>
      )}

      <div className="flex-1 min-w-0">
        <div
          className="font-medium"
          style={{
            color: destructive ? "#ef4444" : colors.textPrimary,
          }}
        >
          {label}
        </div>
        {description && (
          <div
            className="text-sm truncate"
            style={{ color: colors.textMuted }}
          >
            {description}
          </div>
        )}
      </div>

      {rightElement && (
        <div className="flex-shrink-0">{rightElement}</div>
      )}
    </motion.button>
  );
});

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  position?: "left" | "right";
  width?: number | string;
  showBackdrop?: boolean;
  className?: string;
}

/**
 * Side Drawer
 */
export const Drawer = memo(function Drawer({
  isOpen,
  onClose,
  children,
  position = "right",
  width = 320,
  showBackdrop = true,
  className = "",
}: DrawerProps) {
  const { colors } = useTheme();

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  const slideFrom = position === "left" ? "-100%" : "100%";

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
              className="fixed inset-0 z-40"
              style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
              onClick={onClose}
            />
          )}

          {/* Drawer */}
          <motion.div
            initial={{ x: slideFrom }}
            animate={{ x: 0 }}
            exit={{ x: slideFrom }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={
              "fixed top-0 bottom-0 z-50 shadow-2xl overflow-auto " +
              (position === "left" ? "left-0" : "right-0") +
              " " +
              className
            }
            style={{
              width,
              backgroundColor: colors.warmWhite,
            }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

// Context for nested bottom sheets
interface BottomSheetContextType {
  openSheet: (id: string) => void;
  closeSheet: (id: string) => void;
  isSheetOpen: (id: string) => boolean;
}

const BottomSheetContext = createContext<BottomSheetContextType | null>(null);

export const useBottomSheet = () => {
  const context = useContext(BottomSheetContext);
  if (!context) throw new Error("useBottomSheet must be used within BottomSheetProvider");
  return context;
};

interface BottomSheetProviderProps {
  children: ReactNode;
}

/**
 * Bottom Sheet Provider for managing multiple sheets
 */
export const BottomSheetProvider = memo(function BottomSheetProvider({
  children,
}: BottomSheetProviderProps) {
  const [openSheets, setOpenSheets] = useState<Set<string>>(new Set());

  const openSheet = useCallback((id: string) => {
    setOpenSheets((prev) => new Set(prev).add(id));
  }, []);

  const closeSheet = useCallback((id: string) => {
    setOpenSheets((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isSheetOpen = useCallback(
    (id: string) => openSheets.has(id),
    [openSheets]
  );

  return (
    <BottomSheetContext.Provider value={{ openSheet, closeSheet, isSheetOpen }}>
      {children}
    </BottomSheetContext.Provider>
  );
});

export default BottomSheet;
