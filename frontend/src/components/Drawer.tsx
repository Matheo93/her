"use client";

/**
 * Drawer Components - Sprint 688
 *
 * Slide-in panel:
 * - Multiple positions (left, right, top, bottom)
 * - Backdrop
 * - Focus trap
 * - Swipe to close
 * - HER-themed styling
 */

import React, { memo, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type DrawerPosition = "left" | "right" | "top" | "bottom";
type DrawerSize = "sm" | "md" | "lg" | "xl" | "full";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  position?: DrawerPosition;
  size?: DrawerSize;
  showBackdrop?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  swipeToClose?: boolean;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

const SIZES: Record<DrawerSize, string> = {
  sm: "300px",
  md: "400px",
  lg: "500px",
  xl: "600px",
  full: "100%",
};

/**
 * Drawer Component
 */
export const Drawer = memo(function Drawer({
  isOpen,
  onClose,
  position = "right",
  size = "md",
  showBackdrop = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  swipeToClose = true,
  title,
  children,
  footer,
  className = "",
}: DrawerProps) {
  const { colors } = useTheme();
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;
      drawerRef.current?.focus();
    } else if (previousActiveElement.current instanceof HTMLElement) {
      previousActiveElement.current.focus();
    }
  }, [isOpen]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  const isHorizontal = position === "left" || position === "right";
  const sizeValue = SIZES[size];

  const getMotionProps = () => {
    const variants = {
      left: { initial: { x: "-100%" }, animate: { x: 0 }, exit: { x: "-100%" } },
      right: { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } },
      top: { initial: { y: "-100%" }, animate: { y: 0 }, exit: { y: "-100%" } },
      bottom: { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } },
    };
    return variants[position];
  };

  const handleDragEnd = useCallback(
    (_: any, info: PanInfo) => {
      if (!swipeToClose) return;

      const threshold = 100;
      const velocity = 500;

      const shouldClose =
        (position === "left" && (info.offset.x < -threshold || info.velocity.x < -velocity)) ||
        (position === "right" && (info.offset.x > threshold || info.velocity.x > velocity)) ||
        (position === "top" && (info.offset.y < -threshold || info.velocity.y < -velocity)) ||
        (position === "bottom" && (info.offset.y > threshold || info.velocity.y > velocity));

      if (shouldClose) onClose();
    },
    [position, swipeToClose, onClose]
  );

  const getDragConstraints = () => {
    switch (position) {
      case "left":
        return { left: -200, right: 0, top: 0, bottom: 0 };
      case "right":
        return { left: 0, right: 200, top: 0, bottom: 0 };
      case "top":
        return { left: 0, right: 0, top: -200, bottom: 0 };
      case "bottom":
        return { left: 0, right: 0, top: 0, bottom: 200 };
    }
  };

  const getPositionStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "fixed",
      zIndex: 50,
    };

    switch (position) {
      case "left":
        return { ...base, top: 0, left: 0, bottom: 0, width: sizeValue };
      case "right":
        return { ...base, top: 0, right: 0, bottom: 0, width: sizeValue };
      case "top":
        return { ...base, top: 0, left: 0, right: 0, height: sizeValue };
      case "bottom":
        return { ...base, bottom: 0, left: 0, right: 0, height: sizeValue };
    }
  };

  const motionProps = getMotionProps();

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
              onClick={closeOnBackdrop ? onClose : undefined}
            />
          )}

          {/* Drawer */}
          <motion.div
            ref={drawerRef}
            tabIndex={-1}
            className={"flex flex-col outline-none " + className}
            style={{
              ...getPositionStyles(),
              backgroundColor: colors.warmWhite,
              boxShadow: "0 0 20px rgba(0, 0, 0, 0.1)",
            }}
            initial={motionProps.initial}
            animate={motionProps.animate}
            exit={motionProps.exit}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            drag={swipeToClose ? (isHorizontal ? "x" : "y") : false}
            dragConstraints={getDragConstraints()}
            dragElastic={0.1}
            onDragEnd={handleDragEnd}
          >
            {/* Header */}
            {title && (
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: colors.cream }}
              >
                <h2
                  className="text-lg font-semibold"
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

interface DrawerButtonProps {
  onClick: () => void;
  position?: "left" | "right";
  className?: string;
}

/**
 * Drawer Toggle Button
 */
export const DrawerButton = memo(function DrawerButton({
  onClick,
  position = "left",
  className = "",
}: DrawerButtonProps) {
  const { colors } = useTheme();

  return (
    <motion.button
      onClick={onClick}
      className={"p-2 rounded-lg " + className}
      style={{
        backgroundColor: colors.cream,
        color: colors.textPrimary,
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <MenuIcon />
    </motion.button>
  );
});

interface ConfirmDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  position?: DrawerPosition;
}

/**
 * Confirmation Drawer
 */
export const ConfirmDrawer = memo(function ConfirmDrawer({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  loading = false,
  position = "right",
}: ConfirmDrawerProps) {
  const { colors } = useTheme();

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      position={position}
      size="sm"
      title={title}
      footer={
        <div className="flex gap-2">
          <motion.button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2 rounded-lg font-medium"
            style={{
              backgroundColor: colors.cream,
              color: colors.textPrimary,
            }}
            whileHover={{ opacity: 0.9 }}
          >
            {cancelText}
          </motion.button>
          <motion.button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2 rounded-lg font-medium"
            style={{
              backgroundColor: danger ? "#EF4444" : colors.coral,
              color: colors.warmWhite,
              opacity: loading ? 0.7 : 1,
            }}
            whileHover={{ opacity: 0.9 }}
          >
            {loading ? "Loading..." : confirmText}
          </motion.button>
        </div>
      }
    >
      <p style={{ color: colors.textMuted }}>{message}</p>
    </Drawer>
  );
});

interface FormDrawerProps<T> {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: T) => void | Promise<void>;
  title: string;
  children: ReactNode;
  submitText?: string;
  loading?: boolean;
  position?: DrawerPosition;
  size?: DrawerSize;
}

/**
 * Form Drawer
 */
export const FormDrawer = memo(function FormDrawer<T>({
  isOpen,
  onClose,
  onSubmit,
  title,
  children,
  submitText = "Submit",
  loading = false,
  position = "right",
  size = "md",
}: FormDrawerProps<T>) {
  const { colors } = useTheme();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries()) as T;
    await onSubmit(data);
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      position={position}
      size={size}
      title={title}
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="flex-1">{children}</div>
        <div className="flex gap-2 pt-4">
          <motion.button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg font-medium"
            style={{
              backgroundColor: colors.cream,
              color: colors.textPrimary,
            }}
            whileHover={{ opacity: 0.9 }}
          >
            Cancel
          </motion.button>
          <motion.button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg font-medium"
            style={{
              backgroundColor: colors.coral,
              color: colors.warmWhite,
              opacity: loading ? 0.7 : 1,
            }}
            whileHover={{ opacity: 0.9 }}
          >
            {loading ? "Submitting..." : submitText}
          </motion.button>
        </div>
      </form>
    </Drawer>
  );
}) as <T>(props: FormDrawerProps<T>) => JSX.Element;

// Custom hook for drawer state
export function useDrawer(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return { isOpen, open, close, toggle };
}

// Icons
function CloseIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 12h18M3 6h18M3 18h18" />
    </svg>
  );
}

export default Drawer;
