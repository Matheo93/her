/**
 * useMobileNetworkRecovery - Intelligent network recovery for mobile devices
 *
 * Sprint 1588 - Handles network disconnections gracefully with automatic
 * reconnection, request queueing, and seamless recovery.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Request queue during offline periods
 * - Connection quality monitoring
 * - Graceful degradation strategies
 * - Sync state management
 * - Network transition handling (WiFi <-> cellular)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Network states
export type NetworkState =
  | "online" // Fully connected
  | "offline" // No connection
  | "reconnecting" // Attempting reconnection
  | "degraded" // Poor connection quality
  | "transitioning"; // Switching networks

export type ConnectionType = "wifi" | "cellular" | "ethernet" | "unknown" | "none";

export type RecoveryStrategy =
  | "immediate" // Retry immediately
  | "exponential" // Exponential backoff
  | "adaptive" // Based on network conditions
  | "manual"; // User-initiated only

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body?: unknown;
  headers?: Record<string, string>;
  timestamp: number;
  retries: number;
  maxRetries: number;
  priority: number;
  expiresAt: number | null;
}

export interface NetworkQuality {
  latency: number; // ms
  bandwidth: number; // estimated Mbps
  packetLoss: number; // 0-1
  jitter: number; // ms variance
  score: number; // 0-100 quality score
}

export interface SyncState {
  pendingCount: number;
  lastSyncTime: number | null;
  syncInProgress: boolean;
  failedCount: number;
}

export interface RecoveryState {
  network: NetworkState;
  connectionType: ConnectionType;
  quality: NetworkQuality;
  queuedRequests: QueuedRequest[];
  sync: SyncState;
  reconnectAttempts: number;
  lastOnlineTime: number | null;
  offlineDuration: number;
}

export interface RecoveryMetrics {
  totalDisconnections: number;
  averageOfflineDuration: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  requestsQueued: number;
  requestsReplayed: number;
  networkTransitions: number;
}

export interface RecoveryConfig {
  enabled: boolean;
  strategy: RecoveryStrategy;
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  queueMaxSize: number;
  requestTimeoutMs: number;
  requestExpiryMs: number;
  autoSync: boolean;
  syncIntervalMs: number;
  qualityCheckIntervalMs: number;
  degradedThreshold: number; // Quality score below this = degraded
}

export interface RecoveryControls {
  queueRequest: (
    request: Omit<QueuedRequest, "id" | "timestamp" | "retries">
  ) => string;
  cancelRequest: (id: string) => void;
  clearQueue: () => void;
  retryFailed: () => void;
  forceReconnect: () => void;
  pauseSync: () => void;
  resumeSync: () => void;
  checkConnection: () => Promise<boolean>;
  updateConfig: (config: Partial<RecoveryConfig>) => void;
  onNetworkChange: (callback: (state: NetworkState) => void) => () => void;
  onQueueDrained: (callback: () => void) => () => void;
}

export interface UseMobileNetworkRecoveryResult {
  state: RecoveryState;
  metrics: RecoveryMetrics;
  controls: RecoveryControls;
  config: RecoveryConfig;
  isOnline: boolean;
  canSync: boolean;
}

const DEFAULT_CONFIG: RecoveryConfig = {
  enabled: true,
  strategy: "exponential",
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  queueMaxSize: 100,
  requestTimeoutMs: 30000,
  requestExpiryMs: 300000, // 5 minutes
  autoSync: true,
  syncIntervalMs: 5000,
  qualityCheckIntervalMs: 10000,
  degradedThreshold: 30,
};

// Module-level counter for request IDs (avoids Date.now() overhead)
let requestIdCounter = 0;

// Pre-computed initial quality state (module-level for performance)
const INITIAL_QUALITY: NetworkQuality = {
  latency: 0,
  bandwidth: 0,
  packetLoss: 0,
  jitter: 0,
  score: 100,
};

// Pre-computed initial sync state
const INITIAL_SYNC: SyncState = {
  pendingCount: 0,
  lastSyncTime: null,
  syncInProgress: false,
  failedCount: 0,
};

// Pre-computed initial metrics
const INITIAL_METRICS: RecoveryMetrics = {
  totalDisconnections: 0,
  averageOfflineDuration: 0,
  successfulRecoveries: 0,
  failedRecoveries: 0,
  requestsQueued: 0,
  requestsReplayed: 0,
  networkTransitions: 0,
};

// Generate unique ID using counter (faster than Date.now())
export function generateId(): string {
  return `req-${++requestIdCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

// Calculate backoff delay
export function calculateBackoff(
  attempt: number,
  config: RecoveryConfig
): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
}

// Estimate connection type
export function getConnectionType(): ConnectionType {
  // @ts-ignore - Network Information API
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  if (!connection) return "unknown";

  const type = connection.type || connection.effectiveType;

  if (type === "wifi") return "wifi";
  if (["cellular", "4g", "3g", "2g"].includes(type)) return "cellular";
  if (type === "ethernet") return "ethernet";
  if (type === "none") return "none";

  return "unknown";
}

export function useMobileNetworkRecovery(
  initialConfig: Partial<RecoveryConfig> = {}
): UseMobileNetworkRecoveryResult {
  const [config, setConfig] = useState<RecoveryConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  // State - uses module-level constants for initial values
  const [state, setState] = useState<RecoveryState>(() => ({
    network: "online" as NetworkState,
    connectionType: getConnectionType(),
    quality: { ...INITIAL_QUALITY },
    queuedRequests: [],
    sync: { ...INITIAL_SYNC },
    reconnectAttempts: 0,
    lastOnlineTime: Date.now(),
    offlineDuration: 0,
  }));

  // Metrics - uses module-level constant
  const [metrics, setMetrics] = useState<RecoveryMetrics>(() => ({
    ...INITIAL_METRICS,
  }));

  // Refs
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qualityIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const offlineStartRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);
  const networkChangeCallbacksRef = useRef<Set<(state: NetworkState) => void>>(
    new Set()
  );
  const queueDrainedCallbacksRef = useRef<Set<() => void>>(new Set());
  const offlineDurationsRef = useRef<number[]>([]);

  // Check actual connectivity
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch("/api/health", {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  // Measure network quality
  const measureQuality = useCallback(async (): Promise<NetworkQuality> => {
    const samples: number[] = [];
    const startTime = Date.now();

    try {
      // Take 3 latency samples
      for (let i = 0; i < 3; i++) {
        const sampleStart = performance.now();
        await fetch("/api/health", { method: "HEAD", cache: "no-store" });
        samples.push(performance.now() - sampleStart);
      }

      const avgLatency = samples.reduce((a, b) => a + b, 0) / samples.length;
      const jitter =
        Math.sqrt(
          samples.reduce((sum, s) => sum + Math.pow(s - avgLatency, 2), 0) /
            samples.length
        );

      // Estimate bandwidth (very rough)
      // @ts-ignore - Network Information API
      const connection = navigator.connection;
      const bandwidth = connection?.downlink || 10;

      // Calculate quality score
      let score = 100;
      if (avgLatency > 200) score -= 30;
      else if (avgLatency > 100) score -= 15;
      if (jitter > 50) score -= 20;
      if (bandwidth < 1) score -= 30;
      else if (bandwidth < 5) score -= 15;

      return {
        latency: avgLatency,
        bandwidth,
        packetLoss: 0, // Would need more sophisticated measurement
        jitter,
        score: Math.max(0, score),
      };
    } catch {
      return {
        latency: 9999,
        bandwidth: 0,
        packetLoss: 1,
        jitter: 0,
        score: 0,
      };
    }
  }, []);

  // Process queued request
  const processRequest = useCallback(
    async (request: QueuedRequest): Promise<boolean> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          config.requestTimeoutMs
        );

        const response = await fetch(request.url, {
          method: request.method,
          body: request.body ? JSON.stringify(request.body) : undefined,
          headers: request.headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok;
      } catch {
        return false;
      }
    },
    [config.requestTimeoutMs]
  );

  // Sync queued requests
  const syncQueue = useCallback(async () => {
    if (isPausedRef.current || state.network !== "online") return;

    const now = Date.now();
    const queue = state.queuedRequests.filter(
      (r) => !r.expiresAt || r.expiresAt > now
    );

    if (queue.length === 0) return;

    setState((prev) => ({
      ...prev,
      sync: { ...prev.sync, syncInProgress: true },
    }));

    const successful: string[] = [];
    const failed: string[] = [];

    // Process by priority
    const sorted = [...queue].sort((a, b) => b.priority - a.priority);

    for (const request of sorted) {
      if (state.network !== "online") break;

      const success = await processRequest(request);

      if (success) {
        successful.push(request.id);
      } else if (request.retries < request.maxRetries) {
        failed.push(request.id);
      } else {
        // Max retries exceeded - remove
        successful.push(request.id);
      }
    }

    setState((prev) => ({
      ...prev,
      queuedRequests: prev.queuedRequests
        .filter((r) => !successful.includes(r.id))
        .map((r) =>
          failed.includes(r.id) ? { ...r, retries: r.retries + 1 } : r
        ),
      sync: {
        pendingCount: prev.queuedRequests.length - successful.length,
        lastSyncTime: Date.now(),
        syncInProgress: false,
        failedCount: failed.length,
      },
    }));

    setMetrics((prev) => ({
      ...prev,
      requestsReplayed: prev.requestsReplayed + successful.length,
    }));

    // Notify if queue drained
    if (successful.length > 0 && state.queuedRequests.length - successful.length === 0) {
      queueDrainedCallbacksRef.current.forEach((cb) => cb());
    }
  }, [state.network, state.queuedRequests, processRequest]);

  // Handle network state changes
  const handleNetworkChange = useCallback(
    (isOnline: boolean) => {
      const newState: NetworkState = isOnline ? "online" : "offline";

      if (newState === "offline" && state.network === "online") {
        // Going offline
        offlineStartRef.current = Date.now();

        setState((prev) => ({
          ...prev,
          network: "offline",
          lastOnlineTime: Date.now(),
        }));

        setMetrics((prev) => ({
          ...prev,
          totalDisconnections: prev.totalDisconnections + 1,
        }));
      } else if (newState === "online" && state.network !== "online") {
        // Coming online
        if (offlineStartRef.current) {
          const duration = Date.now() - offlineStartRef.current;
          offlineDurationsRef.current.push(duration);

          setState((prev) => ({
            ...prev,
            offlineDuration: duration,
          }));

          setMetrics((prev) => ({
            ...prev,
            successfulRecoveries: prev.successfulRecoveries + 1,
            averageOfflineDuration:
              offlineDurationsRef.current.reduce((a, b) => a + b, 0) /
              offlineDurationsRef.current.length,
          }));
        }

        offlineStartRef.current = null;

        setState((prev) => ({
          ...prev,
          network: "online",
          reconnectAttempts: 0,
        }));

        // Trigger sync
        if (config.autoSync) {
          syncQueue();
        }
      }

      // Notify listeners
      networkChangeCallbacksRef.current.forEach((cb) => cb(newState));
    },
    [state.network, config.autoSync, syncQueue]
  );

  // Reconnection logic
  const attemptReconnect = useCallback(async () => {
    if (state.network === "online") return;

    setState((prev) => ({
      ...prev,
      network: "reconnecting",
      reconnectAttempts: prev.reconnectAttempts + 1,
    }));

    const isConnected = await checkConnection();

    if (isConnected) {
      handleNetworkChange(true);
    } else {
      const delay = calculateBackoff(state.reconnectAttempts, config);

      if (state.reconnectAttempts < config.maxRetries) {
        reconnectTimeoutRef.current = setTimeout(attemptReconnect, delay);
      } else {
        setMetrics((prev) => ({
          ...prev,
          failedRecoveries: prev.failedRecoveries + 1,
        }));
      }

      setState((prev) => ({
        ...prev,
        network: "offline",
      }));
    }
  }, [state.network, state.reconnectAttempts, config, checkConnection, handleNetworkChange]);

  // Network event listeners
  useEffect(() => {
    const handleOnline = () => handleNetworkChange(true);
    const handleOffline = () => handleNetworkChange(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Network change listener
    // @ts-ignore
    const connection = navigator.connection;
    if (connection) {
      const handleConnectionChange = () => {
        const newType = getConnectionType();
        setState((prev) => {
          if (prev.connectionType !== newType) {
            setMetrics((m) => ({
              ...m,
              networkTransitions: m.networkTransitions + 1,
            }));
          }
          return { ...prev, connectionType: newType };
        });
      };

      connection.addEventListener("change", handleConnectionChange);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        connection.removeEventListener("change", handleConnectionChange);
      };
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [handleNetworkChange]);

  // Quality monitoring
  useEffect(() => {
    if (!config.enabled) return;

    qualityIntervalRef.current = setInterval(async () => {
      if (state.network === "online") {
        const quality = await measureQuality();

        setState((prev) => ({
          ...prev,
          quality,
          network: quality.score < config.degradedThreshold ? "degraded" : "online",
        }));
      }
    }, config.qualityCheckIntervalMs);

    return () => {
      if (qualityIntervalRef.current) {
        clearInterval(qualityIntervalRef.current);
      }
    };
  }, [config, state.network, measureQuality]);

  // Auto sync
  useEffect(() => {
    if (!config.enabled || !config.autoSync) return;

    syncIntervalRef.current = setInterval(() => {
      if (state.network === "online" && state.queuedRequests.length > 0) {
        syncQueue();
      }
    }, config.syncIntervalMs);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [config, state.network, state.queuedRequests.length, syncQueue]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      if (qualityIntervalRef.current) {
        clearInterval(qualityIntervalRef.current);
      }
    };
  }, []);

  // Controls
  const queueRequest = useCallback(
    (request: Omit<QueuedRequest, "id" | "timestamp" | "retries">): string => {
      const id = generateId();
      const fullRequest: QueuedRequest = {
        ...request,
        id,
        timestamp: Date.now(),
        retries: 0,
        expiresAt: request.expiresAt ?? Date.now() + config.requestExpiryMs,
      };

      setState((prev) => {
        // Use slice(-N) instead of shift() for O(1) vs O(n) queue limiting
        let queue: QueuedRequest[];
        if (prev.queuedRequests.length >= config.queueMaxSize) {
          queue = [...prev.queuedRequests.slice(-(config.queueMaxSize - 1)), fullRequest];
        } else {
          queue = [...prev.queuedRequests, fullRequest];
        }
        return {
          ...prev,
          queuedRequests: queue,
          sync: { ...prev.sync, pendingCount: queue.length },
        };
      });

      setMetrics((prev) => ({
        ...prev,
        requestsQueued: prev.requestsQueued + 1,
      }));

      return id;
    },
    [config.requestExpiryMs, config.queueMaxSize]
  );

  const cancelRequest = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      queuedRequests: prev.queuedRequests.filter((r) => r.id !== id),
    }));
  }, []);

  const clearQueue = useCallback(() => {
    setState((prev) => ({
      ...prev,
      queuedRequests: [],
      sync: { ...prev.sync, pendingCount: 0 },
    }));
  }, []);

  const retryFailed = useCallback(() => {
    setState((prev) => ({
      ...prev,
      queuedRequests: prev.queuedRequests.map((r) => ({ ...r, retries: 0 })),
    }));
    syncQueue();
  }, [syncQueue]);

  const forceReconnect = useCallback(() => {
    setState((prev) => ({ ...prev, reconnectAttempts: 0 }));
    attemptReconnect();
  }, [attemptReconnect]);

  const pauseSync = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  const resumeSync = useCallback(() => {
    isPausedRef.current = false;
  }, []);

  const updateConfig = useCallback((updates: Partial<RecoveryConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const onNetworkChange = useCallback(
    (callback: (state: NetworkState) => void) => {
      networkChangeCallbacksRef.current.add(callback);
      return () => {
        networkChangeCallbacksRef.current.delete(callback);
      };
    },
    []
  );

  const onQueueDrained = useCallback((callback: () => void) => {
    queueDrainedCallbacksRef.current.add(callback);
    return () => {
      queueDrainedCallbacksRef.current.delete(callback);
    };
  }, []);

  const controls: RecoveryControls = useMemo(
    () => ({
      queueRequest,
      cancelRequest,
      clearQueue,
      retryFailed,
      forceReconnect,
      pauseSync,
      resumeSync,
      checkConnection,
      updateConfig,
      onNetworkChange,
      onQueueDrained,
    }),
    [
      queueRequest,
      cancelRequest,
      clearQueue,
      retryFailed,
      forceReconnect,
      pauseSync,
      resumeSync,
      checkConnection,
      updateConfig,
      onNetworkChange,
      onQueueDrained,
    ]
  );

  const isOnline = state.network === "online" || state.network === "degraded";
  const canSync = isOnline && !isPausedRef.current && state.queuedRequests.length > 0;

  return {
    state,
    metrics,
    controls,
    config,
    isOnline,
    canSync,
  };
}

// Sub-hook: Simple online status
export function useOnlineStatus(): {
  isOnline: boolean;
  connectionType: ConnectionType;
} {
  const { state } = useMobileNetworkRecovery();

  return {
    isOnline: state.network === "online" || state.network === "degraded",
    connectionType: state.connectionType,
  };
}

// Sub-hook: Request queueing
export function useOfflineQueue(config?: Partial<RecoveryConfig>): {
  queue: (url: string, method: string, body?: unknown) => string;
  pending: number;
  sync: () => void;
} {
  const { state, controls } = useMobileNetworkRecovery(config);

  const queue = useCallback(
    (url: string, method: string, body?: unknown) => {
      return controls.queueRequest({
        url,
        method,
        body,
        maxRetries: 3,
        priority: 1,
        expiresAt: null,
      });
    },
    [controls]
  );

  return {
    queue,
    pending: state.queuedRequests.length,
    sync: controls.retryFailed,
  };
}

export default useMobileNetworkRecovery;
