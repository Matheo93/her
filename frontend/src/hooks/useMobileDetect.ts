"use client";

/**
 * useMobileDetect - Mobile Device Detection
 *
 * Detects mobile devices and provides responsive breakpoint info.
 * Uses both user agent and screen size for accurate detection.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useState, useEffect, useCallback } from "react";

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

    // User agent detection
    const isIOS = /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /android/.test(ua);
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

  useEffect(() => {
    detectDevice();

    // Listen for resize and orientation changes
    window.addEventListener("resize", detectDevice);
    window.addEventListener("orientationchange", detectDevice);

    return () => {
      window.removeEventListener("resize", detectDevice);
      window.removeEventListener("orientationchange", detectDevice);
    };
  }, [detectDevice]);

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
