"use client";

/**
 * useClipboard - Clipboard Operations Hook
 *
 * Provides copy/paste functionality with haptic feedback.
 * Falls back to execCommand for older browsers.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useHapticFeedback } from "./useHapticFeedback";

interface ClipboardResult {
  // Copy text to clipboard
  copy: (text: string) => Promise<boolean>;

  // Read text from clipboard
  paste: () => Promise<string | null>;

  // Last copied value (for UI feedback)
  copiedValue: string | null;

  // Whether clipboard API is supported
  isSupported: boolean;

  // Whether currently copying
  isCopying: boolean;

  // Whether copy was successful (resets after timeout)
  hasCopied: boolean;

  // Error if copy failed
  error: Error | null;

  // Reset the copied state
  reset: () => void;
}

interface UseClipboardOptions {
  // Duration to show "copied" state (default: 2000ms)
  successDuration?: number;

  // Enable haptic feedback
  haptic?: boolean;

  // Callback on successful copy
  onSuccess?: (text: string) => void;

  // Callback on error
  onError?: (error: Error) => void;
}

export function useClipboard(options: UseClipboardOptions = {}): ClipboardResult {
  const {
    successDuration = 2000,
    haptic = true,
    onSuccess,
    onError,
  } = options;

  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { trigger: triggerHaptic } = useHapticFeedback();

  // Check if clipboard API is supported
  const isSupported =
    typeof navigator !== "undefined" &&
    "clipboard" in navigator &&
    typeof navigator.clipboard.writeText === "function";

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setCopiedValue(null);
    setHasCopied(false);
    setError(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Copy text to clipboard
  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (isCopying) return false;

      setIsCopying(true);
      setError(null);

      try {
        if (isSupported) {
          // Modern Clipboard API
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback for older browsers
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed";
          textArea.style.left = "-9999px";
          textArea.style.top = "-9999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();

          const successful = document.execCommand("copy");
          document.body.removeChild(textArea);

          if (!successful) {
            throw new Error("execCommand copy failed");
          }
        }

        // Success
        setCopiedValue(text);
        setHasCopied(true);

        if (haptic) {
          triggerHaptic("success");
        }

        onSuccess?.(text);

        // Reset after timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          setHasCopied(false);
        }, successDuration);

        return true;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Copy failed");
        setError(error);
        setHasCopied(false);

        if (haptic) {
          triggerHaptic("error");
        }

        onError?.(error);
        return false;
      } finally {
        setIsCopying(false);
      }
    },
    [isSupported, isCopying, haptic, triggerHaptic, successDuration, onSuccess, onError]
  );

  // Read from clipboard
  const paste = useCallback(async (): Promise<string | null> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (haptic) {
          triggerHaptic("light");
        }
        return text;
      }
      return null;
    } catch {
      return null;
    }
  }, [haptic, triggerHaptic]);

  return {
    copy,
    paste,
    copiedValue,
    isSupported,
    isCopying,
    hasCopied,
    error,
    reset,
  };
}

/**
 * Simplified hook for just copying
 */
export function useCopyToClipboard(
  successDuration: number = 2000
): [boolean, (text: string) => Promise<boolean>] {
  const { hasCopied, copy } = useClipboard({ successDuration });
  return [hasCopied, copy];
}

/**
 * Hook for copy button state management
 */
export function useCopyButton(
  textToCopy: string,
  options: UseClipboardOptions = {}
): {
  copy: () => Promise<boolean>;
  isCopying: boolean;
  hasCopied: boolean;
  label: string;
} {
  const { copy, isCopying, hasCopied } = useClipboard(options);

  const handleCopy = useCallback(() => {
    return copy(textToCopy);
  }, [copy, textToCopy]);

  const label = hasCopied ? "Copié !" : isCopying ? "Copie..." : "Copier";

  return {
    copy: handleCopy,
    isCopying,
    hasCopied,
    label,
  };
}

/**
 * Hook for share functionality (uses Share API if available, falls back to clipboard)
 */
export function useShare(): {
  share: (data: { title?: string; text?: string; url?: string }) => Promise<boolean>;
  canShare: boolean;
  isSharing: boolean;
} {
  const [isSharing, setIsSharing] = useState(false);
  const { copy } = useClipboard();
  const { trigger: triggerHaptic } = useHapticFeedback();

  const canShare =
    typeof navigator !== "undefined" &&
    "share" in navigator &&
    typeof navigator.share === "function";

  const share = useCallback(
    async (data: { title?: string; text?: string; url?: string }): Promise<boolean> => {
      if (isSharing) return false;

      setIsSharing(true);

      try {
        if (canShare) {
          await navigator.share(data);
          triggerHaptic("success");
          return true;
        } else {
          // Fallback: copy URL or text to clipboard
          const textToCopy = data.url || data.text || "";
          if (textToCopy) {
            return await copy(textToCopy);
          }
          return false;
        }
      } catch (err) {
        // User cancelled share dialog - not an error
        if (err instanceof Error && err.name === "AbortError") {
          return false;
        }
        triggerHaptic("error");
        return false;
      } finally {
        setIsSharing(false);
      }
    },
    [canShare, copy, isSharing, triggerHaptic]
  );

  return { share, canShare, isSharing };
}
