"use client";

/**
 * Modal Components - Sprint 636
 *
 * Modal and dialog components:
 * - Basic modal
 * - Alert dialog
 * - Confirm dialog
 * - Drawer
 * - Sheet
 * - HER-themed styling
 */

import React, { memo, useEffect, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useTheme } from "@/context/ThemeContext";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  className?: string;
}

/**
 * Modal Component
 */
export const Modal = memo(function Modal({
  isOpen,
  onClose,
  children,
  title,
  size = "md",
  closeOnOverlay = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = "",
}: ModalProps) {
  const { colors } = useTheme();

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    full: "max-w-[90vw] max-h-[90vh]",
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape") {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnOverlay ? onClose : undefined}
          />

          {/* Modal */}
          <motion.div
            className={"relative w-full mx-4 rounded-xl overflow-hidden " + sizeClasses[size] + " " + className}
            style={{
              backgroundColor: colors.warmWhite,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "modal-title" : undefined}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: "1px solid " + colors.cream }}
              >
                {title && (
                  <h2
                    id="modal-title"
                    className="text-lg font-semibold"
                    style={{ color: colors.textPrimary }}
                  >
                    {title}
                  </h2>
                )}
                {showCloseButton && (
                  <button
                    type="button"
                    className="p-1 rounded-lg transition-colors hover:bg-gray-100"
                    onClick={onClose}
                    aria-label="Close"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={colors.textMuted}
                      strokeWidth="2"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
});

interface ModalContentProps {
  children: ReactNode;
  className?: string;
}

/**
 * Modal Content
 */
export const ModalContent = memo(function ModalContent({
  children,
  className = "",
}: ModalContentProps) {
  return <div className={"px-6 py-4 " + className}>{children}</div>;
});

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

/**
 * Modal Footer
 */
export const ModalFooter = memo(function ModalFooter({
  children,
  className = "",
}: ModalFooterProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"flex items-center justify-end gap-3 px-6 py-4 " + className}
      style={{ borderTop: "1px solid " + colors.cream }}
    >
      {children}
    </div>
  );
});

interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm?: () => void;
  variant?: "info" | "success" | "warning" | "error";
}

/**
 * Alert Dialog
 */
export const AlertDialog = memo(function AlertDialog({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel = "OK",
  onConfirm,
  variant = "info",
}: AlertDialogProps) {
  const { colors } = useTheme();

  const variantColors = {
    info: colors.coral,
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
  };

  const icons = {
    info: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
    success: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    warning: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    error: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  };

  const handleConfirm = () => {
    onConfirm?.();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" showCloseButton={false}>
      <ModalContent className="text-center">
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
          style={{ backgroundColor: variantColors[variant] + "20", color: variantColors[variant] }}
        >
          {icons[variant]}
        </div>
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </h3>
        <p style={{ color: colors.textMuted }}>{message}</p>
      </ModalContent>
      <ModalFooter className="justify-center">
        <motion.button
          type="button"
          className="px-6 py-2 rounded-lg font-medium text-white"
          style={{ backgroundColor: variantColors[variant] }}
          onClick={handleConfirm}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {confirmLabel}
        </motion.button>
      </ModalFooter>
    </Modal>
  );
});

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: "default" | "danger";
}

/**
 * Confirm Dialog
 */
export const ConfirmDialog = memo(function ConfirmDialog({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
}: ConfirmDialogProps) {
  const { colors } = useTheme();

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    onCancel?.();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" showCloseButton={false}>
      <ModalContent>
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </h3>
        <p style={{ color: colors.textMuted }}>{message}</p>
      </ModalContent>
      <ModalFooter>
        <motion.button
          type="button"
          className="px-4 py-2 rounded-lg font-medium"
          style={{
            backgroundColor: colors.cream,
            color: colors.textPrimary,
          }}
          onClick={handleCancel}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {cancelLabel}
        </motion.button>
        <motion.button
          type="button"
          className="px-4 py-2 rounded-lg font-medium text-white"
          style={{
            backgroundColor: variant === "danger" ? "#ef4444" : colors.coral,
          }}
          onClick={handleConfirm}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {confirmLabel}
        </motion.button>
      </ModalFooter>
    </Modal>
  );
});

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  position?: "left" | "right" | "top" | "bottom";
  size?: "sm" | "md" | "lg" | "full";
  showCloseButton?: boolean;
  className?: string;
}

/**
 * Drawer Component
 */
export const Drawer = memo(function Drawer({
  isOpen,
  onClose,
  children,
  title,
  position = "right",
  size = "md",
  showCloseButton = true,
  className = "",
}: DrawerProps) {
  const { colors } = useTheme();

  const isHorizontal = position === "left" || position === "right";

  const sizeStyles = {
    sm: isHorizontal ? "w-64" : "h-48",
    md: isHorizontal ? "w-80" : "h-64",
    lg: isHorizontal ? "w-96" : "h-96",
    full: isHorizontal ? "w-screen" : "h-screen",
  };

  const positionStyles = {
    left: "left-0 top-0 bottom-0",
    right: "right-0 top-0 bottom-0",
    top: "top-0 left-0 right-0",
    bottom: "bottom-0 left-0 right-0",
  };

  const animations = {
    left: { x: "-100%" },
    right: { x: "100%" },
    top: { y: "-100%" },
    bottom: { y: "100%" },
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className={"fixed " + positionStyles[position] + " " + sizeStyles[size] + " " + className}
            style={{
              backgroundColor: colors.warmWhite,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
            initial={animations[position]}
            animate={{ x: 0, y: 0 }}
            exit={animations[position]}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: "1px solid " + colors.cream }}
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
                    type="button"
                    className="p-1 rounded-lg transition-colors hover:bg-gray-100"
                    onClick={onClose}
                    aria-label="Close"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={colors.textMuted}
                      strokeWidth="2"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="overflow-auto" style={{ height: "calc(100% - 60px)" }}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
});

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
  className?: string;
}

/**
 * Bottom Sheet Component
 */
export const Sheet = memo(function Sheet({
  isOpen,
  onClose,
  children,
  title,
  description,
  className = "",
}: SheetProps) {
  const { colors } = useTheme();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className={"relative w-full max-w-lg rounded-t-2xl overflow-hidden " + className}
            style={{
              backgroundColor: colors.warmWhite,
              maxHeight: "90vh",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: colors.cream }}
              />
            </div>

            {/* Header */}
            {(title || description) && (
              <div className="px-6 pb-4">
                {title && (
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: colors.textPrimary }}
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    className="text-sm mt-1"
                    style={{ color: colors.textMuted }}
                  >
                    {description}
                  </p>
                )}
              </div>
            )}

            {/* Content */}
            <div className="overflow-auto max-h-[70vh]">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
});

/**
 * useModal Hook
 */
export function useModal(initialState = false) {
  const [isOpen, setIsOpen] = React.useState(initialState);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return { isOpen, open, close, toggle };
}

export default Modal;
