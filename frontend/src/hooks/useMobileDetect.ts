"use client";

/**
 * useMobileDetect - Mobile Device Detection
 *
 * Detects mobile devices and provides responsive breakpoint info.
 * Uses both user agent and screen size for accurate detection.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useState, useEffect, useCallback, useRef } from "react";

// Pre-compiled regex patterns for O(1) lookup (Sprint 531)
const IOS_REGEX = /iphone|ipad|ipod/;
const ANDROID_REGEX = /android/;

interface MobileDetectResult {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  screenWidth: number;
  orientation: "portrait" | "landscape";
}

export function useMobileDetect(): MobileDetectResult {
  const [state, setState] = useState<MobileDetectResult>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouchDevice: false,
    isIOS: false,
    isAndroid: false,
    screenWidth: 1024,
    orientation: "landscape",
  });

  const detectDevice = useCallback(() => {
    if (typeof window === "undefined") return;

    const ua = navigator.userAgent.toLowerCase();
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // User agent detection (using pre-compiled regex - Sprint 531)
    const isIOS = IOS_REGEX.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = ANDROID_REGEX.test(ua);
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    // Breakpoint-based detection
    const isMobile = screenWidth < 640; // sm breakpoint
    const isTablet = screenWidth >= 640 && screenWidth < 1024; // md-lg breakpoint
    const isDesktop = screenWidth >= 1024;

    // Orientation
    const orientation = screenWidth > screenHeight ? "landscape" : "portrait";

    setState({
      isMobile,
      isTablet,
      isDesktop,
      isTouchDevice,
      isIOS,
      isAndroid,
      screenWidth,
      orientation,
    });
  }, []);

  // Debounce ref to avoid excessive re-renders during resize
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedDetect = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(detectDevice, 100);
  }, [detectDevice]);

  useEffect(() => {
    detectDevice();

    // Listen for resize (debounced) and orientation changes (immediate)
    window.addEventListener("resize", debouncedDetect);
    window.addEventListener("orientationchange", detectDevice);

    return () => {
      window.removeEventListener("resize", debouncedDetect);
      window.removeEventListener("orientationchange", detectDevice);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [detectDevice, debouncedDetect]);

  return state;
}

/**
 * Simple hook for mobile-only check
 */
export function useIsMobile(): boolean {
  const { isMobile } = useMobileDetect();
  return isMobile;
}

/**
 * Hook to check if touch device
 */
export function useIsTouchDevice(): boolean {
  const { isTouchDevice } = useMobileDetect();
  return isTouchDevice;
}

/**
 * Hook to get current orientation
 */
export function useOrientation(): "portrait" | "landscape" {
  const { orientation } = useMobileDetect();
  return orientation;
}

/**
 * Hook to get current breakpoint
 */
export function useBreakpoint(): "mobile" | "tablet" | "desktop" {
  const { isMobile, isTablet } = useMobileDetect();
  if (isMobile) return "mobile";
  if (isTablet) return "tablet";
  return "desktop";
}
