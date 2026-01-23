/**
 * useMobileWakeLock - Screen wake lock management for mobile devices
 *
 * Sprint 1590 - Prevents screen from sleeping during active conversations
 * with intelligent battery-aware management.
 *
 * Features:
 * - Screen Wake Lock API integration
 * - Automatic release on visibility change
 * - Battery-aware wake lock management
 * - Activity-based lock duration
 * - Fallback for unsupported browsers
 * - Usage tracking and metrics
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Wake lock states
export type WakeLockState =
  | "released" // No wake lock
  | "requesting" // Requesting wake lock
  | "active" // Wake lock is active
  | "paused" // Temporarily paused (e.g., tab hidden)
  | "denied" // Permission denied or unsupported
  | "error"; // Error occurred

export type WakeLockReason =
  | "conversation" // Active conversation
  | "media_playback" // Audio/video playing
  | "user_activity" // User interaction
  | "download" // Active download
  | "custom"; // Custom reason

export interface WakeLockSession {
  id: string;
  reason: WakeLockReason;
  startTime: number;
  endTime: number | null;
  duration: number;
  batteryAtStart: number | null;
  batteryAtEnd: number | null;
}

export interface WakeLockStatus {
  state: WakeLockState;
  isSupported: boolean;
  isActive: boolean;
  currentReason: WakeLockReason | null;
  activeSession: WakeLockSession | null;
  lastError: string | null;
  visibility: "visible" | "hidden";
}

export interface WakeLockMetrics {
  totalSessions: number;
  totalActiveTime: number;
  averageSessionDuration: number;
  deniedCount: number;
  errorCount: number;
  batteryUsed: number;
  reacquisitions: number;
}

export interface WakeLockConfig {
  enabled: boolean;
  autoRelease: boolean; // Auto-release after inactivity
  inactivityTimeoutMs: number; // Timeout before auto-release
  batteryThreshold: number; // Release if battery below this (0-1)
  reacquireOnVisible: boolean; // Re-acquire when tab becomes visible
  maxSessionDurationMs: number; // Max session duration (0 = unlimited)
}

export interface WakeLockControls {
  acquire: (reason?: WakeLockReason) => Promise<boolean>;
  release: () => Promise<void>;
  extendSession: (additionalMs: number) => void;
  reportActivity: () => void;
  updateConfig: (config: Partial<WakeLockConfig>) => void;
  checkSupport: () => boolean;
}

export interface UseMobileWakeLockResult {
  status: WakeLockStatus;
  metrics: WakeLockMetrics;
  controls: WakeLockControls;
  config: WakeLockConfig;
}

const DEFAULT_CONFIG: WakeLockConfig = {
  enabled: true,
  autoRelease: true,
  inactivityTimeoutMs: 300000, // 5 minutes
  batteryThreshold: 0.1, // 10%
  reacquireOnVisible: true,
  maxSessionDurationMs: 0, // Unlimited
};

function generateId(): string {
  return `wake-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useMobileWakeLock(
  initialConfig: Partial<WakeLockConfig> = {}
): UseMobileWakeLockResult {
  const [config, setConfig] = useState<WakeLockConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [status, setStatus] = useState<WakeLockStatus>({
    state: "released",
    isSupported: false,
    isActive: false,
    currentReason: null,
    activeSession: null,
    lastError: null,
    visibility: "visible",
  });

  const [metrics, setMetrics] = useState<WakeLockMetrics>({
    totalSessions: 0,
    totalActiveTime: 0,
    averageSessionDuration: 0,
    deniedCount: 0,
    errorCount: 0,
    batteryUsed: 0,
    reacquisitions: 0,
  });

  // Refs
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const sessionRef = useRef<WakeLockSession | null>(null);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const pendingReacquireRef = useRef<WakeLockReason | null>(null);
  const sessionsHistoryRef = useRef<WakeLockSession[]>([]);

  // Check API support
  const checkSupport = useCallback((): boolean => {
    return "wakeLock" in navigator;
  }, []);

  // Initialize support check
  useEffect(() => {
    const supported = checkSupport();
    setStatus((prev) => ({ ...prev, isSupported: supported }));

    if (!supported) {
      setStatus((prev) => ({
        ...prev,
        state: "denied",
        lastError: "Wake Lock API not supported",
      }));
    }
  }, [checkSupport]);

  // Get current battery level
  const getBatteryLevel = useCallback(async (): Promise<number | null> => {
    try {
      // @ts-ignore - Battery API
      const battery = await navigator.getBattery?.();
      return battery?.level ?? null;
    } catch {
      return null;
    }
  }, []);

  // End current session
  const endSession = useCallback(async () => {
    if (sessionRef.current) {
      const session = sessionRef.current;
      session.endTime = Date.now();
      session.duration = session.endTime - session.startTime;
      session.batteryAtEnd = await getBatteryLevel();

      sessionsHistoryRef.current.push(session);

      // Update metrics
      setMetrics((prev) => {
        const totalSessions = prev.totalSessions + 1;
        const totalActiveTime = prev.totalActiveTime + session.duration;
        const batteryUsed =
          session.batteryAtStart !== null && session.batteryAtEnd !== null
            ? prev.batteryUsed + (session.batteryAtStart - session.batteryAtEnd)
            : prev.batteryUsed;

        return {
          ...prev,
          totalSessions,
          totalActiveTime,
          averageSessionDuration: totalActiveTime / totalSessions,
          batteryUsed,
        };
      });

      sessionRef.current = null;
    }
  }, [getBatteryLevel]);

  // Acquire wake lock
  const acquire = useCallback(
    async (reason: WakeLockReason = "conversation"): Promise<boolean> => {
      if (!config.enabled || !status.isSupported) {
        return false;
      }

      // Check battery threshold
      const batteryLevel = await getBatteryLevel();
      if (batteryLevel !== null && batteryLevel < config.batteryThreshold) {
        setStatus((prev) => ({
          ...prev,
          lastError: "Battery too low for wake lock",
        }));
        return false;
      }

      setStatus((prev) => ({ ...prev, state: "requesting" }));

      try {
        // Release existing lock first
        if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          await endSession();
        }

        // Request new wake lock
        wakeLockRef.current = await navigator.wakeLock.request("screen");

        // Create session
        sessionRef.current = {
          id: generateId(),
          reason,
          startTime: Date.now(),
          endTime: null,
          duration: 0,
          batteryAtStart: batteryLevel,
          batteryAtEnd: null,
        };

        // Handle release event
        wakeLockRef.current.addEventListener("release", () => {
          setStatus((prev) => ({
            ...prev,
            state: "released",
            isActive: false,
            currentReason: null,
            activeSession: null,
          }));
          endSession();
        });

        // Set up auto-release timeout
        if (config.autoRelease && config.inactivityTimeoutMs > 0) {
          resetInactivityTimeout();
        }

        // Set up max duration timeout
        if (config.maxSessionDurationMs > 0) {
          maxDurationTimeoutRef.current = setTimeout(() => {
            release();
          }, config.maxSessionDurationMs);
        }

        lastActivityRef.current = Date.now();

        setStatus((prev) => ({
          ...prev,
          state: "active",
          isActive: true,
          currentReason: reason,
          activeSession: sessionRef.current,
          lastError: null,
        }));

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        const isDenied = message.includes("denied") || message.includes("NotAllowedError");

        setStatus((prev) => ({
          ...prev,
          state: isDenied ? "denied" : "error",
          lastError: message,
        }));

        setMetrics((prev) => ({
          ...prev,
          [isDenied ? "deniedCount" : "errorCount"]:
            prev[isDenied ? "deniedCount" : "errorCount"] + 1,
        }));

        return false;
      }
    },
    [config, status.isSupported, getBatteryLevel, endSession]
  );

  // Release wake lock
  const release = useCallback(async () => {
    // Clear timeouts
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        // Ignore errors on release
      }
    }

    await endSession();

    setStatus((prev) => ({
      ...prev,
      state: "released",
      isActive: false,
      currentReason: null,
      activeSession: null,
    }));
  }, [endSession]);

  // Reset inactivity timeout
  const resetInactivityTimeout = useCallback(() => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }

    if (config.autoRelease && config.inactivityTimeoutMs > 0) {
      inactivityTimeoutRef.current = setTimeout(() => {
        release();
      }, config.inactivityTimeoutMs);
    }
  }, [config.autoRelease, config.inactivityTimeoutMs, release]);

  // Extend session
  const extendSession = useCallback(
    (additionalMs: number) => {
      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
      }

      if (config.maxSessionDurationMs > 0) {
        maxDurationTimeoutRef.current = setTimeout(() => {
          release();
        }, config.maxSessionDurationMs + additionalMs);
      }

      resetInactivityTimeout();
    },
    [config.maxSessionDurationMs, release, resetInactivityTimeout]
  );

  // Report activity
  const reportActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    resetInactivityTimeout();
  }, [resetInactivityTimeout]);

  // Update config
  const updateConfig = useCallback((updates: Partial<WakeLockConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      const isVisible = document.visibilityState === "visible";

      setStatus((prev) => ({
        ...prev,
        visibility: isVisible ? "visible" : "hidden",
      }));

      if (!isVisible) {
        // Tab hidden - wake lock is automatically released by browser
        if (status.isActive && status.currentReason) {
          pendingReacquireRef.current = status.currentReason;
          setStatus((prev) => ({ ...prev, state: "paused" }));
        }
      } else if (isVisible && pendingReacquireRef.current) {
        // Tab visible - reacquire if configured
        if (config.reacquireOnVisible) {
          const reason = pendingReacquireRef.current;
          pendingReacquireRef.current = null;

          const success = await acquire(reason);
          if (success) {
            setMetrics((prev) => ({
              ...prev,
              reacquisitions: prev.reacquisitions + 1,
            }));
          }
        } else {
          pendingReacquireRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [status.isActive, status.currentReason, config.reacquireOnVisible, acquire]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
      }
    };
  }, []);

  const controls: WakeLockControls = useMemo(
    () => ({
      acquire,
      release,
      extendSession,
      reportActivity,
      updateConfig,
      checkSupport,
    }),
    [acquire, release, extendSession, reportActivity, updateConfig, checkSupport]
  );

  return {
    status,
    metrics,
    controls,
    config,
  };
}

// Sub-hook: Simple wake lock toggle
export function useSimpleWakeLock(): {
  isActive: boolean;
  isSupported: boolean;
  acquire: () => Promise<boolean>;
  release: () => Promise<void>;
} {
  const { status, controls } = useMobileWakeLock();

  return {
    isActive: status.isActive,
    isSupported: status.isSupported,
    acquire: () => controls.acquire(),
    release: controls.release,
  };
}

// Sub-hook: Conversation wake lock
export function useConversationWakeLock(
  isConversationActive: boolean
): UseMobileWakeLockResult {
  const result = useMobileWakeLock();

  useEffect(() => {
    if (isConversationActive && !result.status.isActive) {
      result.controls.acquire("conversation");
    } else if (!isConversationActive && result.status.isActive) {
      result.controls.release();
    }
  }, [isConversationActive, result.status.isActive, result.controls]);

  return result;
}

export default useMobileWakeLock;
