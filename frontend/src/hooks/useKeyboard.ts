"use client";

/**
 * useKeyboard - Mobile Keyboard Detection
 *
 * Detects when the virtual keyboard is open on mobile devices.
 * Useful for adjusting layout when keyboard appears.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useState, useEffect, useCallback } from "react";

interface KeyboardState {
  isOpen: boolean;
  height: number;
  viewportHeight: number;
}

export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({
    isOpen: false,
    height: 0,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : 0,
  });

  const handleResize = useCallback(() => {
    if (typeof window === "undefined") return;

    const visualViewport = window.visualViewport;

    if (visualViewport) {
      // Modern approach using Visual Viewport API
      const viewportHeight = visualViewport.height;
      const windowHeight = window.innerHeight;
      const keyboardHeight = windowHeight - viewportHeight;
      const isOpen = keyboardHeight > 100; // Threshold to detect keyboard

      setState({
        isOpen,
        height: isOpen ? keyboardHeight : 0,
        viewportHeight: viewportHeight,
      });
    } else {
      // Fallback for older browsers
      setState({
        isOpen: false,
        height: 0,
        viewportHeight: window.innerHeight,
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const visualViewport = window.visualViewport;

    if (visualViewport) {
      visualViewport.addEventListener("resize", handleResize);
      visualViewport.addEventListener("scroll", handleResize);
    }

    // Also listen for focus events on inputs
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        // Delay to let keyboard appear
        setTimeout(handleResize, 300);
      }
    };

    const handleBlur = () => {
      setTimeout(handleResize, 100);
    };

    document.addEventListener("focusin", handleFocus);
    document.addEventListener("focusout", handleBlur);

    // Initial check
    handleResize();

    return () => {
      if (visualViewport) {
        visualViewport.removeEventListener("resize", handleResize);
        visualViewport.removeEventListener("scroll", handleResize);
      }
      document.removeEventListener("focusin", handleFocus);
      document.removeEventListener("focusout", handleBlur);
    };
  }, [handleResize]);

  return state;
}

/**
 * Hook to get window dimensions with resize tracking
 */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial size

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return size;
}

/**
 * Hook to track scroll position
 */
export function useScrollPosition(): { x: number; y: number; isScrolling: boolean } {
  const [state, setState] = useState({
    x: 0,
    y: 0,
    isScrolling: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      setState({
        x: window.scrollX,
        y: window.scrollY,
        isScrolling: true,
      });

      // Reset isScrolling after scroll stops
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setState((prev) => ({ ...prev, isScrolling: false }));
      }, 150);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial position

    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  return state;
}

/**
 * Hook to detect if element is in viewport
 */
export function useInView(
  ref: React.RefObject<HTMLElement>,
  options?: IntersectionObserverInit
): boolean {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.1, ...options }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, options]);

  return isInView;
}
