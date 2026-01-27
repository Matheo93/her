"use client";

/**
 * Alert Dialog Components - Sprint 772
 *
 * Confirmation and alert dialogs:
 * - Confirm dialog
 * - Alert variants
 * - Destructive actions
 * - Input confirmation
 * - Async actions
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
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type AlertVariant = "info" | "warning" | "error" | "success";

interface AlertDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: AlertVariant;
  destructive?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * Alert Dialog
 */
export const AlertDialog = memo(function AlertDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "info",
  destructive = false,
  loading = false,
  icon,
  children,
  className = "",
}: AlertDialogProps) {
  const { colors } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const actualLoading = loading || isLoading;

  const variantColors = {
    info: colors.coral,
    warning: "#f59e0b",
    error: "#ef4444",
    success: "#22c55e",
  };

  const variantIcons = {
    info: <InfoIcon size={24} />,
    warning: <WarningIcon size={24} />,
    error: <ErrorIcon size={24} />,
    success: <CheckIcon size={24} />,
  };

  useEffect(() => {
    if (open && confirmRef.current) {
      confirmRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !actualLoading) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, actualLoading, onClose]);

  const handleConfirm = useCallback(async () => {
    if (!onConfirm) {
      onClose();
      return;
    }

    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [onConfirm, onClose]);

  const accentColor = destructive ? "#ef4444" : variantColors[variant];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={() => !actualLoading && onClose()}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={
              "relative w-full max-w-md rounded-2xl p-6 shadow-xl " + className
            }
            style={{ backgroundColor: colors.warmWhite }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="alert-title"
            aria-describedby="alert-description"
          >
            {/* Icon */}
            <div className="flex items-start gap-4">
              <div
                className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: accentColor + "15",
                  color: accentColor,
                }}
              >
                {icon || variantIcons[variant]}
              </div>

              <div className="flex-1 min-w-0">
                <h2
                  id="alert-title"
                  className="text-lg font-semibold"
                  style={{ color: colors.textPrimary }}
                >
                  {title}
                </h2>

                {description && (
                  <p
                    id="alert-description"
                    className="mt-2 text-sm"
                    style={{ color: colors.textMuted }}
                  >
                    {description}
                  </p>
                )}

                {children && <div className="mt-4">{children}</div>}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 mt-6">
              <motion.button
                onClick={onClose}
                disabled={actualLoading}
                className="px-4 py-2 rounded-xl font-medium"
                style={{
                  backgroundColor: colors.cream,
                  color: colors.textPrimary,
                  opacity: actualLoading ? 0.5 : 1,
                }}
                whileHover={!actualLoading ? { scale: 1.02 } : undefined}
                whileTap={!actualLoading ? { scale: 0.98 } : undefined}
              >
                {cancelLabel}
              </motion.button>

              <motion.button
                ref={confirmRef}
                onClick={handleConfirm}
                disabled={actualLoading}
                className="px-4 py-2 rounded-xl font-medium flex items-center gap-2"
                style={{
                  backgroundColor: accentColor,
                  color: "#fff",
                  opacity: actualLoading ? 0.7 : 1,
                }}
                whileHover={!actualLoading ? { scale: 1.02 } : undefined}
                whileTap={!actualLoading ? { scale: 0.98 } : undefined}
              >
                {actualLoading && <LoadingSpinner size={16} />}
                {confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Simple Confirm Dialog
 */
export const ConfirmDialog = memo(function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      variant={destructive ? "error" : "info"}
      destructive={destructive}
    />
  );
});

interface DeleteDialogProps {
  open: boolean;
  onClose: () => void;
  onDelete: () => void | Promise<void>;
  itemName?: string;
  itemType?: string;
}

/**
 * Delete Confirmation Dialog
 */
export const DeleteDialog = memo(function DeleteDialog({
  open,
  onClose,
  onDelete,
  itemName,
  itemType = "item",
}: DeleteDialogProps) {
  return (
    <AlertDialog
      open={open}
      onClose={onClose}
      onConfirm={onDelete}
      title={"Delete " + itemType + "?"}
      description={
        itemName
          ? 'Are you sure you want to delete "' +
            itemName +
            '"? This action cannot be undone.'
          : "Are you sure you want to delete this " +
            itemType +
            "? This action cannot be undone."
      }
      confirmLabel="Delete"
      variant="error"
      destructive
    />
  );
});

interface InputConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void | Promise<void>;
  title: string;
  description?: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  requiredValue?: string;
  destructive?: boolean;
}

/**
 * Input Confirmation Dialog (type to confirm)
 */
export const InputConfirmDialog = memo(function InputConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  inputLabel,
  inputPlaceholder = "Type here...",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  requiredValue,
  destructive = false,
}: InputConfirmDialogProps) {
  const { colors } = useTheme();
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isValid = requiredValue ? value === requiredValue : value.length > 0;

  const handleConfirm = useCallback(async () => {
    if (!isValid) return;

    setIsLoading(true);
    try {
      await onConfirm(value);
      onClose();
      setValue("");
    } finally {
      setIsLoading(false);
    }
  }, [isValid, value, onConfirm, onClose]);

  const handleClose = useCallback(() => {
    setValue("");
    onClose();
  }, [onClose]);

  return (
    <AlertDialog
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      variant={destructive ? "error" : "warning"}
      destructive={destructive}
    >
      <div className="space-y-2">
        {inputLabel && (
          <label
            className="block text-sm font-medium"
            style={{ color: colors.textPrimary }}
          >
            {inputLabel}
          </label>
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={inputPlaceholder}
          className="w-full px-3 py-2 rounded-lg outline-none"
          style={{
            backgroundColor: colors.cream,
            color: colors.textPrimary,
            border:
              "2px solid " + (requiredValue && value && !isValid ? "#ef4444" : "transparent"),
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isValid) {
              handleConfirm();
            }
          }}
        />
        {requiredValue && (
          <p className="text-xs" style={{ color: colors.textMuted }}>
            Type "<span className="font-mono">{requiredValue}</span>" to
            confirm
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 mt-4">
        <motion.button
          onClick={handleClose}
          disabled={isLoading}
          className="px-4 py-2 rounded-xl font-medium"
          style={{
            backgroundColor: colors.cream,
            color: colors.textPrimary,
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {cancelLabel}
        </motion.button>

        <motion.button
          onClick={handleConfirm}
          disabled={!isValid || isLoading}
          className="px-4 py-2 rounded-xl font-medium flex items-center gap-2"
          style={{
            backgroundColor: destructive ? "#ef4444" : colors.coral,
            color: "#fff",
            opacity: !isValid || isLoading ? 0.5 : 1,
          }}
          whileHover={isValid && !isLoading ? { scale: 1.02 } : undefined}
          whileTap={isValid && !isLoading ? { scale: 0.98 } : undefined}
        >
          {isLoading && <LoadingSpinner size={16} />}
          {confirmLabel}
        </motion.button>
      </div>
    </AlertDialog>
  );
});

interface AlertBannerProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Alert Banner (inline)
 */
export const AlertBanner = memo(function AlertBanner({
  variant = "info",
  title,
  children,
  onDismiss,
  action,
  className = "",
}: AlertBannerProps) {
  const { colors } = useTheme();

  const variantColors = {
    info: { bg: colors.coral + "15", border: colors.coral, text: colors.coral },
    warning: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
    error: { bg: "#fee2e2", border: "#ef4444", text: "#991b1b" },
    success: { bg: "#dcfce7", border: "#22c55e", text: "#166534" },
  };

  const c = variantColors[variant];

  const icons = {
    info: <InfoIcon size={20} />,
    warning: <WarningIcon size={20} />,
    error: <ErrorIcon size={20} />,
    success: <CheckIcon size={20} />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={
        "p-4 rounded-xl flex items-start gap-3 " + className
      }
      style={{
        backgroundColor: c.bg,
        borderLeft: "4px solid " + c.border,
      }}
      role="alert"
    >
      <span style={{ color: c.text }}>{icons[variant]}</span>

      <div className="flex-1 min-w-0">
        {title && (
          <h4 className="font-semibold text-sm" style={{ color: c.text }}>
            {title}
          </h4>
        )}
        <div
          className={"text-sm " + (title ? "mt-1" : "")}
          style={{ color: c.text }}
        >
          {children}
        </div>

        {action && (
          <button
            onClick={action.onClick}
            className="mt-2 text-sm font-medium underline"
            style={{ color: c.text }}
          >
            {action.label}
          </button>
        )}
      </div>

      {onDismiss && (
        <motion.button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 rounded"
          style={{ color: c.text }}
          whileHover={{ backgroundColor: c.border + "20" }}
        >
          <CloseIcon size={16} />
        </motion.button>
      )}
    </motion.div>
  );
});

// Alert dialog hook context
interface AlertContextValue {
  confirm: (options: Omit<ConfirmDialogProps, "open" | "onClose">) => Promise<boolean>;
  alert: (options: { title: string; description?: string; variant?: AlertVariant }) => Promise<void>;
}

const AlertContext = createContext<AlertContextValue | null>(null);

/**
 * Alert Provider
 */
export const AlertProvider = memo(function AlertProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [dialog, setDialog] = useState<any>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (options: Omit<ConfirmDialogProps, "open" | "onClose">) => {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setDialog({
          type: "confirm",
          ...options,
        });
      });
    },
    []
  );

  const alert = useCallback(
    (options: { title: string; description?: string; variant?: AlertVariant }) => {
      return new Promise<void>((resolve) => {
        resolveRef.current = () => resolve() as any;
        setDialog({
          type: "alert",
          ...options,
        });
      });
    },
    []
  );

  const handleClose = useCallback(() => {
    resolveRef.current?.(false);
    setDialog(null);
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    setDialog(null);
  }, []);

  return (
    <AlertContext.Provider value={{ confirm, alert }}>
      {children}
      {dialog && (
        <AlertDialog
          open={true}
          onClose={handleClose}
          onConfirm={dialog.type === "confirm" ? handleConfirm : handleClose}
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel || (dialog.type === "alert" ? "OK" : "Confirm")}
          cancelLabel={dialog.cancelLabel}
          variant={dialog.variant}
          destructive={dialog.destructive}
        />
      )}
    </AlertContext.Provider>
  );
});

/**
 * useAlert hook
 */
export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within AlertProvider");
  }
  return context;
}

// Icons
const InfoIcon = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const WarningIcon = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ErrorIcon = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const CheckIcon = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="9 12 12 15 16 10" />
  </svg>
);

const CloseIcon = ({ size = 16 }) => (
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

const LoadingSpinner = ({ size = 16 }) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    animate={{ rotate: 360 }}
    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
  >
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
  </motion.svg>
);

export default AlertDialog;
