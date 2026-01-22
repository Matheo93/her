"use client";

/**
 * useFrameRate - FPS Monitoring and Adaptive Performance
 *
 * Monitors frame rate and provides adaptive performance adjustments.
 * Useful for automatically reducing animation complexity when FPS drops.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface FrameRateResult {
  // Current FPS (smoothed)
  fps: number;

  // Average FPS over sample period
  averageFps: number;

  // Whether FPS is below target
  isLowFps: boolean;

  // Whether performance is degraded
  isPerformanceDegraded: boolean;

  // Frame time in ms
  frameTime: number;

  // Dropped frames count
  droppedFrames: number;

  // Start monitoring
  start: () => void;

  // Stop monitoring
  stop: () => void;

  // Is currently monitoring
  isMonitoring: boolean;

  // Reset statistics
  reset: () => void;
}

interface UseFrameRateOptions {
  // Target FPS (default: 60)
  targetFps?: number;

  // Sample window size for averaging (default: 60 frames)
  sampleSize?: number;

  // Threshold for "low FPS" (default: 0.8 of target)
  lowFpsThreshold?: number;

  // Auto-start monitoring (default: false)
  autoStart?: boolean;

  // Callback when FPS drops below threshold
  onLowFps?: (fps: number) => void;

  // Callback when FPS recovers
  onRecovery?: (fps: number) => void;
}

export function useFrameRate(options: UseFrameRateOptions = {}): FrameRateResult {
  const {
    targetFps = 60,
    sampleSize = 60,
    lowFpsThreshold = 0.8,
    autoStart = false,
    onLowFps,
    onRecovery,
  } = options;

  const [fps, setFps] = useState(60);
  const [averageFps, setAverageFps] = useState(60);
  const [frameTime, setFrameTime] = useState(16.67);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [isMonitoring, setIsMonitoring] = useState(autoStart);

  const frameTimesRef = useRef<number[]>([]);
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const wasLowFpsRef = useRef(false);

  const lowFpsTarget = targetFps * lowFpsThreshold;

  // Calculate FPS from frame times
  const calculateFps = useCallback((times: number[]): number => {
    if (times.length < 2) return 60;
    const avgFrameTime = times.reduce((a, b) => a + b, 0) / times.length;
    return Math.round(1000 / avgFrameTime);
  }, []);

  // Main monitoring loop
  const tick = useCallback(
    (timestamp: number) => {
      if (!isMonitoring) return;

      if (lastTimeRef.current > 0) {
        const delta = timestamp - lastTimeRef.current;

        // Add to samples
        frameTimesRef.current.push(delta);
        if (frameTimesRef.current.length > sampleSize) {
          frameTimesRef.current.shift();
        }

        // Update frame time
        setFrameTime(delta);

        // Calculate current FPS (smoothed over last 10 frames)
        const recentTimes = frameTimesRef.current.slice(-10);
        const currentFps = calculateFps(recentTimes);
        setFps(currentFps);

        // Calculate average FPS
        const avgFps = calculateFps(frameTimesRef.current);
        setAverageFps(avgFps);

        // Count dropped frames (frames taking > 2x target frame time)
        const targetFrameTime = 1000 / targetFps;
        if (delta > targetFrameTime * 2) {
          setDroppedFrames((prev) => prev + Math.floor(delta / targetFrameTime) - 1);
        }

        // Trigger callbacks
        const isCurrentlyLow = currentFps < lowFpsTarget;
        if (isCurrentlyLow && !wasLowFpsRef.current) {
          onLowFps?.(currentFps);
        } else if (!isCurrentlyLow && wasLowFpsRef.current) {
          onRecovery?.(currentFps);
        }
        wasLowFpsRef.current = isCurrentlyLow;
      }

      lastTimeRef.current = timestamp;
      rafRef.current = requestAnimationFrame(tick);
    },
    [isMonitoring, sampleSize, calculateFps, targetFps, lowFpsTarget, onLowFps, onRecovery]
  );

  // Start monitoring
  const start = useCallback(() => {
    setIsMonitoring(true);
    lastTimeRef.current = 0;
    frameTimesRef.current = [];
    wasLowFpsRef.current = false;
  }, []);

  // Stop monitoring
  const stop = useCallback(() => {
    setIsMonitoring(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
  }, []);

  // Reset statistics
  const reset = useCallback(() => {
    frameTimesRef.current = [];
    setFps(60);
    setAverageFps(60);
    setFrameTime(16.67);
    setDroppedFrames(0);
    wasLowFpsRef.current = false;
  }, []);

  // Effect to run/stop monitoring loop
  useEffect(() => {
    if (isMonitoring) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isMonitoring, tick]);

  const isLowFps = fps < lowFpsTarget;
  const isPerformanceDegraded = averageFps < lowFpsTarget || droppedFrames > 10;

  return {
    fps,
    averageFps,
    isLowFps,
    isPerformanceDegraded,
    frameTime,
    droppedFrames,
    start,
    stop,
    isMonitoring,
    reset,
  };
}

/**
 * Hook that automatically adjusts a quality level based on FPS
 */
export function useAdaptiveQuality(options: {
  initialQuality?: number;
  minQuality?: number;
  maxQuality?: number;
  targetFps?: number;
  adjustmentStep?: number;
} = {}): {
  quality: number;
  isAdapting: boolean;
  fps: number;
} {
  const {
    initialQuality = 1,
    minQuality = 0.3,
    maxQuality = 1,
    targetFps = 55,
    adjustmentStep = 0.1,
  } = options;

  const [quality, setQuality] = useState(initialQuality);
  const [isAdapting, setIsAdapting] = useState(false);
  const adjustmentTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { fps, averageFps, start, isMonitoring } = useFrameRate({
    targetFps: 60,
    autoStart: true,
    onLowFps: (currentFps) => {
      // Reduce quality when FPS drops
      setIsAdapting(true);
      setQuality((prev) => Math.max(minQuality, prev - adjustmentStep));

      // Clear any pending recovery
      if (adjustmentTimeoutRef.current) {
        clearTimeout(adjustmentTimeoutRef.current);
      }
    },
    onRecovery: (currentFps) => {
      // Gradually increase quality after sustained good FPS
      adjustmentTimeoutRef.current = setTimeout(() => {
        if (currentFps >= targetFps) {
          setQuality((prev) => Math.min(maxQuality, prev + adjustmentStep * 0.5));
        }
        setIsAdapting(false);
      }, 2000);
    },
  });

  // Start monitoring on mount
  useEffect(() => {
    if (!isMonitoring) {
      start();
    }
  }, [isMonitoring, start]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (adjustmentTimeoutRef.current) {
        clearTimeout(adjustmentTimeoutRef.current);
      }
    };
  }, []);

  return { quality, isAdapting, fps };
}

/**
 * Hook to throttle updates based on frame rate
 */
export function useFrameThrottle<T>(
  value: T,
  targetFps: number = 30
): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdateRef = useRef<number>(0);
  const frameInterval = 1000 / targetFps;

  useEffect(() => {
    const now = performance.now();
    if (now - lastUpdateRef.current >= frameInterval) {
      setThrottledValue(value);
      lastUpdateRef.current = now;
    }
  }, [value, frameInterval]);

  return throttledValue;
}
