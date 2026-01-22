"use client";

/**
 * useClickOutside - Click Outside Detection
 *
 * Detects clicks outside a referenced element.
 * Essential for dropdown menus, modals, etc.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useEffect, useCallback, useRef } from "react";

type EventType = "click" | "mousedown" | "mouseup" | "touchstart" | "touchend";

interface ClickOutsideOptions {
  // Event type to listen for
  eventType?: EventType;

  // Whether the hook is active
  enabled?: boolean;

  // Elements to ignore (won't trigger callback)
  ignoreRefs?: React.RefObject<HTMLElement | null>[];

  // CSS selector for elements to ignore
  ignoreSelector?: string;
}

/**
 * Hook to detect clicks outside a referenced element
 */
export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  callback: (event: MouseEvent | TouchEvent) => void,
  options: ClickOutsideOptions = {}
): void {
  const {
    eventType = "mousedown",
    enabled = true,
    ignoreRefs = [],
    ignoreSelector,
  } = options;

  // Store callback in ref to avoid recreating event listener
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const handleClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;

      // Check if click is inside the main ref
      if (ref.current?.contains(target)) {
        return;
      }

      // Check if click is inside any ignore refs
      for (const ignoreRef of ignoreRefs) {
        if (ignoreRef.current?.contains(target)) {
          return;
        }
      }

      // Check if click is on element matching ignore selector
      if (ignoreSelector && target instanceof Element) {
        if (target.closest(ignoreSelector)) {
          return;
        }
      }

      callbackRef.current(event);
    };

    // Add event listener
    document.addEventListener(eventType, handleClick as EventListener);

    return () => {
      document.removeEventListener(eventType, handleClick as EventListener);
    };
  }, [ref, enabled, eventType, ignoreRefs, ignoreSelector]);
}

/**
 * Hook that returns a callback ref instead of taking one
 * Useful when you need to create the ref inside the hook
 */
export function useClickOutsideCallback<T extends HTMLElement>(
  callback: (event: MouseEvent | TouchEvent) => void,
  options: ClickOutsideOptions = {}
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useClickOutside(ref, callback, options);
  return ref;
}

/**
 * Hook for multiple refs (e.g., dropdown trigger + menu)
 */
export function useClickOutsideMultiple(
  refs: React.RefObject<HTMLElement | null>[],
  callback: (event: MouseEvent | TouchEvent) => void,
  options: Omit<ClickOutsideOptions, "ignoreRefs"> = {}
): void {
  const {
    eventType = "mousedown",
    enabled = true,
    ignoreSelector,
  } = options;

  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const handleClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;

      // Check if click is inside any of the refs
      for (const ref of refs) {
        if (ref.current?.contains(target)) {
          return;
        }
      }

      // Check ignore selector
      if (ignoreSelector && target instanceof Element) {
        if (target.closest(ignoreSelector)) {
          return;
        }
      }

      callbackRef.current(event);
    };

    document.addEventListener(eventType, handleClick as EventListener);

    return () => {
      document.removeEventListener(eventType, handleClick as EventListener);
    };
  }, [refs, enabled, eventType, ignoreSelector]);
}

/**
 * Hook specifically for Escape key + click outside
 * Common pattern for dropdowns and modals
 */
export function useDismissible<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onDismiss: () => void,
  options: ClickOutsideOptions & { closeOnEscape?: boolean } = {}
): void {
  const { closeOnEscape = true, ...clickOptions } = options;

  // Handle click outside
  useClickOutside(ref, onDismiss, clickOptions);

  // Handle escape key
  useEffect(() => {
    if (!closeOnEscape || !clickOptions.enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEscape, clickOptions.enabled, onDismiss]);
}

/**
 * Hook that tracks whether mouse/touch is currently outside the element
 */
export function useIsOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>
): boolean {
  const [isOutside, setIsOutside] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleEnter = () => setIsOutside(false);
    const handleLeave = () => setIsOutside(true);

    element.addEventListener("mouseenter", handleEnter);
    element.addEventListener("mouseleave", handleLeave);
    element.addEventListener("touchstart", handleEnter);
    element.addEventListener("touchend", handleLeave);

    return () => {
      element.removeEventListener("mouseenter", handleEnter);
      element.removeEventListener("mouseleave", handleLeave);
      element.removeEventListener("touchstart", handleEnter);
      element.removeEventListener("touchend", handleLeave);
    };
  }, [ref]);

  return isOutside;
}

// Need to import useState for useIsOutside
import { useState } from "react";
