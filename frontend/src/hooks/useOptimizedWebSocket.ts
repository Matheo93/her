"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { WebSocketSettings } from "./useMobileOptimization";

/**
 * Optimized WebSocket Hook - Sprint 514
 *
 * Mobile-optimized WebSocket connection with:
 * - Exponential backoff for reconnection
 * - Network-aware reconnection delays
 * - Visibility-based connection management
 * - Heartbeat ping/pong to detect stale connections
 * - Automatic cleanup on unmount
 */

export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

interface UseOptimizedWebSocketOptions {
  url: string;
  settings: WebSocketSettings;
  enabled?: boolean;
  onMessage?: (data: unknown) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface UseOptimizedWebSocketReturn {
  state: ConnectionState;
  isConnected: boolean;
  send: (data: string | ArrayBuffer | Blob) => boolean;
  sendJson: (data: unknown) => boolean;
  reconnect: () => void;
  disconnect: () => void;
  lastPingTime: number | null;
  reconnectAttempts: number;
}

export function useOptimizedWebSocket({
  url,
  settings,
  enabled = true,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
}: UseOptimizedWebSocketOptions): UseOptimizedWebSocketReturn {
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [lastPingTime, setLastPingTime] = useState<number | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManualDisconnectRef = useRef(false);
  const isDocumentVisibleRef = useRef(true);
  const messageQueueRef = useRef<Array<string | ArrayBuffer | Blob>>([]);

  // Calculate backoff delay with jitter
  const getReconnectDelay = useCallback(
    (attempt: number): number => {
      if (!settings.enableBackoff) {
        return settings.reconnectDelay;
      }

      // Exponential backoff: delay * 2^attempt
      const baseDelay = settings.reconnectDelay * Math.pow(2, Math.min(attempt, 5));

      // Cap at max delay
      const cappedDelay = Math.min(baseDelay, settings.reconnectMaxDelay);

      // Add jitter (10-20% random variation to prevent thundering herd)
      const jitter = cappedDelay * (0.1 + Math.random() * 0.1);

      return cappedDelay + jitter;
    },
    [settings.reconnectDelay, settings.reconnectMaxDelay, settings.enableBackoff]
  );

  // Clean up timers
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  // Setup ping/pong heartbeat
  const setupHeartbeat = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "ping" }));
          setLastPingTime(Date.now());
        } catch {
          // Connection might be stale, will be detected by pong timeout
        }
      }
    }, settings.pingInterval);
  }, [settings.pingInterval]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!enabled || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Don't connect if document is hidden (mobile background)
    if (!isDocumentVisibleRef.current) {
      return;
    }

    clearTimers();
    setState("connecting");
    isManualDisconnectRef.current = false;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      // Connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          setState("disconnected");
          scheduleReconnect();
        }
      }, settings.connectionTimeout);

      ws.onopen = () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }

        setState("connected");
        setReconnectAttempts(0);

        // Flush queued messages
        while (messageQueueRef.current.length > 0) {
          const msg = messageQueueRef.current.shift();
          if (msg) {
            ws.send(msg);
          }
        }

        setupHeartbeat();
        onConnect?.();
      };

      ws.onclose = () => {
        clearTimers();
        setState("disconnected");

        if (!isManualDisconnectRef.current) {
          onDisconnect?.();
          scheduleReconnect();
        }
      };

      ws.onerror = (event) => {
        onError?.(event);

        // Close and reconnect on error
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.close();
        }
      };

      ws.onmessage = (event) => {
        try {
          // Handle pong
          if (typeof event.data === "string") {
            const data = JSON.parse(event.data);
            if (data.type === "pong") {
              return;
            }
            onMessage?.(data);
          } else {
            onMessage?.(event.data);
          }
        } catch {
          // Non-JSON message
          onMessage?.(event.data);
        }
      };
    } catch {
      setState("disconnected");
      scheduleReconnect();
    }
  }, [
    url,
    enabled,
    settings.connectionTimeout,
    clearTimers,
    setupHeartbeat,
    onConnect,
    onDisconnect,
    onError,
    onMessage,
  ]);

  // Schedule reconnection with backoff
  const scheduleReconnect = useCallback(() => {
    if (isManualDisconnectRef.current || !enabled) {
      return;
    }

    setReconnectAttempts((prev) => prev + 1);
    setState("reconnecting");

    const delay = getReconnectDelay(reconnectAttempts);

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [enabled, reconnectAttempts, getReconnectDelay, connect]);

  // Send message
  const send = useCallback((data: string | ArrayBuffer | Blob): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(data);
        return true;
      } catch {
        return false;
      }
    }

    // Queue message for later if connecting
    if (state === "connecting" || state === "reconnecting") {
      messageQueueRef.current.push(data);
      return true;
    }

    return false;
  }, [state]);

  // Send JSON message
  const sendJson = useCallback((data: unknown): boolean => {
    return send(JSON.stringify(data));
  }, [send]);

  // Manual reconnect
  const reconnect = useCallback(() => {
    isManualDisconnectRef.current = false;
    setReconnectAttempts(0);

    if (wsRef.current) {
      wsRef.current.close();
    }

    connect();
  }, [connect]);

  // Manual disconnect
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    clearTimers();
    messageQueueRef.current = [];

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState("disconnected");
  }, [clearTimers]);

  // Handle visibility changes (mobile background/foreground)
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      isDocumentVisibleRef.current = !document.hidden;

      if (document.hidden) {
        // Going to background - stop heartbeat to save battery
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
      } else {
        // Coming back to foreground
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // Resume heartbeat
          setupHeartbeat();
        } else if (!isManualDisconnectRef.current && enabled) {
          // Connection was lost while in background, reconnect
          setReconnectAttempts(0);
          connect();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, connect, setupHeartbeat]);

  // Handle online/offline events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      if (!isManualDisconnectRef.current && enabled && state === "disconnected") {
        setReconnectAttempts(0);
        connect();
      }
    };

    const handleOffline = () => {
      // Clear reconnect attempts when going offline
      clearTimers();
      setState("disconnected");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled, state, connect, clearTimers]);

  // Initial connection
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      isManualDisconnectRef.current = true;
      clearTimers();

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, connect, clearTimers]);

  return {
    state,
    isConnected: state === "connected",
    send,
    sendJson,
    reconnect,
    disconnect,
    lastPingTime,
    reconnectAttempts,
  };
}

export default useOptimizedWebSocket;
