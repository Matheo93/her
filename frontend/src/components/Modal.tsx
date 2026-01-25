"use client";

/**
 * Modal Dialog Components - Sprint 600
 *
 * Flexible modal system:
 * - Basic modal with overlay
 * - Confirm dialog
 * - Alert dialog
 * - Drawer (side panel)
 * - HER-themed styling
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface ModalProps {
  /** Whether modal is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Modal title */
  title?: string;
  /** Modal content */
  children: ReactNode;
  /** Size variant */
  size?: "sm" | "md" | "lg" | "xl" | "full";
  /** Whether to close on overlay click */
  closeOnOverlay?: boolean;
  /** Whether to close on escape key */
  closeOnEscape?: boolean;
  /** Whether to show close button */
  showCloseButton?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Get modal width based on size
 */
function getModalWidth(size: ModalProps["size"]) {
  switch (size) {
    case "sm":
      return "max-w-sm";
    case "lg":
      return "max-w-2xl";
    case "xl":
      return "max-w-4xl";
    case "full":
      return "max-w-full mx-4";
    case "md":
    default:
      return "max-w-lg";
  }
}

/**
 * Close Icon
 */
const CloseIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * Main Modal Component
 */
export const Modal = memo(function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  closeOnOverlay = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = "",
}: ModalProps) {
  const { colors } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Lock body scroll when open
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

  // Focus trap
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstEl = focusableElements[0] as HTMLElement;
    const lastEl = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTab);
    firstEl?.focus();

    return () => document.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (closeOnOverlay && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnOverlay, onClose]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleOverlayClick}
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        >
          <motion.div
            ref={modalRef}
            className={`w-full ${getModalWidth(size)} rounded-2xl shadow-xl ${className}`}
            style={{ backgroundColor: colors.warmWhite }}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" as const }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "modal-title" : undefined}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div
                className="flex items-center justify-between px-6 py-4 border-b"
                style={{ borderColor: colors.cream }}
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
                  <motion.button
                    className="p-1 rounded-lg"
                    style={{ color: colors.textSecondary }}
                    onClick={onClose}
                    whileHover={{
                      scale: 1.1,
                      backgroundColor: colors.cream,
                    }}
                    whileTap={{ scale: 0.9 }}
                    aria-label="Fermer"
                  >
                    <CloseIcon />
                  </motion.button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="px-6 py-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

/**
 * Modal Footer - for action buttons
 */
export const ModalFooter = memo(function ModalFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();

  return (
    <div
      className={`flex items-center justify-end gap-3 px-6 py-4 border-t ${className}`}
      style={{ borderColor: colors.cream }}
    >
      {children}
    </div>
  );
});

/**
 * Confirm Dialog
 */
export const ConfirmDialog = memo(function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmer",
  message,
  confirmText = "Confirmer",
  cancelText = "Annuler",
  variant = "default",
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
}) {
  const { colors } = useTheme();
  const confirmColor = variant === "danger" ? colors.error || "#FF4444" : colors.coral;

  const handleConfirm = useCallback(() => {
    onConfirm();
    onClose();
  }, [onConfirm, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-sm" style={{ color: colors.textSecondary }}>
        {message}
      </p>
      <div className="flex items-center justify-end gap-3 mt-6">
        <motion.button
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{
            backgroundColor: colors.cream,
            color: colors.textPrimary,
          }}
          onClick={onClose}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {cancelText}
        </motion.button>
        <motion.button
          className="px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: confirmColor }}
          onClick={handleConfirm}
          whileHover={{ scale: 1.02, opacity: 0.9 }}
          whileTap={{ scale: 0.98 }}
        >
          {confirmText}
        </motion.button>
      </div>
    </Modal>
  );
});

/**
 * Alert Dialog
 */
export const AlertDialog = memo(function AlertDialog({
  isOpen,
  onClose,
  title = "Information",
  message,
  buttonText = "OK",
  variant = "info",
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  buttonText?: string;
  variant?: "info" | "success" | "warning" | "error";
}) {
  const { colors } = useTheme();

  const variantColors = {
    info: colors.coral,
    success: colors.success || "#4CAF50",
    warning: colors.warning || "#FF9800",
    error: colors.error || "#FF4444",
  };

  const Icon = () => {
    switch (variant) {
      case "success":
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        );
      case "warning":
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case "error":
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
      default:
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" showCloseButton={false}>
      <div className="flex flex-col items-center text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
          style={{
            backgroundColor: `${variantColors[variant]}20`,
            color: variantColors[variant],
          }}
        >
          <Icon />
        </div>
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </h3>
        <p className="text-sm" style={{ color: colors.textSecondary }}>
          {message}
        </p>
        <motion.button
          className="mt-6 px-6 py-2 rounded-xl text-sm font-medium text-white"
          style={{ backgroundColor: variantColors[variant] }}
          onClick={onClose}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {buttonText}
        </motion.button>
      </div>
    </Modal>
  );
});

/**
 * Drawer - Side panel modal
 */
export const Drawer = memo(function Drawer({
  isOpen,
  onClose,
  title,
  children,
  position = "right",
  size = "md",
  className = "",
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  position?: "left" | "right";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { colors } = useTheme();

  const sizeClasses = {
    sm: "w-80",
    md: "w-96",
    lg: "w-[480px]",
  };

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
  };

  // Handle escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Lock scroll
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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className={`fixed top-0 bottom-0 ${position}-0 z-50 ${sizeClasses[size]} shadow-2xl ${className}`}
            style={{ backgroundColor: colors.warmWhite }}
            initial={variants[position].initial}
            animate={variants[position].animate}
            exit={variants[position].exit}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            {title && (
              <div
                className="flex items-center justify-between px-6 py-4 border-b"
                style={{ borderColor: colors.cream }}
              >
                <h2
                  className="text-lg font-semibold"
                  style={{ color: colors.textPrimary }}
                >
                  {title}
                </h2>
                <motion.button
                  className="p-1 rounded-lg"
                  style={{ color: colors.textSecondary }}
                  onClick={onClose}
                  whileHover={{
                    scale: 1.1,
                    backgroundColor: colors.cream,
                  }}
                  whileTap={{ scale: 0.9 }}
                  aria-label="Fermer"
                >
                  <CloseIcon />
                </motion.button>
              </div>
            )}

            {/* Content */}
            <div className="p-6 overflow-y-auto h-full">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

/**
 * Modal Context for global modal management
 */
interface ModalContextValue {
  showAlert: (options: {
    title?: string;
    message: string;
    variant?: "info" | "success" | "warning" | "error";
  }) => void;
  showConfirm: (options: {
    title?: string;
    message: string;
    onConfirm: () => void;
    variant?: "default" | "danger";
  }) => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within ModalProvider");
  }
  return context;
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    variant?: "info" | "success" | "warning" | "error";
  }>({ isOpen: false, message: "" });

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    onConfirm?: () => void;
    variant?: "default" | "danger";
  }>({ isOpen: false, message: "" });

  const showAlert = useCallback(
    (options: {
      title?: string;
      message: string;
      variant?: "info" | "success" | "warning" | "error";
    }) => {
      setAlertState({ isOpen: true, ...options });
    },
    []
  );

  const showConfirm = useCallback(
    (options: {
      title?: string;
      message: string;
      onConfirm: () => void;
      variant?: "default" | "danger";
    }) => {
      setConfirmState({ isOpen: true, ...options });
    },
    []
  );

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AlertDialog
        isOpen={alertState.isOpen}
        onClose={() => setAlertState((s) => ({ ...s, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        variant={alertState.variant}
      />
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((s) => ({ ...s, isOpen: false }))}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm || (() => {})}
        variant={confirmState.variant}
      />
    </ModalContext.Provider>
  );
}

export default Modal;
