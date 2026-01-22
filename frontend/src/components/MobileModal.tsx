"use client";

/**
 * MobileModal - Mobile-optimized modal dialog
 *
 * Features:
 * - Focus trapping
 * - Escape to close
 * - Backdrop click to close
 * - Safe area support
 * - Reduced motion support
 * - Haptic feedback
 *
 * Sprint 226: Mobile UX improvements
 */

import {
  useEffect,
  useCallback,
  memo,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { useMobileDetect } from "@/hooks/useMobileDetect";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface MobileModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
  size?: "small" | "medium" | "large" | "fullscreen";
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  preventScroll?: boolean;
  className?: string;
  footer?: ReactNode;
}

const SIZES = {
  small: "max-w-sm",
  medium: "max-w-md",
  large: "max-w-lg",
  fullscreen: "w-full h-full max-w-none rounded-none",
};

export const MobileModal = memo(function MobileModal({
  isOpen,
  onClose,
  children,
  title,
  description,
  size = "medium",
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  preventScroll = true,
  className = "",
  footer,
}: MobileModalProps) {
  const { trigger: haptic } = useHapticFeedback();
  const { isMobile } = useMobileDetect();
  const reducedMotion = useReducedMotion();

  // Focus trap
  const { containerRef } = useFocusTrap({
    enabled: isOpen,
    onEscape: closeOnEscape ? onClose : undefined,
  });

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen && preventScroll) {
      const originalStyle = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;

      // Account for scrollbar width
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = originalStyle;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [isOpen, preventScroll]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && closeOnBackdrop) {
        haptic("light");
        onClose();
      }
    },
    [closeOnBackdrop, haptic, onClose]
  );

  // Handle close button click
  const handleClose = useCallback(() => {
    haptic("light");
    onClose();
  }, [haptic, onClose]);

  const isFullscreen = size === "fullscreen";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            className="absolute inset-0 bg-black/50"
            style={{ backdropFilter: "blur(4px)" }}
            onClick={handleBackdropClick}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            ref={containerRef as React.RefObject<HTMLDivElement>}
            initial={{
              opacity: 0,
              scale: reducedMotion ? 1 : 0.95,
              y: reducedMotion ? 0 : 20,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              scale: reducedMotion ? 1 : 0.95,
              y: reducedMotion ? 0 : 20,
            }}
            transition={{
              type: reducedMotion ? "tween" : "spring",
              damping: 25,
              stiffness: 300,
              duration: reducedMotion ? 0.15 : undefined,
            }}
            className={`
              relative
              w-full
              ${SIZES[size]}
              ${isFullscreen ? "" : "mx-4 rounded-2xl"}
              bg-white
              shadow-2xl
              overflow-hidden
              flex
              flex-col
              ${className}
            `}
            style={{
              maxHeight: isFullscreen
                ? "100%"
                : isMobile
                ? "calc(100vh - 48px - env(safe-area-inset-top) - env(safe-area-inset-bottom))"
                : "calc(100vh - 64px)",
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "modal-title" : undefined}
            aria-describedby={description ? "modal-description" : undefined}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div
                className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100"
                style={{
                  paddingTop: isFullscreen && isMobile
                    ? "calc(16px + env(safe-area-inset-top))"
                    : undefined,
                }}
              >
                <div className="flex-1 min-w-0 pr-4">
                  {title && (
                    <h2
                      id="modal-title"
                      className="text-lg font-semibold text-gray-900 truncate"
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p
                      id="modal-description"
                      className="mt-1 text-sm text-gray-500"
                    >
                      {description}
                    </p>
                  )}
                </div>

                {showCloseButton && (
                  <button
                    onClick={handleClose}
                    className="
                      flex-shrink-0
                      p-2
                      -mr-2
                      rounded-full
                      text-gray-400
                      hover:text-gray-600
                      hover:bg-gray-100
                      transition-colors
                    "
                    style={{ touchAction: "manipulation" }}
                    aria-label="Fermer"
                  >
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
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-6 py-4"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div
                className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50"
                style={{
                  paddingBottom: isFullscreen && isMobile
                    ? "calc(16px + env(safe-area-inset-bottom))"
                    : undefined,
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

/**
 * Alert modal variant - simple message with buttons
 */
export const MobileAlert = memo(function MobileAlert({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel,
  destructive = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}) {
  const { trigger: haptic } = useHapticFeedback();

  const handleConfirm = useCallback(() => {
    haptic(destructive ? "warning" : "medium");
    onConfirm?.();
    onClose();
  }, [haptic, destructive, onConfirm, onClose]);

  return (
    <MobileModal
      isOpen={isOpen}
      onClose={onClose}
      size="small"
      showCloseButton={false}
      closeOnBackdrop={false}
    >
      <div className="text-center py-2">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {message && (
          <p className="mt-2 text-sm text-gray-600">{message}</p>
        )}

        <div className={`mt-6 flex ${cancelLabel ? "gap-3" : ""}`}>
          {cancelLabel && (
            <button
              onClick={onClose}
              className="
                flex-1
                py-3
                px-4
                rounded-xl
                text-sm
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
          )}
          <button
            onClick={handleConfirm}
            className={`
              flex-1
              py-3
              px-4
              rounded-xl
              text-sm
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
        </div>
      </div>
    </MobileModal>
  );
});

/**
 * Prompt modal variant - input with submit
 */
export const MobilePrompt = memo(function MobilePrompt({
  isOpen,
  onClose,
  onSubmit,
  title,
  message,
  placeholder = "",
  initialValue = "",
  submitLabel = "Valider",
  cancelLabel = "Annuler",
  inputType = "text",
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  cancelLabel?: string;
  inputType?: "text" | "email" | "tel" | "url" | "number";
}) {
  const [value, setValue] = useState(initialValue);
  const { trigger: haptic } = useHapticFeedback();

  // Reset value when modal opens
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
    }
  }, [isOpen, initialValue]);

  const handleSubmit = useCallback(() => {
    haptic("medium");
    onSubmit(value);
    onClose();
  }, [haptic, value, onSubmit, onClose]);

  return (
    <MobileModal
      isOpen={isOpen}
      onClose={onClose}
      size="small"
      showCloseButton={false}
      closeOnBackdrop={false}
    >
      <div className="py-2">
        <h2 className="text-lg font-semibold text-gray-900 text-center">{title}</h2>
        {message && (
          <p className="mt-2 text-sm text-gray-600 text-center">{message}</p>
        )}

        <input
          type={inputType}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="
            mt-4
            w-full
            px-4
            py-3
            rounded-xl
            border
            border-gray-200
            text-base
            focus:outline-none
            focus:border-blue-500
            focus:ring-2
            focus:ring-blue-500/20
          "
          style={{ fontSize: "16px" }} // Prevent iOS zoom
          autoFocus
        />

        <div className="mt-4 flex gap-3">
          <button
            onClick={onClose}
            className="
              flex-1
              py-3
              px-4
              rounded-xl
              text-sm
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
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="
              flex-1
              py-3
              px-4
              rounded-xl
              text-sm
              font-semibold
              text-white
              bg-blue-600
              hover:bg-blue-700
              active:bg-blue-800
              disabled:bg-gray-300
              disabled:cursor-not-allowed
              transition-colors
            "
            style={{ touchAction: "manipulation" }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </MobileModal>
  );
});

// Need useState import
import { useState } from "react";
