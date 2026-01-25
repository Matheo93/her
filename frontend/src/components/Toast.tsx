"use client";

/**
 * Toast Notification System - Sprint 590
 *
 * Animated toast notifications with:
 * - Multiple types (success, error, warning, info)
 * - Auto-dismiss with progress
 * - Stack management
 * - HER-themed styling
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  memo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  dismissible?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook to use toast notifications
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Toast Provider
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">): string => {
    const id = generateId();
    const newToast: Toast = {
      id,
      duration: 5000,
      dismissible: true,
      ...toast,
    };

    setToasts((prev) => [...prev, newToast].slice(-5)); // Max 5 toasts
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearAll }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

/**
 * Icons for toast types
 */
const SuccessIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const ErrorIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const WarningIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const InfoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ICONS: Record<ToastType, React.FC> = {
  success: SuccessIcon,
  error: ErrorIcon,
  warning: WarningIcon,
  info: InfoIcon,
};

/**
 * Single Toast Item
 */
const ToastItem = memo(function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const [progress, setProgress] = useState(100);

  const typeColors: Record<ToastType, { bg: string; border: string; text: string }> = {
    success: {
      bg: `${colors.success}15`,
      border: colors.success,
      text: colors.success,
    },
    error: {
      bg: `${colors.error}15`,
      border: colors.error,
      text: colors.error,
    },
    warning: {
      bg: `${colors.warning}15`,
      border: colors.warning,
      text: colors.warning,
    },
    info: {
      bg: `${colors.coral}15`,
      border: colors.coral,
      text: colors.coral,
    },
  };

  const style = typeColors[toast.type];
  const Icon = ICONS[toast.type];

  // Auto-dismiss timer
  useEffect(() => {
    if (!toast.duration) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / toast.duration!) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [toast.duration, onDismiss]);

  return (
    <motion.div
      className="relative overflow-hidden rounded-lg shadow-lg"
      style={{
        backgroundColor: colors.warmWhite,
        border: `1px solid ${style.border}`,
        minWidth: 280,
        maxWidth: 400,
      }}
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.9 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      layout
    >
      {/* Content */}
      <div className="flex items-start gap-3 p-3">
        {/* Icon */}
        <div
          className="flex-shrink-0 p-1 rounded"
          style={{ backgroundColor: style.bg, color: style.text }}
        >
          <Icon />
        </div>

        {/* Message */}
        <div className="flex-1 pt-0.5">
          <p className="text-sm" style={{ color: colors.textPrimary }}>
            {toast.message}
          </p>
        </div>

        {/* Dismiss button */}
        {toast.dismissible && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
            style={{ color: colors.textMuted }}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* Progress bar */}
      {toast.duration && (
        <div
          className="absolute bottom-0 left-0 h-0.5 transition-all"
          style={{
            width: `${progress}%`,
            backgroundColor: style.border,
          }}
        />
      )}
    </motion.div>
  );
});

/**
 * Toast Container
 */
const ToastContainer = memo(function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      style={{ pointerEvents: "none" }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: "auto" }}>
            <ToastItem
              toast={toast}
              onDismiss={() => removeToast(toast.id)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
});

/**
 * Convenience functions for creating toasts
 */
export const toast = {
  success: (message: string, options?: Partial<Toast>) => {
    // Note: This requires ToastContext to be available
    // Use useToast() hook in components instead
    console.log("Toast success:", message);
    return message;
  },
  error: (message: string, options?: Partial<Toast>) => {
    console.log("Toast error:", message);
    return message;
  },
  warning: (message: string, options?: Partial<Toast>) => {
    console.log("Toast warning:", message);
    return message;
  },
  info: (message: string, options?: Partial<Toast>) => {
    console.log("Toast info:", message);
    return message;
  },
};

export default ToastProvider;
