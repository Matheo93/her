"use client";

/**
 * Snackbar Components - Sprint 782
 *
 * Notification snackbars and toasts:
 * - Multiple positions
 * - Auto-dismiss
 * - Action buttons
 * - Queue management
 * - Progress indicator
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
  createContext,
  useContext,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type SnackbarPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

type SnackbarVariant = "default" | "success" | "error" | "warning" | "info";

interface SnackbarItem {
  id: string;
  message: string;
  variant?: SnackbarVariant;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: ReactNode;
  onClose?: () => void;
  persistent?: boolean;
  progress?: boolean;
}

interface SnackbarProps {
  item: SnackbarItem;
  onDismiss: (id: string) => void;
  position: SnackbarPosition;
}

/**
 * Single Snackbar
 */
const Snackbar = memo(function Snackbar({
  item,
  onDismiss,
  position,
}: SnackbarProps) {
  const { colors } = useTheme();
  const [progress, setProgress] = useState(100);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const duration = item.duration ?? 5000;

  const variantStyles = {
    default: {
      bg: colors.textPrimary,
      text: colors.warmWhite,
      icon: null,
    },
    success: {
      bg: "#22c55e",
      text: "#fff",
      icon: <CheckCircleIcon />,
    },
    error: {
      bg: "#ef4444",
      text: "#fff",
      icon: <XCircleIcon />,
    },
    warning: {
      bg: "#f59e0b",
      text: "#fff",
      icon: <AlertTriangleIcon />,
    },
    info: {
      bg: colors.coral,
      text: "#fff",
      icon: <InfoIcon />,
    },
  };

  const variant = item.variant || "default";
  const styles = variantStyles[variant];

  // Auto-dismiss with progress
  useEffect(() => {
    if (item.persistent) return;

    const startTime = Date.now();
    const updateInterval = 50;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        onDismiss(item.id);
      }
    }, updateInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [item.id, item.persistent, duration, onDismiss]);

  const handleDismiss = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    item.onClose?.();
    onDismiss(item.id);
  }, [item, onDismiss]);

  const handleAction = useCallback(() => {
    item.action?.onClick();
    handleDismiss();
  }, [item.action, handleDismiss]);

  // Animation variants based on position
  const getAnimationVariants = () => {
    const isTop = position.startsWith("top");
    const isLeft = position.endsWith("left");
    const isRight = position.endsWith("right");

    let initial = { opacity: 0, y: isTop ? -20 : 20 };
    if (isLeft) initial = { ...initial, x: -20 } as any;
    if (isRight) initial = { ...initial, x: 20 } as any;

    return {
      initial,
      animate: { opacity: 1, y: 0, x: 0 },
      exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
    };
  };

  const variants = getAnimationVariants();

  return (
    <motion.div
      layout
      initial={variants.initial}
      animate={variants.animate}
      exit={variants.exit}
      className="relative min-w-72 max-w-md rounded-xl shadow-lg overflow-hidden"
      style={{ backgroundColor: styles.bg }}
    >
      <div className="flex items-center gap-3 p-4">
        {/* Icon */}
        {(item.icon || styles.icon) && (
          <span className="flex-shrink-0" style={{ color: styles.text }}>
            {item.icon || styles.icon}
          </span>
        )}

        {/* Message */}
        <p
          className="flex-1 text-sm font-medium"
          style={{ color: styles.text }}
        >
          {item.message}
        </p>

        {/* Action button */}
        {item.action && (
          <button
            onClick={handleAction}
            className="flex-shrink-0 px-3 py-1 rounded-lg font-medium text-sm transition-colors"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.2)",
              color: styles.text,
            }}
          >
            {item.action.label}
          </button>
        )}

        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-full transition-colors"
          style={{ color: styles.text + "80" }}
        >
          <XIcon size={16} />
        </button>
      </div>

      {/* Progress bar */}
      {item.progress && !item.persistent && (
        <div
          className="absolute bottom-0 left-0 h-1 transition-all duration-100"
          style={{
            width: progress + "%",
            backgroundColor: "rgba(255, 255, 255, 0.3)",
          }}
        />
      )}
    </motion.div>
  );
});

interface SnackbarContainerProps {
  items: SnackbarItem[];
  onDismiss: (id: string) => void;
  position?: SnackbarPosition;
  maxVisible?: number;
}

/**
 * Snackbar Container
 */
export const SnackbarContainer = memo(function SnackbarContainer({
  items,
  onDismiss,
  position = "bottom-center",
  maxVisible = 5,
}: SnackbarContainerProps) {
  const positionStyles: Record<SnackbarPosition, string> = {
    "top-left": "top-4 left-4 items-start",
    "top-center": "top-4 left-1/2 -translate-x-1/2 items-center",
    "top-right": "top-4 right-4 items-end",
    "bottom-left": "bottom-4 left-4 items-start",
    "bottom-center": "bottom-4 left-1/2 -translate-x-1/2 items-center",
    "bottom-right": "bottom-4 right-4 items-end",
  };

  const visibleItems = items.slice(-maxVisible);
  const isTop = position.startsWith("top");

  return (
    <div
      className={
        "fixed z-50 flex flex-col gap-2 pointer-events-none " +
        positionStyles[position]
      }
      style={{
        flexDirection: isTop ? "column" : "column-reverse",
      }}
    >
      <AnimatePresence mode="popLayout">
        {visibleItems.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <Snackbar item={item} onDismiss={onDismiss} position={position} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
});

// Context for global snackbar management
interface SnackbarContextType {
  show: (item: Omit<SnackbarItem, "id">) => string;
  success: (message: string, options?: Partial<SnackbarItem>) => string;
  error: (message: string, options?: Partial<SnackbarItem>) => string;
  warning: (message: string, options?: Partial<SnackbarItem>) => string;
  info: (message: string, options?: Partial<SnackbarItem>) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const SnackbarContext = createContext<SnackbarContextType | null>(null);

export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error("useSnackbar must be used within SnackbarProvider");
  }
  return context;
};

interface SnackbarProviderProps {
  children: ReactNode;
  position?: SnackbarPosition;
  maxVisible?: number;
}

/**
 * Snackbar Provider
 */
export const SnackbarProvider = memo(function SnackbarProvider({
  children,
  position = "bottom-center",
  maxVisible = 5,
}: SnackbarProviderProps) {
  const [items, setItems] = useState<SnackbarItem[]>([]);
  const idCounter = useRef(0);

  const generateId = useCallback(() => {
    idCounter.current += 1;
    return "snackbar-" + idCounter.current + "-" + Date.now();
  }, []);

  const show = useCallback(
    (item: Omit<SnackbarItem, "id">) => {
      const id = generateId();
      setItems((prev) => [...prev, { ...item, id }]);
      return id;
    },
    [generateId]
  );

  const success = useCallback(
    (message: string, options?: Partial<SnackbarItem>) => {
      return show({ message, variant: "success", progress: true, ...options });
    },
    [show]
  );

  const error = useCallback(
    (message: string, options?: Partial<SnackbarItem>) => {
      return show({
        message,
        variant: "error",
        progress: true,
        duration: 8000,
        ...options,
      });
    },
    [show]
  );

  const warning = useCallback(
    (message: string, options?: Partial<SnackbarItem>) => {
      return show({ message, variant: "warning", progress: true, ...options });
    },
    [show]
  );

  const info = useCallback(
    (message: string, options?: Partial<SnackbarItem>) => {
      return show({ message, variant: "info", progress: true, ...options });
    },
    [show]
  );

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setItems([]);
  }, []);

  return (
    <SnackbarContext.Provider
      value={{ show, success, error, warning, info, dismiss, dismissAll }}
    >
      {children}
      <SnackbarContainer
        items={items}
        onDismiss={dismiss}
        position={position}
        maxVisible={maxVisible}
      />
    </SnackbarContext.Provider>
  );
});

interface ToastProps {
  message: string;
  description?: string;
  variant?: SnackbarVariant;
  duration?: number;
  onClose?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Standalone Toast Component
 */
export const Toast = memo(function Toast({
  message,
  description,
  variant = "default",
  duration = 5000,
  onClose,
  action,
}: ToastProps) {
  const { colors } = useTheme();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const variantStyles = {
    default: { border: colors.cream, icon: null },
    success: { border: "#22c55e", icon: <CheckCircleIcon color="#22c55e" /> },
    error: { border: "#ef4444", icon: <XCircleIcon color="#ef4444" /> },
    warning: { border: "#f59e0b", icon: <AlertTriangleIcon color="#f59e0b" /> },
    info: { border: colors.coral, icon: <InfoIcon color={colors.coral} /> },
  };

  const styles = variantStyles[variant];

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="flex items-start gap-3 p-4 rounded-xl shadow-lg"
      style={{
        backgroundColor: colors.warmWhite,
        border: "2px solid " + styles.border,
      }}
    >
      {styles.icon && <span className="flex-shrink-0 mt-0.5">{styles.icon}</span>}

      <div className="flex-1 min-w-0">
        <p
          className="font-medium"
          style={{ color: colors.textPrimary }}
        >
          {message}
        </p>
        {description && (
          <p
            className="text-sm mt-1"
            style={{ color: colors.textMuted }}
          >
            {description}
          </p>
        )}
      </div>

      {action && (
        <button
          onClick={() => {
            action.onClick();
            setIsVisible(false);
            onClose?.();
          }}
          className="flex-shrink-0 text-sm font-medium"
          style={{ color: colors.coral }}
        >
          {action.label}
        </button>
      )}

      <button
        onClick={() => {
          setIsVisible(false);
          onClose?.();
        }}
        className="flex-shrink-0 p-1 rounded-full"
        style={{ color: colors.textMuted }}
      >
        <XIcon size={16} />
      </button>
    </motion.div>
  );
});

interface PromiseToastOptions {
  loading: string;
  success: string | ((data: any) => string);
  error: string | ((error: any) => string);
}

/**
 * Promise Toast Hook
 */
export function usePromiseToast() {
  const snackbar = useSnackbar();

  return useCallback(
    <T,>(promise: Promise<T>, options: PromiseToastOptions): Promise<T> => {
      const loadingId = snackbar.show({
        message: options.loading,
        variant: "info",
        persistent: true,
      });

      return promise
        .then((data) => {
          snackbar.dismiss(loadingId);
          const message =
            typeof options.success === "function"
              ? options.success(data)
              : options.success;
          snackbar.success(message);
          return data;
        })
        .catch((error) => {
          snackbar.dismiss(loadingId);
          const message =
            typeof options.error === "function"
              ? options.error(error)
              : options.error;
          snackbar.error(message);
          throw error;
        });
    },
    [snackbar]
  );
}

// Icons
const XIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CheckCircleIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const XCircleIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const AlertTriangleIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const InfoIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export default SnackbarProvider;
