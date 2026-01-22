"use client";

/**
 * useConnectionSpeed - Network Latency & Speed Detection
 *
 * Measures actual network latency by pinging endpoints.
 * Provides adaptive quality settings based on connection speed.
 *
 * Sprint 226: Mobile latency improvements
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNetworkStatus } from "./useNetworkStatus";

interface ConnectionSpeedResult {
  // Measured latency in ms
  latency: number | null;

  // Connection quality rating
  quality: "excellent" | "good" | "fair" | "poor" | "offline";

  // Estimated bandwidth in Mbps
  bandwidth: number | null;

  // Is currently measuring
  isMeasuring: boolean;

  // Last measurement timestamp
  lastMeasuredAt: number | null;

  // Trigger a new measurement
  measure: () => Promise<void>;

  // Adaptive settings based on connection
  settings: AdaptiveSettings;
}

interface AdaptiveSettings {
  // Recommended animation duration multiplier
  animationSpeed: number;

  // Whether to preload content
  shouldPreload: boolean;

  // Image quality to request
  imageQuality: "high" | "medium" | "low";

  // Video quality to request
  videoQuality: "1080p" | "720p" | "480p" | "360p";

  // Polling/refresh interval in ms
  pollingInterval: number;

  // Should use reduced data mode
  reducedDataMode: boolean;

  // Debounce delay for network requests
  requestDebounce: number;
}

const DEFAULT_SETTINGS: AdaptiveSettings = {
  animationSpeed: 1,
  shouldPreload: true,
  imageQuality: "high",
  videoQuality: "720p",
  pollingInterval: 30000,
  reducedDataMode: false,
  requestDebounce: 0,
};

export function useConnectionSpeed(
  pingUrl?: string,
  measureIntervalMs: number = 60000
): ConnectionSpeedResult {
  const network = useNetworkStatus();
  const [latency, setLatency] = useState<number | null>(null);
  const [bandwidth, setBandwidth] = useState<number | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [lastMeasuredAt, setLastMeasuredAt] = useState<number | null>(null);
  const measureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Measure latency by timing a small request
  const measureLatency = useCallback(async (): Promise<number | null> => {
    const url = pingUrl || "/api/health";

    // Cancel any ongoing measurement
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const measurements: number[] = [];

      // Take 3 measurements and average
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        const response = await fetch(url, {
          method: "HEAD",
          cache: "no-store",
          signal: abortControllerRef.current.signal,
        });

        if (response.ok) {
          const end = performance.now();
          measurements.push(end - start);
        }

        // Small delay between measurements
        await new Promise((r) => setTimeout(r, 100));
      }

      if (measurements.length > 0) {
        // Remove outliers and average
        measurements.sort((a, b) => a - b);
        const trimmed = measurements.slice(0, Math.ceil(measurements.length * 0.8));
        return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
      }

      return null;
    } catch {
      return null;
    }
  }, [pingUrl]);

  // Full measurement including bandwidth estimate
  const measure = useCallback(async () => {
    if (!network.isOnline || isMeasuring) return;

    setIsMeasuring(true);

    try {
      // Measure latency
      const measuredLatency = await measureLatency();
      setLatency(measuredLatency);

      // Use Network Information API for bandwidth if available
      if (network.downlink !== null) {
        setBandwidth(network.downlink);
      }

      setLastMeasuredAt(Date.now());
    } finally {
      setIsMeasuring(false);
    }
  }, [network.isOnline, network.downlink, isMeasuring, measureLatency]);

  // Initial measurement and periodic updates
  useEffect(() => {
    // Initial measurement after a short delay
    const initialTimeout = setTimeout(() => {
      measure();
    }, 1000);

    // Periodic measurements
    measureIntervalRef.current = setInterval(measure, measureIntervalMs);

    return () => {
      clearTimeout(initialTimeout);
      if (measureIntervalRef.current) {
        clearInterval(measureIntervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [measure, measureIntervalMs]);

  // Re-measure when coming back online
  useEffect(() => {
    if (network.isOnline && network.wasOffline) {
      measure();
    }
  }, [network.isOnline, network.wasOffline, measure]);

  // Calculate quality rating
  const quality = useCallback((): ConnectionSpeedResult["quality"] => {
    if (!network.isOnline) return "offline";

    const lat = latency ?? (network.rtt ?? 500);
    const bw = bandwidth ?? (network.downlink ?? 1);

    if (lat < 50 && bw > 10) return "excellent";
    if (lat < 100 && bw > 5) return "good";
    if (lat < 200 && bw > 2) return "fair";
    return "poor";
  }, [network.isOnline, network.rtt, network.downlink, latency, bandwidth])();

  // Calculate adaptive settings based on connection quality
  const settings = useCallback((): AdaptiveSettings => {
    if (!network.isOnline) {
      return {
        ...DEFAULT_SETTINGS,
        shouldPreload: false,
        reducedDataMode: true,
        pollingInterval: 0,
      };
    }

    switch (quality) {
      case "excellent":
        return {
          animationSpeed: 1,
          shouldPreload: true,
          imageQuality: "high",
          videoQuality: "1080p",
          pollingInterval: 15000,
          reducedDataMode: false,
          requestDebounce: 0,
        };

      case "good":
        return {
          animationSpeed: 1,
          shouldPreload: true,
          imageQuality: "high",
          videoQuality: "720p",
          pollingInterval: 30000,
          reducedDataMode: false,
          requestDebounce: 100,
        };

      case "fair":
        return {
          animationSpeed: 1.2,
          shouldPreload: false,
          imageQuality: "medium",
          videoQuality: "480p",
          pollingInterval: 60000,
          reducedDataMode: true,
          requestDebounce: 200,
        };

      case "poor":
        return {
          animationSpeed: 1.5,
          shouldPreload: false,
          imageQuality: "low",
          videoQuality: "360p",
          pollingInterval: 120000,
          reducedDataMode: true,
          requestDebounce: 300,
        };

      default:
        return DEFAULT_SETTINGS;
    }
  }, [network.isOnline, quality])();

  return {
    latency,
    quality,
    bandwidth,
    isMeasuring,
    lastMeasuredAt,
    measure,
    settings,
  };
}

/**
 * Hook to get adaptive animation speed
 */
export function useAdaptiveAnimationSpeed(): number {
  const { settings } = useConnectionSpeed();
  return settings.animationSpeed;
}

/**
 * Hook to check if should use reduced data mode
 */
export function useReducedDataMode(): boolean {
  const { settings } = useConnectionSpeed();
  return settings.reducedDataMode;
}

/**
 * Hook to get recommended image quality
 */
export function useImageQuality(): "high" | "medium" | "low" {
  const { settings } = useConnectionSpeed();
  return settings.imageQuality;
}
