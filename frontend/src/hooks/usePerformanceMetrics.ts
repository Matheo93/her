"use client";

/**
 * usePerformanceMetrics - Real-time Performance Tracking
 *
 * Tracks key performance indicators for the EVA interface:
 * - WebSocket latency
 * - Audio playback metrics
 * - Time to first response
 * - Frame rate estimation
 * - Memory usage
 *
 * Only active in development mode.
 *
 * Sprint 135: Performance monitoring
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface PerformanceMetrics {
  // Latency
  wsLatency: number | null; // WebSocket round-trip ms
  avgWsLatency: number | null;
  minWsLatency: number | null;
  maxWsLatency: number | null;

  // Response times
  timeToFirstByte: number | null;
  timeToFirstAudio: number | null;
  avgResponseTime: number | null;

  // Audio
  audioQueueDepth: number;
  audioPlaybackGaps: number;
  audioBufferHealth: "healthy" | "warning" | "critical";

  // System
  estimatedFps: number;
  memoryUsageMB: number | null;

  // Session
  sessionDuration: number; // seconds
  messagesExchanged: number;
  errorsCount: number;
}

export interface PerformanceMetricsResult {
  metrics: PerformanceMetrics;
  // Recording methods
  recordLatency: (latencyMs: number) => void;
  recordResponseTime: (responseMs: number) => void;
  recordAudioGap: () => void;
  recordError: () => void;
  recordMessage: () => void;
  // Control
  reset: () => void;
  isEnabled: boolean;
}

const LATENCY_HISTORY_SIZE = 50;
const RESPONSE_HISTORY_SIZE = 20;

function getDefaultMetrics(): PerformanceMetrics {
  return {
    wsLatency: null,
    avgWsLatency: null,
    minWsLatency: null,
    maxWsLatency: null,
    timeToFirstByte: null,
    timeToFirstAudio: null,
    avgResponseTime: null,
    audioQueueDepth: 0,
    audioPlaybackGaps: 0,
    audioBufferHealth: "healthy",
    estimatedFps: 60,
    memoryUsageMB: null,
    sessionDuration: 0,
    messagesExchanged: 0,
    errorsCount: 0,
  };
}

export function usePerformanceMetrics(): PerformanceMetricsResult {
  const isEnabled = process.env.NODE_ENV === "development";

  const [metrics, setMetrics] = useState<PerformanceMetrics>(getDefaultMetrics());

  // History for calculations
  const latencyHistory = useRef<number[]>([]);
  const responseHistory = useRef<number[]>([]);
  const sessionStartTime = useRef(Date.now());
  const lastFrameTime = useRef(Date.now());
  const frameCount = useRef(0);
  const animationRef = useRef<number | null>(null);

  // Record latency
  const recordLatency = useCallback((latencyMs: number) => {
    if (!isEnabled) return;

    latencyHistory.current.push(latencyMs);
    if (latencyHistory.current.length > LATENCY_HISTORY_SIZE) {
      latencyHistory.current.shift();
    }

    const history = latencyHistory.current;
    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    const min = Math.min(...history);
    const max = Math.max(...history);

    setMetrics((prev) => ({
      ...prev,
      wsLatency: latencyMs,
      avgWsLatency: Math.round(avg),
      minWsLatency: min,
      maxWsLatency: max,
    }));
  }, [isEnabled]);

  // Record response time
  const recordResponseTime = useCallback((responseMs: number) => {
    if (!isEnabled) return;

    responseHistory.current.push(responseMs);
    if (responseHistory.current.length > RESPONSE_HISTORY_SIZE) {
      responseHistory.current.shift();
    }

    const history = responseHistory.current;
    const avg = history.reduce((a, b) => a + b, 0) / history.length;

    setMetrics((prev) => ({
      ...prev,
      timeToFirstAudio: responseMs,
      avgResponseTime: Math.round(avg),
    }));
  }, [isEnabled]);

  // Record audio gap
  const recordAudioGap = useCallback(() => {
    if (!isEnabled) return;

    setMetrics((prev) => ({
      ...prev,
      audioPlaybackGaps: prev.audioPlaybackGaps + 1,
      audioBufferHealth:
        prev.audioPlaybackGaps + 1 > 5
          ? "critical"
          : prev.audioPlaybackGaps + 1 > 2
            ? "warning"
            : "healthy",
    }));
  }, [isEnabled]);

  // Record error
  const recordError = useCallback(() => {
    if (!isEnabled) return;

    setMetrics((prev) => ({
      ...prev,
      errorsCount: prev.errorsCount + 1,
    }));
  }, [isEnabled]);

  // Record message
  const recordMessage = useCallback(() => {
    if (!isEnabled) return;

    setMetrics((prev) => ({
      ...prev,
      messagesExchanged: prev.messagesExchanged + 1,
    }));
  }, [isEnabled]);

  // Reset metrics
  const reset = useCallback(() => {
    latencyHistory.current = [];
    responseHistory.current = [];
    sessionStartTime.current = Date.now();
    setMetrics(getDefaultMetrics());
  }, []);

  // FPS and memory tracking
  useEffect(() => {
    if (!isEnabled) return;

    const updateMetrics = () => {
      const now = Date.now();
      frameCount.current++;

      // Calculate FPS every second
      if (now - lastFrameTime.current >= 1000) {
        const fps = frameCount.current;
        frameCount.current = 0;
        lastFrameTime.current = now;

        // Get memory if available
        let memoryMB: number | null = null;
        if ("memory" in performance) {
          const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
          if (memory) {
            memoryMB = Math.round(memory.usedJSHeapSize / (1024 * 1024));
          }
        }

        setMetrics((prev) => ({
          ...prev,
          estimatedFps: fps,
          memoryUsageMB: memoryMB,
          sessionDuration: Math.round((now - sessionStartTime.current) / 1000),
        }));
      }

      animationRef.current = requestAnimationFrame(updateMetrics);
    };

    animationRef.current = requestAnimationFrame(updateMetrics);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isEnabled]);

  return {
    metrics,
    recordLatency,
    recordResponseTime,
    recordAudioGap,
    recordError,
    recordMessage,
    reset,
    isEnabled,
  };
}

/**
 * Format metrics for display
 */
export function formatMetricsDisplay(metrics: PerformanceMetrics): string[] {
  const lines: string[] = [];

  if (metrics.wsLatency !== null) {
    lines.push(`WS: ${metrics.wsLatency}ms (avg: ${metrics.avgWsLatency}ms)`);
  }

  if (metrics.avgResponseTime !== null) {
    lines.push(`Response: ${metrics.avgResponseTime}ms avg`);
  }

  lines.push(`FPS: ${metrics.estimatedFps}`);

  if (metrics.memoryUsageMB !== null) {
    lines.push(`Memory: ${metrics.memoryUsageMB}MB`);
  }

  lines.push(`Session: ${Math.floor(metrics.sessionDuration / 60)}m ${metrics.sessionDuration % 60}s`);
  lines.push(`Messages: ${metrics.messagesExchanged}`);

  if (metrics.errorsCount > 0) {
    lines.push(`Errors: ${metrics.errorsCount}`);
  }

  if (metrics.audioPlaybackGaps > 0) {
    lines.push(`Audio gaps: ${metrics.audioPlaybackGaps}`);
  }

  return lines;
}
