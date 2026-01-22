"use client";

/**
 * useWakeLock - Screen Wake Lock API Hook
 *
 * Prevents screen from sleeping during video calls or active sessions.
 * Essential for avatar interactions where user needs continuous display.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useVisibility } from "./useVisibility";

interface WakeLockState {
  // Whether wake lock is currently active
  isActive: boolean;

  // Whether wake lock is supported
  isSupported: boolean;

  // Any error that occurred
  error: string | null;

  // Request wake lock
  request: () => Promise<boolean>;

  // Release wake lock
  release: () => Promise<void>;

  // Toggle wake lock
  toggle: () => Promise<boolean>;
}

interface UseWakeLockOptions {
  // Auto-request wake lock on mount
  autoRequest?: boolean;

  // Re-acquire lock when page becomes visible again
  reacquireOnVisibility?: boolean;

  // Callback when lock is acquired
  onAcquire?: () => void;

  // Callback when lock is released
  onRelease?: () => void;

  // Callback on error
  onError?: (error: Error) => void;
}

// Type for the Wake Lock API
type WakeLockSentinel = {
  readonly released: boolean;
  readonly type: "screen";
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
  removeEventListener(type: "release", listener: () => void): void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request(type: "screen"): Promise<WakeLockSentinel>;
  };
};

export function useWakeLock(options: UseWakeLockOptions = {}): WakeLockState {
  const {
    autoRequest = false,
    reacquireOnVisibility = true,
    onAcquire,
    onRelease,
    onError,
  } = options;

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wasActiveBeforeHiddenRef = useRef(false);

  const { isVisible } = useVisibility();

  // Check if Wake Lock API is supported
  const isSupported =
    typeof navigator !== "undefined" &&
    "wakeLock" in navigator &&
    typeof (navigator as NavigatorWithWakeLock).wakeLock?.request === "function";

  // Request wake lock
  const request = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError("Wake Lock API not supported");
      onError?.(new Error("Wake Lock API not supported"));
      return false;
    }

    // Already have an active lock
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      return true;
    }

    try {
      const nav = navigator as NavigatorWithWakeLock;
      const sentinel = await nav.wakeLock!.request("screen");

      wakeLockRef.current = sentinel;
      setIsActive(true);
      setError(null);
      onAcquire?.();

      // Listen for release events (e.g., tab switch, minimize)
      sentinel.addEventListener("release", () => {
        wakeLockRef.current = null;
        setIsActive(false);
        onRelease?.();
      });

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to acquire wake lock";
      setError(errorMessage);
      setIsActive(false);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
      return false;
    }
  }, [isSupported, onAcquire, onRelease, onError]);

  // Release wake lock
  const release = useCallback(async (): Promise<void> => {
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setIsActive(false);
        onRelease?.();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to release wake lock";
        setError(errorMessage);
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      }
    }
  }, [onRelease, onError]);

  // Toggle wake lock
  const toggle = useCallback(async (): Promise<boolean> => {
    if (isActive) {
      await release();
      return false;
    } else {
      return request();
    }
  }, [isActive, request, release]);

  // Auto-request on mount if configured
  useEffect(() => {
    if (autoRequest && isSupported) {
      request();
    }

    return () => {
      // Release on unmount
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        wakeLockRef.current.release().catch(() => {
          // Ignore release errors on unmount
        });
      }
    };
  }, [autoRequest, isSupported]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    if (!reacquireOnVisibility) return;

    if (!isVisible) {
      // Page becoming hidden - remember if we had an active lock
      wasActiveBeforeHiddenRef.current = isActive;
    } else if (wasActiveBeforeHiddenRef.current) {
      // Page becoming visible and we had a lock before
      request();
      wasActiveBeforeHiddenRef.current = false;
    }
  }, [isVisible, reacquireOnVisibility, isActive, request]);

  return {
    isActive,
    isSupported,
    error,
    request,
    release,
    toggle,
  };
}

/**
 * Simple hook that auto-requests wake lock when active
 */
export function useAutoWakeLock(active: boolean = true): {
  isActive: boolean;
  isSupported: boolean;
} {
  const { isActive, isSupported, request, release } = useWakeLock({
    reacquireOnVisibility: true,
  });

  useEffect(() => {
    if (active) {
      request();
    } else {
      release();
    }
  }, [active, request, release]);

  return { isActive, isSupported };
}

/**
 * Hook for video call scenarios - prevents sleep during calls
 */
export function useCallWakeLock(isInCall: boolean): {
  isActive: boolean;
  isSupported: boolean;
  error: string | null;
} {
  const { isActive, isSupported, error, request, release } = useWakeLock({
    reacquireOnVisibility: true,
    onAcquire: () => {
      console.debug("[WakeLock] Acquired for call");
    },
    onRelease: () => {
      console.debug("[WakeLock] Released");
    },
  });

  useEffect(() => {
    if (isInCall) {
      request();
    } else {
      release();
    }
  }, [isInCall, request, release]);

  return { isActive, isSupported, error };
}

/**
 * Hook that combines wake lock with battery awareness
 */
export function useBatteryAwareWakeLock(
  active: boolean,
  options: {
    disableOnLowBattery?: boolean;
    lowBatteryThreshold?: number;
  } = {}
): {
  isActive: boolean;
  isSupported: boolean;
  isBatteryLow: boolean;
} {
  const { disableOnLowBattery = true, lowBatteryThreshold = 0.15 } = options;

  const [isBatteryLow, setIsBatteryLow] = useState(false);
  const { isActive, isSupported, request, release } = useWakeLock({
    reacquireOnVisibility: true,
  });

  // Monitor battery
  useEffect(() => {
    if (typeof navigator === "undefined") return;

    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (event: string, handler: () => void) => void;
        removeEventListener: (event: string, handler: () => void) => void;
      }>;
    };

    if (nav.getBattery) {
      nav.getBattery().then((battery) => {
        const updateBattery = () => {
          const isLow = battery.level < lowBatteryThreshold && !battery.charging;
          setIsBatteryLow(isLow);
        };

        updateBattery();
        battery.addEventListener("levelchange", updateBattery);
        battery.addEventListener("chargingchange", updateBattery);

        return () => {
          battery.removeEventListener("levelchange", updateBattery);
          battery.removeEventListener("chargingchange", updateBattery);
        };
      });
    }
  }, [lowBatteryThreshold]);

  // Manage wake lock based on active state and battery
  useEffect(() => {
    const shouldBeActive = active && !(disableOnLowBattery && isBatteryLow);

    if (shouldBeActive) {
      request();
    } else {
      release();
    }
  }, [active, disableOnLowBattery, isBatteryLow, request, release]);

  return { isActive, isSupported, isBatteryLow };
}
