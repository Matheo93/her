"use client";

/**
 * useFocusTrap - Focus Management for Modals and Dialogs
 *
 * Traps focus within a container, essential for accessibility.
 * Handles tab/shift-tab navigation and escape key.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useEffect, useRef, useCallback } from "react";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable]",
].join(", ");

interface FocusTrapOptions {
  // Whether the focus trap is active
  enabled?: boolean;

  // Element to focus when trap activates (default: first focusable)
  initialFocusRef?: React.RefObject<HTMLElement>;

  // Element to focus when trap deactivates (default: previously focused)
  returnFocusRef?: React.RefObject<HTMLElement>;

  // Callback when escape key is pressed
  onEscape?: () => void;

  // Whether to auto-focus first element on mount
  autoFocus?: boolean;

  // Whether to restore focus on unmount
  restoreFocus?: boolean;
}

interface FocusTrapResult {
  // Ref to attach to the container
  containerRef: React.RefObject<HTMLDivElement | null>;

  // Manually activate the trap
  activate: () => void;

  // Manually deactivate the trap
  deactivate: () => void;

  // Focus the first focusable element
  focusFirst: () => void;

  // Focus the last focusable element
  focusLast: () => void;
}

export function useFocusTrap(options: FocusTrapOptions = {}): FocusTrapResult {
  const {
    enabled = true,
    initialFocusRef,
    returnFocusRef,
    onEscape,
    autoFocus = true,
    restoreFocus = true,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Get all focusable elements within container
  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    ).filter((el) => {
      // Filter out elements that are hidden or have display: none
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }, []);

  // Focus the first focusable element
  const focusFirst = useCallback(() => {
    const elements = getFocusableElements();
    if (elements.length > 0) {
      elements[0].focus();
    }
  }, [getFocusableElements]);

  // Focus the last focusable element
  const focusLast = useCallback(() => {
    const elements = getFocusableElements();
    if (elements.length > 0) {
      elements[elements.length - 1].focus();
    }
  }, [getFocusableElements]);

  // Activate focus trap
  const activate = useCallback(() => {
    // Store current active element
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    // Focus initial element or first focusable
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else if (autoFocus) {
      focusFirst();
    }
  }, [initialFocusRef, autoFocus, focusFirst]);

  // Deactivate focus trap
  const deactivate = useCallback(() => {
    if (restoreFocus) {
      const returnElement = returnFocusRef?.current ?? previousActiveElementRef.current;
      if (returnElement && typeof returnElement.focus === "function") {
        returnElement.focus();
      }
    }
  }, [restoreFocus, returnFocusRef]);

  // Handle keyboard events
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Escape
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape?.();
        return;
      }

      // Handle Tab
      if (e.key === "Tab") {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        // Shift + Tab on first element -> focus last
        if (e.shiftKey && activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
          return;
        }

        // Tab on last element -> focus first
        if (!e.shiftKey && activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
          return;
        }

        // If focus is outside container, bring it back
        if (!containerRef.current?.contains(activeElement as Node)) {
          e.preventDefault();
          e.shiftKey ? focusLast() : focusFirst();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, getFocusableElements, focusFirst, focusLast, onEscape]);

  // Activate on mount, deactivate on unmount
  useEffect(() => {
    if (enabled) {
      activate();
    }

    return () => {
      if (enabled) {
        deactivate();
      }
    };
  }, [enabled, activate, deactivate]);

  // Prevent focus from leaving container
  useEffect(() => {
    if (!enabled) return;

    const handleFocusIn = (e: FocusEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        // Focus escaped, bring it back
        focusFirst();
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, [enabled, focusFirst]);

  return {
    containerRef,
    activate,
    deactivate,
    focusFirst,
    focusLast,
  };
}

/**
 * Hook to manage focus on a single element
 */
export function useFocusOnMount(
  ref: React.RefObject<HTMLElement>,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (enabled && ref.current) {
      ref.current.focus();
    }
  }, [enabled, ref]);
}

/**
 * Hook to detect if element has focus within
 */
export function useFocusWithin(ref: React.RefObject<HTMLElement>): boolean {
  const [hasFocus, setHasFocus] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleFocusIn = () => setHasFocus(true);
    const handleFocusOut = (e: FocusEvent) => {
      if (!element.contains(e.relatedTarget as Node)) {
        setHasFocus(false);
      }
    };

    element.addEventListener("focusin", handleFocusIn);
    element.addEventListener("focusout", handleFocusOut);

    return () => {
      element.removeEventListener("focusin", handleFocusIn);
      element.removeEventListener("focusout", handleFocusOut);
    };
  }, [ref]);

  return hasFocus;
}

// Need to import useState for useFocusWithin
import { useState } from "react";

/**
 * Hook to cycle focus through elements
 */
export function useFocusCycle(refs: React.RefObject<HTMLElement>[]): {
  focusNext: () => void;
  focusPrevious: () => void;
  focusIndex: (index: number) => void;
  currentIndex: number;
} {
  const [currentIndex, setCurrentIndex] = useState(0);

  const focusNext = useCallback(() => {
    const nextIndex = (currentIndex + 1) % refs.length;
    refs[nextIndex]?.current?.focus();
    setCurrentIndex(nextIndex);
  }, [currentIndex, refs]);

  const focusPrevious = useCallback(() => {
    const prevIndex = (currentIndex - 1 + refs.length) % refs.length;
    refs[prevIndex]?.current?.focus();
    setCurrentIndex(prevIndex);
  }, [currentIndex, refs]);

  const focusIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < refs.length) {
        refs[index]?.current?.focus();
        setCurrentIndex(index);
      }
    },
    [refs]
  );

  return { focusNext, focusPrevious, focusIndex, currentIndex };
}
