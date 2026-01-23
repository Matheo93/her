"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Mobile Optimization Hook - Sprint 514
 *
 * Detects device capabilities and provides optimized settings
 * for avatar animations and UX on mobile devices.
 *
 * Key optimizations:
 * - Reduced animation complexity on low-end devices
 * - Adaptive frame rates based on device performance
 * - Memory-efficient particle systems
 * - Network-aware WebSocket reconnection
 */

export interface DeviceCapabilities {
  isMobile: boolean;
  isLowEndDevice: boolean;
  hasReducedMotion: boolean;
  connectionType: "slow" | "medium" | "fast";
  pixelRatio: number;
  memoryEstimate: "low" | "medium" | "high";
  touchCapable: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

export interface AnimationSettings {
  // Frame rate targets
  targetFPS: number;
  particleCount: number;

  // Animation complexity
  enableParticles: boolean;
  enableGlowEffects: boolean;
  enableBreathingAnimation: boolean;
  enableIdleAnimations: boolean;
  enableBlurEffects: boolean;

  // Quality settings
  avatarQuality: "low" | "medium" | "high";
  transitionDuration: number;
  springStiffness: number;
  springDamping: number;
}

export interface WebSocketSettings {
  reconnectDelay: number;
  reconnectMaxDelay: number;
  pingInterval: number;
  connectionTimeout: number;
  enableBackoff: boolean;
}

interface MobileOptimizationReturn {
  device: DeviceCapabilities;
  animations: AnimationSettings;
  websocket: WebSocketSettings;
  isReady: boolean;

  // Methods
  measurePerformance: () => Promise<number>;
  updateConnectionType: () => void;
}

// Detect network connection type
function getConnectionType(): "slow" | "medium" | "fast" {
  if (typeof navigator === "undefined") return "medium";

  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
  };

  const conn = nav.connection;
  if (!conn) return "medium";

  // Data saver mode = treat as slow
  if (conn.saveData) return "slow";

  // effectiveType: slow-2g, 2g, 3g, 4g
  const effectiveType = conn.effectiveType;
  if (effectiveType === "slow-2g" || effectiveType === "2g") return "slow";
  if (effectiveType === "3g") return "medium";
  if (effectiveType === "4g") return "fast";

  // Fallback to RTT/downlink
  if (conn.rtt && conn.rtt > 400) return "slow";
  if (conn.rtt && conn.rtt > 150) return "medium";
  if (conn.downlink && conn.downlink < 1.5) return "slow";
  if (conn.downlink && conn.downlink < 5) return "medium";

  return "fast";
}

// Estimate device memory tier
function getMemoryEstimate(): "low" | "medium" | "high" {
  if (typeof navigator === "undefined") return "medium";

  const nav = navigator as Navigator & {
    deviceMemory?: number;
  };

  const memory = nav.deviceMemory;
  if (!memory) return "medium";

  if (memory <= 2) return "low";
  if (memory <= 4) return "medium";
  return "high";
}

// Detect if device is mobile
function detectMobile(): boolean {
  if (typeof window === "undefined") return false;

  // Check for touch capability
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  // Check viewport width
  const isNarrow = window.innerWidth < 768;

  // Check user agent
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  return (hasTouch && isNarrow) || mobileUA;
}

// Detect if device is low-end (based on various heuristics)
function detectLowEndDevice(): boolean {
  if (typeof window === "undefined") return false;

  const nav = navigator as Navigator & {
    hardwareConcurrency?: number;
    deviceMemory?: number;
  };

  // Low core count
  const cores = nav.hardwareConcurrency;
  if (cores && cores <= 2) return true;

  // Low memory
  const memory = nav.deviceMemory;
  if (memory && memory <= 2) return true;

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return true;

  return false;
}

// Get optimal animation settings based on device
function getAnimationSettings(
  device: DeviceCapabilities
): AnimationSettings {
  // High-end desktop
  if (!device.isMobile && !device.isLowEndDevice && device.memoryEstimate === "high") {
    return {
      targetFPS: 60,
      particleCount: 15,
      enableParticles: true,
      enableGlowEffects: true,
      enableBreathingAnimation: true,
      enableIdleAnimations: true,
      enableBlurEffects: true,
      avatarQuality: "high",
      transitionDuration: 0.3,
      springStiffness: 120,
      springDamping: 14,
    };
  }

  // Mid-tier or mobile with good connection
  if (device.connectionType === "fast" && device.memoryEstimate !== "low") {
    return {
      targetFPS: 30,
      particleCount: 8,
      enableParticles: true,
      enableGlowEffects: true,
      enableBreathingAnimation: true,
      enableIdleAnimations: true,
      enableBlurEffects: false, // Blur is expensive on mobile
      avatarQuality: "medium",
      transitionDuration: 0.25,
      springStiffness: 100,
      springDamping: 16,
    };
  }

  // Low-end device or slow connection
  if (device.isLowEndDevice || device.connectionType === "slow" || device.memoryEstimate === "low") {
    return {
      targetFPS: 24,
      particleCount: 3,
      enableParticles: false,
      enableGlowEffects: false,
      enableBreathingAnimation: true, // Keep minimal breathing
      enableIdleAnimations: false,
      enableBlurEffects: false,
      avatarQuality: "low",
      transitionDuration: 0.15,
      springStiffness: 80,
      springDamping: 20,
    };
  }

  // Reduced motion preference
  if (device.hasReducedMotion) {
    return {
      targetFPS: 24,
      particleCount: 0,
      enableParticles: false,
      enableGlowEffects: false,
      enableBreathingAnimation: false,
      enableIdleAnimations: false,
      enableBlurEffects: false,
      avatarQuality: "medium",
      transitionDuration: 0.1,
      springStiffness: 200,
      springDamping: 30,
    };
  }

  // Default: mobile with medium capability
  return {
    targetFPS: 30,
    particleCount: 5,
    enableParticles: true,
    enableGlowEffects: true,
    enableBreathingAnimation: true,
    enableIdleAnimations: false,
    enableBlurEffects: false,
    avatarQuality: "medium",
    transitionDuration: 0.2,
    springStiffness: 100,
    springDamping: 18,
  };
}

// Get optimal WebSocket settings based on device and connection
function getWebSocketSettings(
  device: DeviceCapabilities
): WebSocketSettings {
  // Slow connection - aggressive reconnection with backoff
  if (device.connectionType === "slow") {
    return {
      reconnectDelay: 2000,
      reconnectMaxDelay: 30000,
      pingInterval: 20000, // Less frequent pings to save bandwidth
      connectionTimeout: 15000,
      enableBackoff: true,
    };
  }

  // Mobile with medium connection
  if (device.isMobile && device.connectionType === "medium") {
    return {
      reconnectDelay: 1500,
      reconnectMaxDelay: 20000,
      pingInterval: 15000,
      connectionTimeout: 10000,
      enableBackoff: true,
    };
  }

  // Fast connection (desktop or mobile 4G/5G)
  if (device.connectionType === "fast") {
    return {
      reconnectDelay: 1000,
      reconnectMaxDelay: 10000,
      pingInterval: 10000,
      connectionTimeout: 8000,
      enableBackoff: true,
    };
  }

  // Default
  return {
    reconnectDelay: 1500,
    reconnectMaxDelay: 15000,
    pingInterval: 12000,
    connectionTimeout: 10000,
    enableBackoff: true,
  };
}

export function useMobileOptimization(): MobileOptimizationReturn {
  const [isReady, setIsReady] = useState(false);
  const [device, setDevice] = useState<DeviceCapabilities>({
    isMobile: false,
    isLowEndDevice: false,
    hasReducedMotion: false,
    connectionType: "medium",
    pixelRatio: 1,
    memoryEstimate: "medium",
    touchCapable: false,
    viewportWidth: 1920,
    viewportHeight: 1080,
  });

  const performanceRef = useRef<number | null>(null);

  // Initialize device detection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateDeviceInfo = () => {
      const isMobile = detectMobile();
      const isLowEndDevice = detectLowEndDevice();
      const hasReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const connectionType = getConnectionType();
      const pixelRatio = window.devicePixelRatio || 1;
      const memoryEstimate = getMemoryEstimate();
      const touchCapable = "ontouchstart" in window || navigator.maxTouchPoints > 0;

      setDevice({
        isMobile,
        isLowEndDevice,
        hasReducedMotion,
        connectionType,
        pixelRatio,
        memoryEstimate,
        touchCapable,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });

      setIsReady(true);
    };

    updateDeviceInfo();

    // Listen for changes
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionChange = () => updateDeviceInfo();
    mediaQuery.addEventListener("change", handleMotionChange);

    window.addEventListener("resize", updateDeviceInfo);
    window.addEventListener("orientationchange", updateDeviceInfo);

    // Listen for connection changes
    const nav = navigator as Navigator & {
      connection?: EventTarget & {
        addEventListener: (type: string, handler: () => void) => void;
        removeEventListener: (type: string, handler: () => void) => void;
      };
    };

    if (nav.connection) {
      nav.connection.addEventListener("change", updateDeviceInfo);
    }

    return () => {
      mediaQuery.removeEventListener("change", handleMotionChange);
      window.removeEventListener("resize", updateDeviceInfo);
      window.removeEventListener("orientationchange", updateDeviceInfo);

      if (nav.connection) {
        nav.connection.removeEventListener("change", updateDeviceInfo);
      }
    };
  }, []);

  // Measure actual performance (frame time benchmark)
  const measurePerformance = useCallback(async (): Promise<number> => {
    if (performanceRef.current !== null) {
      return performanceRef.current;
    }

    return new Promise((resolve) => {
      let frameCount = 0;
      const startTime = performance.now();
      const targetFrames = 30;

      const measure = () => {
        frameCount++;
        if (frameCount < targetFrames) {
          requestAnimationFrame(measure);
        } else {
          const elapsed = performance.now() - startTime;
          const avgFrameTime = elapsed / targetFrames;
          const estimatedFPS = 1000 / avgFrameTime;

          performanceRef.current = estimatedFPS;
          resolve(estimatedFPS);
        }
      };

      requestAnimationFrame(measure);
    });
  }, []);

  // Update connection type manually (useful after network changes)
  const updateConnectionType = useCallback(() => {
    setDevice((prev) => ({
      ...prev,
      connectionType: getConnectionType(),
    }));
  }, []);

  const animations = getAnimationSettings(device);
  const websocket = getWebSocketSettings(device);

  return {
    device,
    animations,
    websocket,
    isReady,
    measurePerformance,
    updateConnectionType,
  };
}

export default useMobileOptimization;
