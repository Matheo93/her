"use client";

/**
 * Toast Components - Sprint 640
 *
 * Notification toast components:
 * - Basic toast
 * - Toast variants
 * - Toast with actions
 * - Toast container
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useEffect, createContext, useContext, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useTheme } from "@/context/ThemeContext";

type ToastVariant = "info" | "success" | "warning" | "error";
type ToastPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";

interface Toast {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

interface ToastProviderProps {
  children: ReactNode;
  position?: ToastPosition;
  maxToasts?: number;
}

/**
 * Toast Provider
 */
export function ToastProvider({
  children,
  position = "top-right",
  maxToasts = 5,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const newToast: Toast = {
        id,
        dismissible: true,
        duration: 5000,
        ...toast,
      };

      setToasts((prev) => {
        const updated = [newToast, ...prev];
        return updated.slice(0, maxToasts);
      });

      return id;
    },
    [maxToasts]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
      {children}
      <ToastContainer position={position} />
    </ToastContext.Provider>
  );
}

/**
 * useToast Hook
 */
export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  const toast = useCallback(
    (options: Omit<Toast, "id" | "variant"> & { variant?: ToastVariant }) => {
      return context.addToast({
        variant: "info",
        ...options,
      });
    },
    [context]
  );

  const success = useCallback(
    (message: string, options?: Partial<Omit<Toast, "id" | "variant" | "message">>) => {
      return context.addToast({ message, variant: "success", ...options });
    },
    [context]
  );

  const error = useCallback(
    (message: string, options?: Partial<Omit<Toast, "id" | "variant" | "message">>) => {
      return context.addToast({ message, variant: "error", ...options });
    },
    [context]
  );

  const warning = useCallback(
    (message: string, options?: Partial<Omit<Toast, "id" | "variant" | "message">>) => {
      return context.addToast({ message, variant: "warning", ...options });
    },
    [context]
  );

  const info = useCallback(
    (message: string, options?: Partial<Omit<Toast, "id" | "variant" | "message">>) => {
      return context.addToast({ message, variant: "info", ...options });
    },
    [context]
  );

  return {
    toast,
    success,
    error,
    warning,
    info,
    dismiss: context.removeToast,
    dismissAll: context.clearToasts,
  };
}

interface ToastContainerProps {
  position: ToastPosition;
}

/**
 * Toast Container
 */
const ToastContainer = memo(function ToastContainer({ position }: ToastContainerProps) {
  const context = useContext(ToastContext);

  if (!context || typeof window === "undefined") return null;

  const positionClasses = {
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "top-center": "top-4 left-1/2 -translate-x-1/2",
    "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
  };

  const isTop = position.startsWith("top");

  return createPortal(
    <div className={"fixed z-50 flex flex-col gap-2 " + positionClasses[position]}>
      <AnimatePresence mode="popLayout">
        {context.toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => context.removeToast(toast.id)}
            position={isTop ? "top" : "bottom"}
          />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
});

interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
  position: "top" | "bottom";
}

/**
 * Toast Item
 */
const ToastItem = memo(function ToastItem({ toast, onDismiss, position }: ToastItemProps) {
  const { colors } = useTheme();

  const variantStyles = {
    info: {
      bg: colors.coral,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
    },
    success: {
      bg: "#22c55e",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    warning: {
      bg: "#f59e0b",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    error: {
      bg: "#ef4444",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      ),
    },
  };

  const style = variantStyles[toast.variant];

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(onDismiss, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: position === "top" ? -20 : 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
      className="w-80 rounded-xl shadow-lg overflow-hidden"
      style={{ backgroundColor: style.bg }}
    >
      <div className="flex items-start gap-3 p-4 text-white">
        <div className="flex-shrink-0">{style.icon}</div>
        <div className="flex-1 min-w-0">
          {toast.title && (
            <p className="font-semibold text-sm">{toast.title}</p>
          )}
          <p className={"text-sm " + (toast.title ? "opacity-90" : "")}>
            {toast.message}
          </p>
          {toast.action && (
            <button
              type="button"
              className="mt-2 text-sm font-medium underline underline-offset-2"
              onClick={() => {
                toast.action?.onClick();
                onDismiss();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
        {toast.dismissible && (
          <button
            type="button"
            className="flex-shrink-0 p-1 rounded-lg hover:bg-white/20 transition-colors"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
});

interface AlertProps {
  variant?: ToastVariant;
  title?: string;
  children: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Inline Alert Component
 */
export const Alert = memo(function Alert({
  variant = "info",
  title,
  children,
  dismissible = false,
  onDismiss,
  action,
  className = "",
}: AlertProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(true);

  const variantStyles = {
    info: {
      bg: colors.coral + "15",
      border: colors.coral,
      icon: colors.coral,
    },
    success: {
      bg: "#22c55e15",
      border: "#22c55e",
      icon: "#22c55e",
    },
    warning: {
      bg: "#f59e0b15",
      border: "#f59e0b",
      icon: "#f59e0b",
    },
    error: {
      bg: "#ef444415",
      border: "#ef4444",
      icon: "#ef4444",
    },
  };

  const icons = {
    info: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
    success: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    warning: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    error: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  };

  const style = variantStyles[variant];

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  if (!visible) return null;

  return (
    <div
      className={"flex items-start gap-3 p-4 rounded-xl " + className}
      style={{
        backgroundColor: style.bg,
        border: "1px solid " + style.border,
      }}
      role="alert"
    >
      <div className="flex-shrink-0" style={{ color: style.icon }}>
        {icons[variant]}
      </div>
      <div className="flex-1 min-w-0">
        {title && (
          <p
            className="font-semibold text-sm"
            style={{ color: colors.textPrimary }}
          >
            {title}
          </p>
        )}
        <div
          className={"text-sm " + (title ? "mt-1" : "")}
          style={{ color: colors.textMuted }}
        >
          {children}
        </div>
        {action && (
          <button
            type="button"
            className="mt-2 text-sm font-medium"
            style={{ color: style.border }}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
      {dismissible && (
        <button
          type="button"
          className="flex-shrink-0 p-1 rounded-lg transition-colors"
          style={{ color: colors.textMuted }}
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
});

/**
 * Banner Component
 */
export const Banner = memo(function Banner({
  variant = "info",
  children,
  dismissible = false,
  onDismiss,
  action,
  className = "",
}: Omit<AlertProps, "title">) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(true);

  const variantStyles = {
    info: colors.coral,
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
  };

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  if (!visible) return null;

  return (
    <div
      className={"flex items-center justify-center gap-4 px-4 py-3 text-white text-sm " + className}
      style={{ backgroundColor: variantStyles[variant] }}
      role="alert"
    >
      <span>{children}</span>
      {action && (
        <button
          type="button"
          className="font-medium underline underline-offset-2"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
      {dismissible && (
        <button
          type="button"
          className="absolute right-4"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
});

export default ToastProvider;
