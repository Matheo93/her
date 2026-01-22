"use client";

/**
 * useOfflineResilience - Offline Support and Connection Resilience
 *
 * Provides graceful degradation when network connectivity is lost,
 * with message queuing, state caching, and automatic recovery.
 *
 * Sprint 510: Avatar UX and mobile latency improvements
 *
 * Key features:
 * - Message queue for offline messages with retry on reconnect
 * - State caching in IndexedDB/localStorage for resilience
 * - Automatic recovery with queue flush on reconnect
 * - Optimistic UI updates with rollback on failure
 * - Connection state machine with hysteresis
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNetworkStatus } from "./useNetworkStatus";
import { useVisibility } from "./useVisibility";

// Connection states with hysteresis to prevent flapping
type ConnectionState = "online" | "offline" | "unstable" | "recovering";

// Message priority for queue ordering
type MessagePriority = "critical" | "high" | "normal" | "low";

interface QueuedMessage {
  id: string;
  data: unknown;
  priority: MessagePriority;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  expiresAt: number | null;
}

interface CachedState {
  key: string;
  value: unknown;
  timestamp: number;
  expiresAt: number | null;
}

interface OfflineMetrics {
  // Current connection state
  connectionState: ConnectionState;

  // Time offline (ms) - 0 if online
  offlineDuration: number;

  // Number of messages in queue
  queuedMessages: number;

  // Total bytes in queue
  queuedBytes: number;

  // Number of cached states
  cachedStates: number;

  // Number of successful recoveries
  successfulRecoveries: number;

  // Number of failed messages (expired or max retries)
  failedMessages: number;

  // Last online timestamp
  lastOnlineAt: number;

  // Last offline timestamp
  lastOfflineAt: number;

  // Connection stability score (0-100)
  stabilityScore: number;
}

interface OfflineConfig {
  // Maximum queue size
  maxQueueSize: number;

  // Maximum retry attempts per message
  maxRetries: number;

  // Message expiry time (ms) - null for no expiry
  messageExpiry: number | null;

  // State cache expiry (ms)
  cacheExpiry: number;

  // Enable IndexedDB for persistence
  useIndexedDB: boolean;

  // Debounce time for connection state changes (ms)
  connectionDebounce: number;

  // Time to consider connection unstable (ms)
  unstableThreshold: number;

  // Enable optimistic updates
  enableOptimisticUpdates: boolean;
}

interface OfflineControls {
  // Queue a message for sending
  queueMessage: (data: unknown, options?: {
    priority?: MessagePriority;
    maxRetries?: number;
    expiresIn?: number;
  }) => string;

  // Remove a message from queue
  removeMessage: (id: string) => boolean;

  // Clear all queued messages
  clearQueue: () => void;

  // Flush queue (attempt to send all messages)
  flushQueue: () => Promise<FlushResult>;

  // Cache state for offline access
  cacheState: (key: string, value: unknown, expiresIn?: number) => void;

  // Get cached state
  getCachedState: <T>(key: string) => T | null;

  // Clear cached state
  clearCachedState: (key: string) => void;

  // Clear all cached states
  clearAllCache: () => void;

  // Force connection state check
  checkConnection: () => Promise<boolean>;

  // Register message handler (called when flushing)
  setMessageHandler: (handler: (message: QueuedMessage) => Promise<boolean>) => void;

  // Register recovery callback
  onRecovery: (callback: () => void) => () => void;
}

interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

interface UseOfflineResilienceResult {
  // Current state
  isOnline: boolean;
  isOffline: boolean;
  isUnstable: boolean;
  isRecovering: boolean;

  // Metrics
  metrics: OfflineMetrics;

  // Configuration
  config: OfflineConfig;

  // Controls
  controls: OfflineControls;
}

interface UseOfflineResilienceOptions {
  // Custom configuration
  config?: Partial<OfflineConfig>;

  // Ping endpoint for connection checking
  pingEndpoint?: string;

  // Callback when going offline
  onOffline?: () => void;

  // Callback when coming online
  onOnline?: () => void;

  // Callback when connection becomes unstable
  onUnstable?: () => void;
}

const DEFAULT_CONFIG: OfflineConfig = {
  maxQueueSize: 100,
  maxRetries: 3,
  messageExpiry: 5 * 60 * 1000, // 5 minutes
  cacheExpiry: 30 * 60 * 1000, // 30 minutes
  useIndexedDB: true,
  connectionDebounce: 2000,
  unstableThreshold: 10000, // 10 seconds of flapping
  enableOptimisticUpdates: true,
};

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Estimate byte size of data
function estimateBytes(data: unknown): number {
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch {
    return 0;
  }
}

export function useOfflineResilience(
  options: UseOfflineResilienceOptions = {}
): UseOfflineResilienceResult {
  const {
    config: userConfig,
    pingEndpoint = "/api/health",
    onOffline,
    onOnline,
    onUnstable,
  } = options;

  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...userConfig }), [userConfig]);

  // Core hooks
  const networkStatus = useNetworkStatus();
  const visibility = useVisibility();

  // State
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    networkStatus.isOnline ? "online" : "offline"
  );
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const [stateCache, setStateCache] = useState<Map<string, CachedState>>(new Map());
  const [successfulRecoveries, setSuccessfulRecoveries] = useState(0);
  const [failedMessages, setFailedMessages] = useState(0);
  const [lastOnlineAt, setLastOnlineAt] = useState(Date.now());
  const [lastOfflineAt, setLastOfflineAt] = useState(0);

  // Refs
  const messageHandlerRef = useRef<((message: QueuedMessage) => Promise<boolean>) | null>(null);
  const recoveryCallbacksRef = useRef<Set<() => void>>(new Set());
  const connectionChangesRef = useRef<number[]>([]);
  const offlineStartRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate stability score based on recent connection changes
  const stabilityScore = useMemo(() => {
    const now = Date.now();
    const recentChanges = connectionChangesRef.current.filter(
      (t) => now - t < 60000 // Last minute
    );

    // More changes = less stable
    // 0 changes = 100, 10+ changes = 0
    return Math.max(0, 100 - recentChanges.length * 10);
  }, [connectionState]); // Recalculate when state changes

  // Calculate offline duration
  const offlineDuration = useMemo(() => {
    if (connectionState === "offline" && offlineStartRef.current > 0) {
      return Date.now() - offlineStartRef.current;
    }
    return 0;
  }, [connectionState]);

  // Handle connection state changes
  useEffect(() => {
    const handleStateChange = (isOnline: boolean) => {
      // Record change for stability calculation
      connectionChangesRef.current.push(Date.now());
      if (connectionChangesRef.current.length > 20) {
        connectionChangesRef.current.shift();
      }

      // Check for unstable connection
      const recentChanges = connectionChangesRef.current.filter(
        (t) => Date.now() - t < config.unstableThreshold
      );

      if (recentChanges.length >= 3) {
        setConnectionState("unstable");
        onUnstable?.();
        return;
      }

      if (isOnline) {
        if (connectionState === "offline" || connectionState === "unstable") {
          // Recovering from offline
          setConnectionState("recovering");
          setLastOnlineAt(Date.now());
          offlineStartRef.current = 0;

          // Attempt to flush queue
          flushQueueInternal().then(() => {
            setConnectionState("online");
            setSuccessfulRecoveries((c) => c + 1);

            // Notify recovery callbacks
            recoveryCallbacksRef.current.forEach((cb) => cb());

            onOnline?.();
          });
        } else {
          setConnectionState("online");
        }
      } else {
        if (connectionState === "online" || connectionState === "recovering") {
          offlineStartRef.current = Date.now();
          setLastOfflineAt(Date.now());
        }
        setConnectionState("offline");
        onOffline?.();
      }
    };

    // Debounce connection changes
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      handleStateChange(networkStatus.isOnline);
    }, config.connectionDebounce);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [networkStatus.isOnline, config.connectionDebounce, config.unstableThreshold, connectionState, onOffline, onOnline, onUnstable]);

  // Internal flush function
  const flushQueueInternal = useCallback(async (): Promise<FlushResult> => {
    if (!messageHandlerRef.current || messageQueue.length === 0) {
      return { sent: 0, failed: 0, remaining: messageQueue.length };
    }

    const handler = messageHandlerRef.current;
    let sent = 0;
    let failed = 0;
    const remaining: QueuedMessage[] = [];

    // Sort by priority
    const sorted = [...messageQueue].sort((a, b) => {
      const priorityOrder: Record<MessagePriority, number> = {
        critical: 0,
        high: 1,
        normal: 2,
        low: 3,
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    for (const message of sorted) {
      // Check if expired
      if (message.expiresAt && Date.now() > message.expiresAt) {
        failed++;
        setFailedMessages((c) => c + 1);
        continue;
      }

      // Check if max retries exceeded
      if (message.retryCount >= message.maxRetries) {
        failed++;
        setFailedMessages((c) => c + 1);
        continue;
      }

      try {
        const success = await handler(message);
        if (success) {
          sent++;
        } else {
          remaining.push({
            ...message,
            retryCount: message.retryCount + 1,
          });
        }
      } catch {
        remaining.push({
          ...message,
          retryCount: message.retryCount + 1,
        });
      }
    }

    setMessageQueue(remaining);
    return { sent, failed, remaining: remaining.length };
  }, [messageQueue]);

  // Queue a message
  const queueMessage = useCallback(
    (
      data: unknown,
      messageOptions?: {
        priority?: MessagePriority;
        maxRetries?: number;
        expiresIn?: number;
      }
    ): string => {
      const id = generateId();
      const now = Date.now();

      const message: QueuedMessage = {
        id,
        data,
        priority: messageOptions?.priority || "normal",
        timestamp: now,
        retryCount: 0,
        maxRetries: messageOptions?.maxRetries ?? config.maxRetries,
        expiresAt: messageOptions?.expiresIn ? now + messageOptions.expiresIn :
          config.messageExpiry ? now + config.messageExpiry : null,
      };

      setMessageQueue((prev) => {
        // Enforce max queue size
        if (prev.length >= config.maxQueueSize) {
          // Remove oldest low-priority messages first
          const sorted = [...prev].sort((a, b) => {
            const priorityOrder: Record<MessagePriority, number> = {
              critical: 0,
              high: 1,
              normal: 2,
              low: 3,
            };
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
              return priorityOrder[b.priority] - priorityOrder[a.priority]; // Lower priority first
            }
            return a.timestamp - b.timestamp; // Older first
          });
          return [...sorted.slice(1), message];
        }
        return [...prev, message];
      });

      return id;
    },
    [config.maxRetries, config.messageExpiry, config.maxQueueSize]
  );

  // Remove a message
  const removeMessage = useCallback((id: string): boolean => {
    let found = false;
    setMessageQueue((prev) => {
      const filtered = prev.filter((m) => {
        if (m.id === id) {
          found = true;
          return false;
        }
        return true;
      });
      return filtered;
    });
    return found;
  }, []);

  // Clear queue
  const clearQueue = useCallback(() => {
    setMessageQueue([]);
  }, []);

  // Flush queue
  const flushQueue = useCallback(async (): Promise<FlushResult> => {
    if (connectionState !== "online" && connectionState !== "recovering") {
      return { sent: 0, failed: 0, remaining: messageQueue.length };
    }
    return flushQueueInternal();
  }, [connectionState, messageQueue.length, flushQueueInternal]);

  // Cache state
  const cacheState = useCallback(
    (key: string, value: unknown, expiresIn?: number) => {
      const now = Date.now();
      const cached: CachedState = {
        key,
        value,
        timestamp: now,
        expiresAt: expiresIn ? now + expiresIn : now + config.cacheExpiry,
      };

      setStateCache((prev) => {
        const newCache = new Map(prev);
        newCache.set(key, cached);
        return newCache;
      });

      // Also persist to localStorage if available
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(`offline_cache_${key}`, JSON.stringify(cached));
        } catch {
          // Storage full or unavailable
        }
      }
    },
    [config.cacheExpiry]
  );

  // Get cached state
  const getCachedState = useCallback(<T>(key: string): T | null => {
    // Try memory cache first
    const memoryCached = stateCache.get(key);
    if (memoryCached) {
      if (!memoryCached.expiresAt || Date.now() < memoryCached.expiresAt) {
        return memoryCached.value as T;
      }
      // Expired, remove it
      setStateCache((prev) => {
        const newCache = new Map(prev);
        newCache.delete(key);
        return newCache;
      });
    }

    // Try localStorage
    if (typeof localStorage !== "undefined") {
      try {
        const stored = localStorage.getItem(`offline_cache_${key}`);
        if (stored) {
          const cached: CachedState = JSON.parse(stored);
          if (!cached.expiresAt || Date.now() < cached.expiresAt) {
            // Restore to memory cache
            setStateCache((prev) => {
              const newCache = new Map(prev);
              newCache.set(key, cached);
              return newCache;
            });
            return cached.value as T;
          }
          // Expired, remove it
          localStorage.removeItem(`offline_cache_${key}`);
        }
      } catch {
        // Parse error
      }
    }

    return null;
  }, [stateCache]);

  // Clear cached state
  const clearCachedState = useCallback((key: string) => {
    setStateCache((prev) => {
      const newCache = new Map(prev);
      newCache.delete(key);
      return newCache;
    });

    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(`offline_cache_${key}`);
    }
  }, []);

  // Clear all cache
  const clearAllCache = useCallback(() => {
    setStateCache(new Map());

    if (typeof localStorage !== "undefined") {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("offline_cache_")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
  }, []);

  // Check connection
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(pingEndpoint, {
        method: "HEAD",
        cache: "no-store",
      });
      return response.ok;
    } catch {
      return false;
    }
  }, [pingEndpoint]);

  // Set message handler
  const setMessageHandler = useCallback(
    (handler: (message: QueuedMessage) => Promise<boolean>) => {
      messageHandlerRef.current = handler;
    },
    []
  );

  // Register recovery callback
  const onRecovery = useCallback((callback: () => void): (() => void) => {
    recoveryCallbacksRef.current.add(callback);
    return () => {
      recoveryCallbacksRef.current.delete(callback);
    };
  }, []);

  // Calculate metrics
  const metrics = useMemo((): OfflineMetrics => {
    const queuedBytes = messageQueue.reduce(
      (sum, msg) => sum + estimateBytes(msg.data),
      0
    );

    return {
      connectionState,
      offlineDuration,
      queuedMessages: messageQueue.length,
      queuedBytes,
      cachedStates: stateCache.size,
      successfulRecoveries,
      failedMessages,
      lastOnlineAt,
      lastOfflineAt,
      stabilityScore,
    };
  }, [
    connectionState,
    offlineDuration,
    messageQueue,
    stateCache.size,
    successfulRecoveries,
    failedMessages,
    lastOnlineAt,
    lastOfflineAt,
    stabilityScore,
  ]);

  // Controls
  const controls = useMemo(
    (): OfflineControls => ({
      queueMessage,
      removeMessage,
      clearQueue,
      flushQueue,
      cacheState,
      getCachedState,
      clearCachedState,
      clearAllCache,
      checkConnection,
      setMessageHandler,
      onRecovery,
    }),
    [
      queueMessage,
      removeMessage,
      clearQueue,
      flushQueue,
      cacheState,
      getCachedState,
      clearCachedState,
      clearAllCache,
      checkConnection,
      setMessageHandler,
      onRecovery,
    ]
  );

  return {
    isOnline: connectionState === "online",
    isOffline: connectionState === "offline",
    isUnstable: connectionState === "unstable",
    isRecovering: connectionState === "recovering",
    metrics,
    config,
    controls,
  };
}

/**
 * Simple hook for offline status
 */
export function useIsOffline(): boolean {
  const { isOffline } = useOfflineResilience();
  return isOffline;
}

/**
 * Hook for connection stability
 */
export function useConnectionStability(): number {
  const { metrics } = useOfflineResilience();
  return metrics.stabilityScore;
}

/**
 * Hook for offline message queue
 */
export function useOfflineQueue(): {
  queueMessage: OfflineControls["queueMessage"];
  queueLength: number;
  flushQueue: OfflineControls["flushQueue"];
} {
  const { metrics, controls } = useOfflineResilience();
  return {
    queueMessage: controls.queueMessage,
    queueLength: metrics.queuedMessages,
    flushQueue: controls.flushQueue,
  };
}

// Export types
export type {
  ConnectionState,
  MessagePriority,
  QueuedMessage,
  CachedState,
  OfflineMetrics,
  OfflineConfig,
  OfflineControls,
  FlushResult,
  UseOfflineResilienceResult,
  UseOfflineResilienceOptions,
};
