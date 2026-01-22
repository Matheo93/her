"use client";

/**
 * useConnectionAwareStreaming - Connection-Aware WebSocket Streaming Optimization
 *
 * Provides intelligent WebSocket management with adaptive reconnection,
 * ping intervals, and data transmission strategies based on network conditions.
 *
 * Sprint 440: Avatar UX and mobile latency improvements
 *
 * Key features:
 * - Exponential backoff with jitter for reconnection
 * - Adaptive ping intervals based on connection quality
 * - Connection quality monitoring from actual WebSocket RTT
 * - Idle timeout handling for battery conservation
 * - Automatic quality degradation on poor connections
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMobileDetect } from "./useMobileDetect";
import { useNetworkStatus } from "./useNetworkStatus";
import { useVisibility } from "./useVisibility";

// Connection states
type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "failed";

// Quality tiers for streaming
type StreamingQuality = "high" | "medium" | "low" | "minimal";

interface ConnectionMetrics {
  // Current connection state
  state: ConnectionState;

  // WebSocket RTT measured via ping-pong (ms)
  websocketRtt: number;

  // Average RTT over time (ms)
  averageRtt: number;

  // RTT jitter (standard deviation)
  jitterMs: number;

  // Connection uptime (ms)
  uptimeMs: number;

  // Number of reconnection attempts
  reconnectAttempts: number;

  // Messages sent this session
  messagesSent: number;

  // Messages received this session
  messagesReceived: number;

  // Bytes sent this session
  bytesSent: number;

  // Bytes received this session
  bytesReceived: number;

  // Last ping timestamp
  lastPingTime: number;

  // Connection quality score (0-100)
  qualityScore: number;
}

interface StreamingConfig {
  // Ping interval (ms) - adapts to connection quality
  pingIntervalMs: number;

  // Reconnection base delay (ms)
  reconnectBaseDelayMs: number;

  // Maximum reconnection delay (ms)
  reconnectMaxDelayMs: number;

  // Maximum reconnection attempts before failing
  maxReconnectAttempts: number;

  // Idle timeout before reducing activity (ms)
  idleTimeoutMs: number;

  // Message batching window (ms) - 0 to disable
  batchWindowMs: number;

  // Enable compression for messages
  enableCompression: boolean;

  // Maximum message size (bytes)
  maxMessageSize: number;

  // Buffer size limit (number of queued messages)
  maxQueueSize: number;
}

interface StreamingControls {
  // Connect to WebSocket
  connect: (url: string, protocols?: string | string[]) => void;

  // Disconnect
  disconnect: () => void;

  // Send message (queued if batching enabled)
  send: (data: string | ArrayBuffer) => boolean;

  // Force flush queued messages
  flushQueue: () => void;

  // Manually trigger ping
  ping: () => void;

  // Reset metrics
  resetMetrics: () => void;

  // Force reconnect
  forceReconnect: () => void;

  // Set custom config
  setConfig: (config: Partial<StreamingConfig>) => void;
}

interface ConnectionAwareStreamingResult {
  // Current streaming quality level
  quality: StreamingQuality;

  // Connection metrics
  metrics: ConnectionMetrics;

  // Streaming configuration
  config: StreamingConfig;

  // Control functions
  controls: StreamingControls;

  // WebSocket instance (if connected)
  socket: WebSocket | null;

  // Flags
  isConnected: boolean;
  isMobile: boolean;
  shouldReduceActivity: boolean;
  isIdle: boolean;
}

interface UseConnectionAwareStreamingOptions {
  // WebSocket URL (optional, can be set via connect())
  url?: string;

  // WebSocket protocols
  protocols?: string | string[];

  // Auto-connect on mount
  autoConnect?: boolean;

  // Auto-reconnect on disconnect
  autoReconnect?: boolean;

  // Callbacks
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (event: MessageEvent) => void;
  onReconnect?: (attempt: number) => void;
  onQualityChange?: (quality: StreamingQuality) => void;
}

// Quality-based configurations
const QUALITY_CONFIGS: Record<StreamingQuality, Partial<StreamingConfig>> = {
  high: {
    pingIntervalMs: 5000,
    reconnectBaseDelayMs: 500,
    reconnectMaxDelayMs: 10000,
    maxReconnectAttempts: 10,
    idleTimeoutMs: 300000, // 5 minutes
    batchWindowMs: 0, // No batching
    enableCompression: false,
    maxMessageSize: 1024 * 1024, // 1MB
    maxQueueSize: 100,
  },
  medium: {
    pingIntervalMs: 10000,
    reconnectBaseDelayMs: 1000,
    reconnectMaxDelayMs: 30000,
    maxReconnectAttempts: 8,
    idleTimeoutMs: 180000, // 3 minutes
    batchWindowMs: 50,
    enableCompression: true,
    maxMessageSize: 512 * 1024, // 512KB
    maxQueueSize: 50,
  },
  low: {
    pingIntervalMs: 20000,
    reconnectBaseDelayMs: 2000,
    reconnectMaxDelayMs: 60000,
    maxReconnectAttempts: 5,
    idleTimeoutMs: 120000, // 2 minutes
    batchWindowMs: 100,
    enableCompression: true,
    maxMessageSize: 256 * 1024, // 256KB
    maxQueueSize: 25,
  },
  minimal: {
    pingIntervalMs: 30000,
    reconnectBaseDelayMs: 3000,
    reconnectMaxDelayMs: 120000, // 2 minutes
    maxReconnectAttempts: 3,
    idleTimeoutMs: 60000, // 1 minute
    batchWindowMs: 200,
    enableCompression: true,
    maxMessageSize: 128 * 1024, // 128KB
    maxQueueSize: 10,
  },
};

const DEFAULT_CONFIG: StreamingConfig = QUALITY_CONFIGS.medium as StreamingConfig;

export function useConnectionAwareStreaming(
  options: UseConnectionAwareStreamingOptions = {}
): ConnectionAwareStreamingResult {
  const {
    url: initialUrl,
    protocols,
    autoConnect = false,
    autoReconnect = true,
    onOpen,
    onClose,
    onError,
    onMessage,
    onReconnect,
    onQualityChange,
  } = options;

  // Core hooks
  const { isMobile, isTablet } = useMobileDetect();
  const { isOnline, isSlowConnection, effectiveType, saveData } = useNetworkStatus();
  const visibility = useVisibility();

  // State
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [config, setConfigState] = useState<StreamingConfig>(DEFAULT_CONFIG);

  // Metrics state
  const [websocketRtt, setWebsocketRtt] = useState(100);
  const [rttSamples, setRttSamples] = useState<number[]>([]);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [messagesSent, setMessagesSent] = useState(0);
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [bytesSent, setBytesSent] = useState(0);
  const [bytesReceived, setBytesReceived] = useState(0);
  const [lastPingTime, setLastPingTime] = useState(0);
  const [connectionStartTime, setConnectionStartTime] = useState(0);

  // Refs
  const socketRef = useRef<WebSocket | null>(null);
  const urlRef = useRef<string | undefined>(initialUrl);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pingStartRef = useRef<number>(0);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageQueueRef = useRef<(string | ArrayBuffer)[]>([]);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const prevQualityRef = useRef<StreamingQuality | null>(null);

  // Calculate streaming quality based on conditions
  const calculatedQuality = useMemo((): StreamingQuality => {
    // Base quality from device type
    let quality: StreamingQuality = isMobile || isTablet ? "medium" : "high";

    // Downgrade for network conditions
    if (!isOnline) {
      return "minimal";
    }

    if (isSlowConnection || effectiveType === "2g" || effectiveType === "slow-2g") {
      quality = "minimal";
    } else if (effectiveType === "3g") {
      quality = quality === "high" ? "low" : "minimal";
    }

    // Downgrade for data saver
    if (saveData) {
      quality = quality === "high" ? "medium" : quality === "medium" ? "low" : "minimal";
    }

    // Downgrade for poor WebSocket RTT
    const avgRtt = rttSamples.length > 0
      ? rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length
      : websocketRtt;

    if (avgRtt > 500) {
      quality = "minimal";
    } else if (avgRtt > 200) {
      quality = quality === "high" ? "low" : quality === "medium" ? "low" : quality;
    }

    // Downgrade when page is hidden
    if (!visibility.isVisible) {
      quality = "minimal";
    }

    return quality;
  }, [
    isMobile,
    isTablet,
    isOnline,
    isSlowConnection,
    effectiveType,
    saveData,
    websocketRtt,
    rttSamples,
    visibility.isVisible,
  ]);

  // Notify on quality change
  useEffect(() => {
    if (prevQualityRef.current !== null && prevQualityRef.current !== calculatedQuality) {
      onQualityChange?.(calculatedQuality);
    }
    prevQualityRef.current = calculatedQuality;
  }, [calculatedQuality, onQualityChange]);

  // Update config when quality changes
  useEffect(() => {
    const qualityConfig = QUALITY_CONFIGS[calculatedQuality];
    setConfigState((prev) => ({ ...prev, ...qualityConfig }));
  }, [calculatedQuality]);

  // Calculate metrics
  const metrics = useMemo((): ConnectionMetrics => {
    const avgRtt = rttSamples.length > 0
      ? rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length
      : websocketRtt;

    const jitterMs = rttSamples.length > 1
      ? Math.sqrt(
          rttSamples
            .map((s) => Math.pow(s - avgRtt, 2))
            .reduce((a, b) => a + b, 0) / rttSamples.length
        )
      : 0;

    // Quality score based on RTT and jitter
    let qualityScore = 100;
    if (avgRtt > 50) qualityScore -= Math.min(30, (avgRtt - 50) / 5);
    if (jitterMs > 20) qualityScore -= Math.min(20, (jitterMs - 20) / 2);
    if (reconnectAttempts > 0) qualityScore -= Math.min(30, reconnectAttempts * 10);
    qualityScore = Math.max(0, Math.min(100, qualityScore));

    return {
      state: connectionState,
      websocketRtt,
      averageRtt: avgRtt,
      jitterMs,
      uptimeMs: connectionState === "connected" ? Date.now() - connectionStartTime : 0,
      reconnectAttempts,
      messagesSent,
      messagesReceived,
      bytesSent,
      bytesReceived,
      lastPingTime,
      qualityScore,
    };
  }, [
    connectionState,
    websocketRtt,
    rttSamples,
    connectionStartTime,
    reconnectAttempts,
    messagesSent,
    messagesReceived,
    bytesSent,
    bytesReceived,
    lastPingTime,
  ]);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
  }, []);

  // Calculate reconnect delay with exponential backoff and jitter
  const getReconnectDelay = useCallback((attempt: number): number => {
    const exponentialDelay = config.reconnectBaseDelayMs * Math.pow(2, attempt);
    const cappedDelay = Math.min(exponentialDelay, config.reconnectMaxDelayMs);
    // Add jitter (0-25% of delay)
    const jitter = cappedDelay * Math.random() * 0.25;
    return cappedDelay + jitter;
  }, [config.reconnectBaseDelayMs, config.reconnectMaxDelayMs]);

  // Start ping interval
  const startPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    pingIntervalRef.current = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        pingStartRef.current = performance.now();
        setLastPingTime(Date.now());

        // Send ping message (server should respond with pong)
        try {
          socketRef.current.send(JSON.stringify({ type: "ping", timestamp: pingStartRef.current }));
        } catch {
          // Ignore ping errors
        }
      }
    }, config.pingIntervalMs);
  }, [config.pingIntervalMs]);

  // Handle incoming ping/pong messages
  const handlePingPong = useCallback((data: unknown) => {
    if (typeof data === "object" && data !== null) {
      const msg = data as { type?: string; timestamp?: number };
      if (msg.type === "pong" && pingStartRef.current > 0) {
        const rtt = performance.now() - pingStartRef.current;
        setWebsocketRtt(rtt);
        setRttSamples((prev) => {
          const newSamples = [...prev, rtt];
          if (newSamples.length > 20) {
            return newSamples.slice(-20);
          }
          return newSamples;
        });
        pingStartRef.current = 0;
        return true;
      }
    }
    return false;
  }, []);

  // Connect to WebSocket
  const connect = useCallback((url: string, wsProtocols?: string | string[]) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    urlRef.current = url;
    clearTimers();
    setConnectionState("connecting");

    try {
      const ws = new WebSocket(url, wsProtocols || protocols);

      ws.onopen = (event) => {
        setConnectionState("connected");
        setConnectionStartTime(Date.now());
        setReconnectAttempts(0);
        socketRef.current = ws;
        setSocket(ws);
        startPingInterval();
        onOpen?.(event);

        // Flush any queued messages
        if (messageQueueRef.current.length > 0) {
          const queue = [...messageQueueRef.current];
          messageQueueRef.current = [];
          queue.forEach((msg) => {
            try {
              ws.send(msg);
            } catch {
              // Re-queue failed messages
              messageQueueRef.current.push(msg);
            }
          });
        }
      };

      ws.onclose = (event) => {
        setConnectionState("disconnected");
        clearTimers();
        socketRef.current = null;
        setSocket(null);
        onClose?.(event);

        // Auto-reconnect if enabled and not a clean close
        if (autoReconnect && !event.wasClean && isOnline) {
          const attempts = reconnectAttempts + 1;
          if (attempts <= config.maxReconnectAttempts) {
            setReconnectAttempts(attempts);
            setConnectionState("reconnecting");
            onReconnect?.(attempts);

            const delay = getReconnectDelay(attempts);
            reconnectTimeoutRef.current = setTimeout(() => {
              connect(url, wsProtocols);
            }, delay);
          } else {
            setConnectionState("failed");
          }
        }
      };

      ws.onerror = (event) => {
        onError?.(event);
      };

      ws.onmessage = (event) => {
        lastActivityRef.current = Date.now();
        setMessagesReceived((c) => c + 1);

        // Track bytes received
        if (typeof event.data === "string") {
          setBytesReceived((c) => c + event.data.length);
        } else if (event.data instanceof ArrayBuffer) {
          setBytesReceived((c) => c + event.data.byteLength);
        }

        // Handle ping/pong
        try {
          const parsed = JSON.parse(event.data);
          if (handlePingPong(parsed)) {
            return; // Was a pong message
          }
        } catch {
          // Not JSON, pass through
        }

        onMessage?.(event);
      };
    } catch (error) {
      setConnectionState("failed");
    }
  }, [
    protocols,
    clearTimers,
    startPingInterval,
    onOpen,
    onClose,
    onError,
    onMessage,
    onReconnect,
    autoReconnect,
    isOnline,
    reconnectAttempts,
    config.maxReconnectAttempts,
    getReconnectDelay,
    handlePingPong,
  ]);

  // Disconnect
  const disconnect = useCallback(() => {
    clearTimers();
    if (socketRef.current) {
      socketRef.current.close(1000, "Client disconnect");
      socketRef.current = null;
      setSocket(null);
    }
    setConnectionState("disconnected");
    messageQueueRef.current = [];
  }, [clearTimers]);

  // Send message
  const send = useCallback((data: string | ArrayBuffer): boolean => {
    lastActivityRef.current = Date.now();

    // Check message size
    const size = typeof data === "string" ? data.length : data.byteLength;
    if (size > config.maxMessageSize) {
      console.warn("[ConnectionAwareStreaming] Message exceeds max size");
      return false;
    }

    // If batching is enabled and socket is open, queue message
    if (config.batchWindowMs > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
      if (messageQueueRef.current.length >= config.maxQueueSize) {
        console.warn("[ConnectionAwareStreaming] Message queue full");
        return false;
      }

      messageQueueRef.current.push(data);

      // Set batch timeout if not already set
      if (!batchTimeoutRef.current) {
        batchTimeoutRef.current = setTimeout(() => {
          batchTimeoutRef.current = null;
          flushQueue();
        }, config.batchWindowMs);
      }

      return true;
    }

    // Send immediately
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(data);
        setMessagesSent((c) => c + 1);
        setBytesSent((c) => c + size);
        return true;
      } catch {
        // Queue for later
        if (messageQueueRef.current.length < config.maxQueueSize) {
          messageQueueRef.current.push(data);
        }
        return false;
      }
    }

    // Queue for when connected
    if (messageQueueRef.current.length < config.maxQueueSize) {
      messageQueueRef.current.push(data);
    }
    return false;
  }, [config.batchWindowMs, config.maxMessageSize, config.maxQueueSize]);

  // Flush message queue
  const flushQueue = useCallback(() => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    const queue = [...messageQueueRef.current];
    messageQueueRef.current = [];

    let totalBytes = 0;
    queue.forEach((msg) => {
      try {
        socketRef.current!.send(msg);
        setMessagesSent((c) => c + 1);
        totalBytes += typeof msg === "string" ? msg.length : msg.byteLength;
      } catch {
        messageQueueRef.current.push(msg);
      }
    });

    if (totalBytes > 0) {
      setBytesSent((c) => c + totalBytes);
    }
  }, []);

  // Manual ping
  const ping = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      pingStartRef.current = performance.now();
      setLastPingTime(Date.now());
      try {
        socketRef.current.send(JSON.stringify({ type: "ping", timestamp: pingStartRef.current }));
      } catch {
        // Ignore
      }
    }
  }, []);

  // Reset metrics
  const resetMetrics = useCallback(() => {
    setRttSamples([]);
    setMessagesSent(0);
    setMessagesReceived(0);
    setBytesSent(0);
    setBytesReceived(0);
    setReconnectAttempts(0);
  }, []);

  // Force reconnect
  const forceReconnect = useCallback(() => {
    if (urlRef.current) {
      disconnect();
      setReconnectAttempts(0);
      connect(urlRef.current, protocols);
    }
  }, [disconnect, connect, protocols]);

  // Set custom config
  const setConfig = useCallback((newConfig: Partial<StreamingConfig>) => {
    setConfigState((prev) => ({ ...prev, ...newConfig }));
  }, []);

  // Auto-connect
  useEffect(() => {
    if (autoConnect && initialUrl && isOnline) {
      connect(initialUrl, protocols);
    }

    return () => {
      disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle visibility changes
  useEffect(() => {
    if (!visibility.isVisible) {
      // Page hidden - reduce activity
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    } else {
      // Page visible - resume activity
      if (connectionState === "connected") {
        startPingInterval();
      }
    }
  }, [visibility.isVisible, connectionState, startPingInterval]);

  // Handle network status changes
  useEffect(() => {
    if (!isOnline && connectionState === "connected") {
      // Lost connection
      disconnect();
    } else if (isOnline && connectionState === "disconnected" && urlRef.current && autoReconnect) {
      // Regained connection - try to reconnect
      connect(urlRef.current, protocols);
    }
  }, [isOnline, connectionState, disconnect, connect, protocols, autoReconnect]);

  const controls: StreamingControls = useMemo(() => ({
    connect,
    disconnect,
    send,
    flushQueue,
    ping,
    resetMetrics,
    forceReconnect,
    setConfig,
  }), [connect, disconnect, send, flushQueue, ping, resetMetrics, forceReconnect, setConfig]);

  // Derived flags
  const isIdle = Date.now() - lastActivityRef.current > config.idleTimeoutMs;
  const shouldReduceActivity = isIdle || !visibility.isVisible || calculatedQuality === "minimal";

  return {
    quality: calculatedQuality,
    metrics,
    config,
    controls,
    socket,
    isConnected: connectionState === "connected",
    isMobile: isMobile || isTablet,
    shouldReduceActivity,
    isIdle,
  };
}

/**
 * Simple hook for WebSocket connection state
 */
export function useWebSocketConnectionState(): ConnectionState {
  const { metrics } = useConnectionAwareStreaming();
  return metrics.state;
}

/**
 * Hook for WebSocket quality score
 */
export function useWebSocketQualityScore(): number {
  const { metrics } = useConnectionAwareStreaming();
  return metrics.qualityScore;
}

// Export types
export type {
  ConnectionState,
  StreamingQuality,
  ConnectionMetrics,
  StreamingConfig,
  StreamingControls,
  ConnectionAwareStreamingResult,
  UseConnectionAwareStreamingOptions,
};
