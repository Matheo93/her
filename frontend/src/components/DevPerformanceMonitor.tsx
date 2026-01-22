"use client";

/**
 * DevPerformanceMonitor - Development-only Performance Dashboard
 *
 * Shows real-time performance metrics in a collapsible panel.
 * Only renders in development mode.
 *
 * Sprint 135: Performance monitoring
 */

import { useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PerformanceMetrics } from "@/hooks/usePerformanceMetrics";

interface DevPerformanceMonitorProps {
  metrics: PerformanceMetrics;
  colors: {
    coral: string;
    cream: string;
    earth: string;
    warmWhite: string;
    softShadow: string;
  };
}

function DevPerformanceMonitorComponent({ metrics, colors }: DevPerformanceMonitorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Only render in development
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const getStatusColor = (value: number, thresholds: { good: number; warn: number }) => {
    if (value <= thresholds.good) return "#4ade80"; // green
    if (value <= thresholds.warn) return "#fbbf24"; // yellow
    return "#f87171"; // red
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {/* Toggle button */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono"
        style={{
          backgroundColor: `${colors.cream}95`,
          color: colors.earth,
          boxShadow: `0 2px 8px ${colors.softShadow}40`,
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: metrics.audioBufferHealth === "healthy"
              ? "#4ade80"
              : metrics.audioBufferHealth === "warning"
                ? "#fbbf24"
                : "#f87171",
          }}
        />
        <span>PERF</span>
        <span style={{ opacity: 0.6 }}>{isExpanded ? "▼" : "▲"}</span>
      </motion.button>

      {/* Expanded panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="absolute bottom-10 left-0 p-3 rounded-lg font-mono text-xs"
            style={{
              backgroundColor: `${colors.cream}98`,
              color: colors.earth,
              boxShadow: `0 4px 12px ${colors.softShadow}40`,
              minWidth: 200,
            }}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <div className="space-y-2">
              {/* Session */}
              <div className="flex justify-between">
                <span style={{ opacity: 0.6 }}>Session</span>
                <span>{formatTime(metrics.sessionDuration)}</span>
              </div>

              {/* Latency */}
              {metrics.wsLatency !== null && (
                <div className="flex justify-between">
                  <span style={{ opacity: 0.6 }}>WS Latency</span>
                  <span style={{ color: getStatusColor(metrics.wsLatency, { good: 100, warn: 300 }) }}>
                    {metrics.wsLatency}ms
                  </span>
                </div>
              )}

              {/* Avg Latency */}
              {metrics.avgWsLatency !== null && (
                <div className="flex justify-between text-[10px]" style={{ opacity: 0.7 }}>
                  <span>  (avg/min/max)</span>
                  <span>{metrics.avgWsLatency}/{metrics.minWsLatency}/{metrics.maxWsLatency}ms</span>
                </div>
              )}

              {/* Response time */}
              {metrics.avgResponseTime !== null && (
                <div className="flex justify-between">
                  <span style={{ opacity: 0.6 }}>Response</span>
                  <span style={{ color: getStatusColor(metrics.avgResponseTime, { good: 500, warn: 1000 }) }}>
                    {metrics.avgResponseTime}ms avg
                  </span>
                </div>
              )}

              {/* FPS */}
              <div className="flex justify-between">
                <span style={{ opacity: 0.6 }}>FPS</span>
                <span style={{ color: getStatusColor(60 - metrics.estimatedFps, { good: 5, warn: 15 }) }}>
                  {metrics.estimatedFps}
                </span>
              </div>

              {/* Memory */}
              {metrics.memoryUsageMB !== null && (
                <div className="flex justify-between">
                  <span style={{ opacity: 0.6 }}>Memory</span>
                  <span style={{ color: getStatusColor(metrics.memoryUsageMB, { good: 100, warn: 200 }) }}>
                    {metrics.memoryUsageMB}MB
                  </span>
                </div>
              )}

              {/* Divider */}
              <div className="border-t" style={{ borderColor: `${colors.softShadow}40` }} />

              {/* Messages */}
              <div className="flex justify-between">
                <span style={{ opacity: 0.6 }}>Messages</span>
                <span>{metrics.messagesExchanged}</span>
              </div>

              {/* Audio health */}
              <div className="flex justify-between">
                <span style={{ opacity: 0.6 }}>Audio</span>
                <span style={{
                  color: metrics.audioBufferHealth === "healthy"
                    ? "#4ade80"
                    : metrics.audioBufferHealth === "warning"
                      ? "#fbbf24"
                      : "#f87171",
                }}>
                  {metrics.audioBufferHealth}
                  {metrics.audioPlaybackGaps > 0 && ` (${metrics.audioPlaybackGaps} gaps)`}
                </span>
              </div>

              {/* Errors */}
              {metrics.errorsCount > 0 && (
                <div className="flex justify-between">
                  <span style={{ opacity: 0.6 }}>Errors</span>
                  <span style={{ color: "#f87171" }}>{metrics.errorsCount}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const DevPerformanceMonitor = memo(DevPerformanceMonitorComponent);
