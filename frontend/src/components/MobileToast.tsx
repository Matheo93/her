"use client";

/**
 * MobileToast - Mobile-optimized toast notifications
 *
 * Features:
 * - Swipe to dismiss
 * - Auto-dismiss with progress
 * - Multiple toast stacking
 * - Haptic feedback
 * - Safe area support
 *
 * Sprint 226: Mobile UX improvements
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  memo,
  type ReactNode,
} from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { useMobileDetect } from "@/hooks/useMobileDetect";
import { useReducedMotion } from "@/hooks/useReducedMotion";

// Toast types
type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;

  // Convenience methods
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Generate unique ID
const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Default durations by type
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
};

// Colors by type
const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: "#ecfdf5", border: "#10b981", icon: "#059669" },
  error: { bg: "#fef2f2", border: "#ef4444", icon: "#dc2626" },
  warning: { bg: "#fffbeb", border: "#f59e0b", icon: "#d97706" },
  info: { bg: "#eff6ff", border: "#3b82f6", icon: "#2563eb" },
};

// Icons by type
const ToastIcon = memo(function ToastIcon({ type }: { type: ToastType }) {
  const color = TOAST_COLORS[type].icon;

  switch (type) {
    case "success":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case "error":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case "warning":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "info":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
});

// Individual toast component
const ToastItem = memo(function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const { trigger: haptic } = useHapticFeedback();
  const reducedMotion = useReducedMotion();
  const [progress, setProgress] = useState(100);

  const colors = TOAST_COLORS[toast.type];
  const duration = toast.duration ?? DEFAULT_DURATIONS[toast.type];
  const dismissible = toast.dismissible !== false;

  // Auto-dismiss timer
  useEffect(() => {
    if (duration <= 0) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onDismiss]);

  // Handle swipe dismiss
  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      if (!dismissible) return;

      const { offset, velocity } = info;
      // Dismiss if swiped far enough or fast enough
      if (Math.abs(offset.x) > 100 || Math.abs(velocity.x) > 500) {
        haptic("light");
        onDismiss();
      }
    },
    [dismissible, haptic, onDismiss]
  );

  // Handle action click
  const handleAction = useCallback(() => {
    haptic("medium");
    toast.action?.onClick();
    onDismiss();
  }, [haptic, toast.action, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{
        type: reducedMotion ? "tween" : "spring",
        damping: 25,
        stiffness: 300,
        duration: reducedMotion ? 0.15 : undefined,
      }}
      drag={dismissible ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.5}
      onDragEnd={handleDragEnd}
      className="relative w-full max-w-sm mx-auto mb-2"
      role="alert"
      aria-live="polite"
    >
      <div
        className="rounded-xl shadow-lg overflow-hidden"
        style={{
          backgroundColor: colors.bg,
          borderLeft: `4px solid ${colors.border}`,
        }}
      >
        <div className="p-4 flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 pt-0.5">
            <ToastIcon type={toast.type} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
            {toast.message && (
              <p className="mt-1 text-sm text-gray-600">{toast.message}</p>
            )}
            {toast.action && (
              <button
                onClick={handleAction}
                className="mt-2 text-sm font-medium transition-colors"
                style={{ color: colors.icon }}
              >
                {toast.action.label}
              </button>
            )}
          </div>

          {/* Dismiss button */}
          {dismissible && (
            <button
              onClick={() => {
                haptic("light");
                onDismiss();
              }}
              className="flex-shrink-0 p-1 rounded-full hover:bg-black/5 transition-colors"
              aria-label="Fermer"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-gray-400"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Progress bar */}
        {duration > 0 && (
          <div
            className="h-1 transition-all"
            style={{
              width: `${progress}%`,
              backgroundColor: colors.border,
              opacity: 0.5,
            }}
          />
        )}
      </div>
    </motion.div>
  );
});

/**
 * Toast provider component
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { isMobile } = useMobileDetect();
  const { trigger: haptic } = useHapticFeedback();

  const addToast = useCallback(
    (toast: Omit<Toast, "id">): string => {
      const id = generateId();
      setToasts((prev) => [...prev, { ...toast, id }]);

      // Haptic feedback based on type
      switch (toast.type) {
        case "success":
          haptic("success");
          break;
        case "error":
          haptic("error");
          break;
        case "warning":
          haptic("warning");
          break;
        default:
          haptic("notification");
      }

      return id;
    },
    [haptic]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const success = useCallback(
    (title: string, message?: string) =>
      addToast({ type: "success", title, message }),
    [addToast]
  );

  const error = useCallback(
    (title: string, message?: string) =>
      addToast({ type: "error", title, message }),
    [addToast]
  );

  const warning = useCallback(
    (title: string, message?: string) =>
      addToast({ type: "warning", title, message }),
    [addToast]
  );

  const info = useCallback(
    (title: string, message?: string) =>
      addToast({ type: "info", title, message }),
    [addToast]
  );

  const contextValue: ToastContextValue = {
    toasts,
    addToast,
    removeToast,
    clearAll,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* Toast container */}
      <div
        className="fixed left-0 right-0 z-50 pointer-events-none"
        style={{
          bottom: isMobile ? "calc(16px + env(safe-area-inset-bottom))" : "16px",
        }}
      >
        <div className="px-4 pointer-events-auto">
          <AnimatePresence mode="popLayout">
            {toasts.map((toast) => (
              <ToastItem
                key={toast.id}
                toast={toast}
                onDismiss={() => removeToast(toast.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Hook to use toast notifications
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

/**
 * Standalone toast component (for use without provider)
 */
export const StandaloneToast = memo(function StandaloneToast({
  type,
  title,
  message,
  isVisible,
  onClose,
  duration = 3000,
}: {
  type: ToastType;
  title: string;
  message?: string;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}) {
  const { isMobile } = useMobileDetect();

  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <div
          className="fixed left-0 right-0 z-50"
          style={{
            bottom: isMobile ? "calc(16px + env(safe-area-inset-bottom))" : "16px",
          }}
        >
          <div className="px-4">
            <ToastItem
              toast={{ id: "standalone", type, title, message, duration: 0 }}
              onDismiss={onClose}
            />
          </div>
        </div>
      )}
    </AnimatePresence>
  );
});
