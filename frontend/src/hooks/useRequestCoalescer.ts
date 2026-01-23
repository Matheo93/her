/**
 * useRequestCoalescer - Request Coalescing Hook
 *
 * Sprint 515: Reduces mobile latency by intelligently coalescing,
 * deduplicating, and batching API requests. Features:
 * - Request deduplication (identical requests share responses)
 * - Request batching (multiple requests combined into one)
 * - Priority-based request ordering
 * - Automatic retry with exponential backoff
 * - Request cancellation on component unmount
 * - Offline request queueing
 *
 * @example
 * ```tsx
 * const { request, batchRequest, cancelAll, metrics } = useRequestCoalescer({
 *   maxBatchSize: 5,
 *   batchWindow: 50,
 *   deduplicationWindow: 100,
 * });
 *
 * // Single request with deduplication
 * const data = await request('/api/chat', { message: 'hello' });
 *
 * // Batch multiple requests
 * const results = await batchRequest([
 *   { endpoint: '/api/user', data: { id: 1 } },
 *   { endpoint: '/api/user', data: { id: 2 } },
 * ]);
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Request priority levels
 */
export type RequestPriority = "critical" | "high" | "normal" | "low" | "background";

/**
 * Request status
 */
export type RequestStatus =
  | "pending"
  | "coalesced"
  | "batched"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Single request configuration
 */
export interface RequestConfig {
  /** API endpoint */
  endpoint: string;
  /** Request method */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Request payload */
  data?: unknown;
  /** Request priority */
  priority?: RequestPriority;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Request timeout (ms) */
  timeout?: number;
  /** Allow deduplication */
  deduplicate?: boolean;
  /** Allow batching */
  batchable?: boolean;
  /** Cache key (for deduplication) */
  cacheKey?: string;
  /** Retry count */
  retries?: number;
}

/**
 * Tracked request with metadata
 */
export interface TrackedRequest {
  id: string;
  config: RequestConfig;
  status: RequestStatus;
  priority: RequestPriority;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  coalescedWith: string | null;
  batchId: string | null;
  retryCount: number;
  error: Error | null;
}

/**
 * Request batch
 */
export interface RequestBatch {
  id: string;
  requests: TrackedRequest[];
  status: "pending" | "executing" | "completed" | "failed";
  createdAt: number;
  executedAt: number | null;
}

/**
 * Response wrapper
 */
export interface CoalescedResponse<T = unknown> {
  data: T;
  fromCache: boolean;
  coalescedCount: number;
  batchId: string | null;
  latencyMs: number;
}

/**
 * Batch response
 */
export interface BatchResponse<T = unknown> {
  results: Array<{
    success: boolean;
    data?: T;
    error?: Error;
    requestId: string;
  }>;
  totalLatencyMs: number;
  batchId: string;
}

/**
 * Coalescer metrics
 */
export interface CoalescerMetrics {
  totalRequests: number;
  coalescedRequests: number;
  batchedRequests: number;
  failedRequests: number;
  cancelledRequests: number;
  averageLatencyMs: number;
  cacheHits: number;
  cacheMisses: number;
  totalBatches: number;
  averageBatchSize: number;
  savedRequests: number; // Requests saved via deduplication
  savedBandwidthEstimate: number; // Estimated bytes saved
}

/**
 * Coalescer configuration
 */
export interface CoalescerConfig {
  /** Maximum batch size */
  maxBatchSize: number;
  /** Batch collection window (ms) */
  batchWindow: number;
  /** Deduplication time window (ms) */
  deduplicationWindow: number;
  /** Default request timeout (ms) */
  defaultTimeout: number;
  /** Enable request caching */
  enableCache: boolean;
  /** Cache TTL (ms) */
  cacheTTL: number;
  /** Maximum cache entries */
  maxCacheEntries: number;
  /** Enable offline queueing */
  enableOfflineQueue: boolean;
  /** Maximum offline queue size */
  maxOfflineQueueSize: number;
  /** Default retry count */
  defaultRetries: number;
  /** Base retry delay (ms) */
  retryBaseDelay: number;
  /** Maximum retry delay (ms) */
  retryMaxDelay: number;
  /** Request executor function */
  executor?: (config: RequestConfig) => Promise<unknown>;
}

/**
 * Coalescer controls
 */
export interface CoalescerControls {
  /** Make a single request with deduplication */
  request: <T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: Partial<RequestConfig>
  ) => Promise<CoalescedResponse<T>>;
  /** Make a batch request */
  batchRequest: <T = unknown>(
    requests: RequestConfig[]
  ) => Promise<BatchResponse<T>>;
  /** Cancel a specific request */
  cancel: (requestId: string) => void;
  /** Cancel all pending requests */
  cancelAll: () => void;
  /** Clear the response cache */
  clearCache: () => void;
  /** Flush offline queue */
  flushOfflineQueue: () => Promise<void>;
  /** Get pending request count */
  getPendingCount: () => number;
  /** Get request status */
  getRequestStatus: (requestId: string) => TrackedRequest | null;
  /** Reset metrics */
  resetMetrics: () => void;
}

/**
 * Coalescer state
 */
export interface CoalescerState {
  isOnline: boolean;
  pendingRequests: number;
  pendingBatches: number;
  offlineQueueSize: number;
  cacheSize: number;
}

/**
 * Hook result
 */
export interface UseRequestCoalescerResult {
  state: CoalescerState;
  metrics: CoalescerMetrics;
  controls: CoalescerControls;
}

// ============================================================================
// Constants
// ============================================================================

const PRIORITY_ORDER: Record<RequestPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  background: 4,
};

const DEFAULT_CONFIG: CoalescerConfig = {
  maxBatchSize: 10,
  batchWindow: 50, // 50ms batch collection window
  deduplicationWindow: 100, // 100ms deduplication window
  defaultTimeout: 10000, // 10 second timeout
  enableCache: true,
  cacheTTL: 5000, // 5 second cache TTL
  maxCacheEntries: 100,
  enableOfflineQueue: true,
  maxOfflineQueueSize: 50,
  defaultRetries: 2,
  retryBaseDelay: 500,
  retryMaxDelay: 5000,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a cache key for a request
 */
function generateCacheKey(config: RequestConfig): string {
  if (config.cacheKey) return config.cacheKey;

  const method = config.method || "POST";
  const dataStr = config.data ? JSON.stringify(config.data) : "";
  return `${method}:${config.endpoint}:${dataStr}`;
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() - 0.5);
  return Math.round(delay + jitter);
}

/**
 * Default request executor using fetch
 */
async function defaultExecutor(config: RequestConfig): Promise<unknown> {
  const method = config.method || "POST";
  const timeout = config.timeout || 10000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(config.endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
      },
      body: config.data ? JSON.stringify(config.data) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Request coalescing hook for reduced mobile latency
 */
export function useRequestCoalescer(
  config: Partial<CoalescerConfig> = {},
  callbacks?: {
    onRequestStart?: (request: TrackedRequest) => void;
    onRequestComplete?: (request: TrackedRequest, response: unknown) => void;
    onRequestError?: (request: TrackedRequest, error: Error) => void;
    onBatchStart?: (batch: RequestBatch) => void;
    onBatchComplete?: (batch: RequestBatch) => void;
    onOfflineQueueChange?: (size: number) => void;
  }
): UseRequestCoalescerResult {
  const fullConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  // State
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // Metrics
  const [metrics, setMetrics] = useState<CoalescerMetrics>({
    totalRequests: 0,
    coalescedRequests: 0,
    batchedRequests: 0,
    failedRequests: 0,
    cancelledRequests: 0,
    averageLatencyMs: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalBatches: 0,
    averageBatchSize: 0,
    savedRequests: 0,
    savedBandwidthEstimate: 0,
  });

  // Refs
  const requestsRef = useRef<Map<string, TrackedRequest>>(new Map());
  const pendingRef = useRef<Map<string, TrackedRequest[]>>(new Map()); // Key = cache key
  const cacheRef = useRef<Map<string, { data: unknown; timestamp: number }>>(new Map());
  const offlineQueueRef = useRef<TrackedRequest[]>([]);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const batchQueueRef = useRef<TrackedRequest[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const executor = fullConfig.executor || defaultExecutor;

  // Online/offline detection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);
      // Flush offline queue when back online
      if (offlineQueueRef.current.length > 0) {
        flushOfflineQueue();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  /**
   * Execute a single request with retries
   */
  const executeRequest = useCallback(
    async (tracked: TrackedRequest): Promise<unknown> => {
      const maxRetries = tracked.config.retries ?? fullConfig.defaultRetries;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const delay = calculateBackoff(
              attempt - 1,
              fullConfig.retryBaseDelay,
              fullConfig.retryMaxDelay
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }

          tracked.retryCount = attempt;
          const result = await executor(tracked.config);
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt === maxRetries) {
            throw lastError;
          }
        }
      }

      throw lastError || new Error("Request failed after retries");
    },
    [fullConfig, executor]
  );

  /**
   * Process the batch queue
   */
  const processBatchQueue = useCallback(async () => {
    if (batchQueueRef.current.length === 0) return;

    // Sort by priority
    const sortedQueue = [...batchQueueRef.current].sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    );

    // Take up to maxBatchSize requests
    const batch = sortedQueue.slice(0, fullConfig.maxBatchSize);
    batchQueueRef.current = sortedQueue.slice(fullConfig.maxBatchSize);

    if (batch.length === 0) return;

    const batchId = `batch-${Date.now()}`;
    const batchObj: RequestBatch = {
      id: batchId,
      requests: batch,
      status: "executing",
      createdAt: Date.now(),
      executedAt: Date.now(),
    };

    callbacks?.onBatchStart?.(batchObj);

    // Update request statuses
    for (const req of batch) {
      req.batchId = batchId;
      req.status = "executing";
      req.startedAt = Date.now();
      requestsRef.current.set(req.id, req);
      callbacks?.onRequestStart?.(req);
    }

    // Execute all requests in parallel
    const results = await Promise.allSettled(
      batch.map((req) => executeRequest(req))
    );

    // Process results
    const completedAt = Date.now();
    for (let i = 0; i < batch.length; i++) {
      const req = batch[i];
      const result = results[i];

      req.completedAt = completedAt;

      if (result.status === "fulfilled") {
        req.status = "completed";

        // Update cache
        if (fullConfig.enableCache) {
          const cacheKey = generateCacheKey(req.config);
          cacheRef.current.set(cacheKey, {
            data: result.value,
            timestamp: Date.now(),
          });

          // Evict old cache entries
          if (cacheRef.current.size > fullConfig.maxCacheEntries) {
            const oldest = [...cacheRef.current.entries()]
              .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
            if (oldest) {
              cacheRef.current.delete(oldest[0]);
            }
          }
        }

        // Notify pending coalesced requests
        const cacheKey = generateCacheKey(req.config);
        const pending = pendingRef.current.get(cacheKey);
        if (pending) {
          for (const pendingReq of pending) {
            if (pendingReq.id !== req.id) {
              pendingReq.status = "completed";
              pendingReq.completedAt = completedAt;
              pendingReq.coalescedWith = req.id;
              callbacks?.onRequestComplete?.(pendingReq, result.value);
            }
          }
          pendingRef.current.delete(cacheKey);
        }

        callbacks?.onRequestComplete?.(req, result.value);
      } else {
        req.status = "failed";
        req.error = result.reason;
        callbacks?.onRequestError?.(req, result.reason);

        setMetrics((prev) => ({
          ...prev,
          failedRequests: prev.failedRequests + 1,
        }));
      }

      requestsRef.current.set(req.id, req);
    }

    batchObj.status = "completed";
    callbacks?.onBatchComplete?.(batchObj);

    setMetrics((prev) => ({
      ...prev,
      totalBatches: prev.totalBatches + 1,
      batchedRequests: prev.batchedRequests + batch.length,
      averageBatchSize:
        (prev.averageBatchSize * prev.totalBatches + batch.length) /
        (prev.totalBatches + 1),
    }));

    // Process remaining queue
    if (batchQueueRef.current.length > 0) {
      batchTimeoutRef.current = setTimeout(
        processBatchQueue,
        fullConfig.batchWindow
      );
    }
  }, [fullConfig, executeRequest, callbacks]);

  /**
   * Make a single request with deduplication
   */
  const request = useCallback(
    async <T = unknown>(
      endpoint: string,
      data?: unknown,
      options: Partial<RequestConfig> = {}
    ): Promise<CoalescedResponse<T>> => {
      const startTime = Date.now();

      const requestConfig: RequestConfig = {
        endpoint,
        method: options.method || "POST",
        data,
        priority: options.priority || "normal",
        headers: options.headers,
        timeout: options.timeout || fullConfig.defaultTimeout,
        deduplicate: options.deduplicate !== false,
        batchable: options.batchable !== false,
        cacheKey: options.cacheKey,
        retries: options.retries ?? fullConfig.defaultRetries,
      };

      const cacheKey = generateCacheKey(requestConfig);

      // Check cache first
      if (fullConfig.enableCache && requestConfig.deduplicate) {
        const cached = cacheRef.current.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < fullConfig.cacheTTL) {
          setMetrics((prev) => ({
            ...prev,
            cacheHits: prev.cacheHits + 1,
            savedRequests: prev.savedRequests + 1,
          }));

          return {
            data: cached.data as T,
            fromCache: true,
            coalescedCount: 0,
            batchId: null,
            latencyMs: Date.now() - startTime,
          };
        }
      }

      setMetrics((prev) => ({
        ...prev,
        totalRequests: prev.totalRequests + 1,
        cacheMisses: prev.cacheMisses + 1,
      }));

      const requestId = generateRequestId();
      const tracked: TrackedRequest = {
        id: requestId,
        config: requestConfig,
        status: "pending",
        priority: requestConfig.priority || "normal",
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null,
        coalescedWith: null,
        batchId: null,
        retryCount: 0,
        error: null,
      };

      requestsRef.current.set(requestId, tracked);

      // Check if we can coalesce with a pending request
      if (requestConfig.deduplicate) {
        const pending = pendingRef.current.get(cacheKey);
        if (pending && pending.length > 0) {
          // Coalesce with existing request
          tracked.status = "coalesced";
          pending.push(tracked);

          setMetrics((prev) => ({
            ...prev,
            coalescedRequests: prev.coalescedRequests + 1,
            savedRequests: prev.savedRequests + 1,
            savedBandwidthEstimate:
              prev.savedBandwidthEstimate +
              (data ? JSON.stringify(data).length : 100),
          }));

          // Wait for the original request to complete
          return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
              const req = requestsRef.current.get(requestId);
              if (req?.status === "completed" && req.coalescedWith) {
                clearInterval(checkInterval);
                const originalReq = requestsRef.current.get(req.coalescedWith);
                const cached = cacheRef.current.get(cacheKey);

                resolve({
                  data: cached?.data as T,
                  fromCache: false,
                  coalescedCount: pending.length,
                  batchId: originalReq?.batchId || null,
                  latencyMs: Date.now() - startTime,
                });
              } else if (req?.status === "failed" || req?.status === "cancelled") {
                clearInterval(checkInterval);
                reject(req.error || new Error("Request failed"));
              }
            }, 10);
          });
        } else {
          // Start new pending group
          pendingRef.current.set(cacheKey, [tracked]);
        }
      }

      // Handle offline
      if (!isOnline && fullConfig.enableOfflineQueue) {
        if (offlineQueueRef.current.length < fullConfig.maxOfflineQueueSize) {
          offlineQueueRef.current.push(tracked);
          callbacks?.onOfflineQueueChange?.(offlineQueueRef.current.length);

          return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
              const req = requestsRef.current.get(requestId);
              if (req?.status === "completed") {
                clearInterval(checkInterval);
                const cached = cacheRef.current.get(cacheKey);
                resolve({
                  data: cached?.data as T,
                  fromCache: false,
                  coalescedCount: 0,
                  batchId: req.batchId,
                  latencyMs: Date.now() - startTime,
                });
              } else if (req?.status === "failed" || req?.status === "cancelled") {
                clearInterval(checkInterval);
                reject(req.error || new Error("Request failed"));
              }
            }, 100);
          });
        }
      }

      // Add to batch queue if batchable
      if (requestConfig.batchable) {
        tracked.status = "batched";
        batchQueueRef.current.push(tracked);

        // Start batch timer if not already running
        if (!batchTimeoutRef.current) {
          batchTimeoutRef.current = setTimeout(() => {
            batchTimeoutRef.current = null;
            processBatchQueue();
          }, fullConfig.batchWindow);
        }

        // Wait for batch to complete
        return new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            const req = requestsRef.current.get(requestId);
            if (req?.status === "completed") {
              clearInterval(checkInterval);
              const cached = cacheRef.current.get(cacheKey);

              const latencyMs = Date.now() - startTime;
              setMetrics((prev) => ({
                ...prev,
                averageLatencyMs:
                  (prev.averageLatencyMs * (prev.totalRequests - 1) + latencyMs) /
                  prev.totalRequests,
              }));

              resolve({
                data: cached?.data as T,
                fromCache: false,
                coalescedCount: 0,
                batchId: req.batchId,
                latencyMs,
              });
            } else if (req?.status === "failed" || req?.status === "cancelled") {
              clearInterval(checkInterval);
              reject(req.error || new Error("Request failed"));
            }
          }, 10);
        });
      }

      // Execute immediately
      tracked.status = "executing";
      tracked.startedAt = Date.now();
      callbacks?.onRequestStart?.(tracked);

      try {
        const result = await executeRequest(tracked);

        tracked.status = "completed";
        tracked.completedAt = Date.now();

        // Update cache
        if (fullConfig.enableCache) {
          cacheRef.current.set(cacheKey, {
            data: result,
            timestamp: Date.now(),
          });
        }

        // Notify coalesced requests
        const pending = pendingRef.current.get(cacheKey);
        if (pending) {
          for (const pendingReq of pending) {
            if (pendingReq.id !== requestId) {
              pendingReq.status = "completed";
              pendingReq.completedAt = Date.now();
              pendingReq.coalescedWith = requestId;
            }
          }
          pendingRef.current.delete(cacheKey);
        }

        callbacks?.onRequestComplete?.(tracked, result);

        const latencyMs = Date.now() - startTime;
        setMetrics((prev) => ({
          ...prev,
          averageLatencyMs:
            (prev.averageLatencyMs * (prev.totalRequests - 1) + latencyMs) /
            prev.totalRequests,
        }));

        return {
          data: result as T,
          fromCache: false,
          coalescedCount: pending?.length || 0,
          batchId: null,
          latencyMs,
        };
      } catch (error) {
        tracked.status = "failed";
        tracked.error = error instanceof Error ? error : new Error(String(error));
        tracked.completedAt = Date.now();

        // Notify coalesced requests of failure
        const pending = pendingRef.current.get(cacheKey);
        if (pending) {
          for (const pendingReq of pending) {
            if (pendingReq.id !== requestId) {
              pendingReq.status = "failed";
              pendingReq.error = tracked.error;
              pendingReq.completedAt = Date.now();
            }
          }
          pendingRef.current.delete(cacheKey);
        }

        callbacks?.onRequestError?.(tracked, tracked.error);

        setMetrics((prev) => ({
          ...prev,
          failedRequests: prev.failedRequests + 1,
        }));

        throw tracked.error;
      }
    },
    [fullConfig, isOnline, executeRequest, processBatchQueue, callbacks]
  );

  /**
   * Make a batch request
   */
  const batchRequest = useCallback(
    async <T = unknown>(requests: RequestConfig[]): Promise<BatchResponse<T>> => {
      const startTime = Date.now();
      const batchId = `batch-${Date.now()}`;

      const trackedRequests: TrackedRequest[] = requests.map((config) => ({
        id: generateRequestId(),
        config,
        status: "batched" as const,
        priority: config.priority || "normal",
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null,
        coalescedWith: null,
        batchId,
        retryCount: 0,
        error: null,
      }));

      for (const tracked of trackedRequests) {
        requestsRef.current.set(tracked.id, tracked);
      }

      setMetrics((prev) => ({
        ...prev,
        totalRequests: prev.totalRequests + requests.length,
      }));

      const batchObj: RequestBatch = {
        id: batchId,
        requests: trackedRequests,
        status: "executing",
        createdAt: Date.now(),
        executedAt: Date.now(),
      };

      callbacks?.onBatchStart?.(batchObj);

      // Execute all requests in parallel
      const results = await Promise.allSettled(
        trackedRequests.map(async (req) => {
          req.status = "executing";
          req.startedAt = Date.now();
          callbacks?.onRequestStart?.(req);

          try {
            const result = await executeRequest(req);
            req.status = "completed";
            req.completedAt = Date.now();

            // Update cache
            if (fullConfig.enableCache) {
              const cacheKey = generateCacheKey(req.config);
              cacheRef.current.set(cacheKey, {
                data: result,
                timestamp: Date.now(),
              });
            }

            callbacks?.onRequestComplete?.(req, result);
            return { requestId: req.id, data: result };
          } catch (error) {
            req.status = "failed";
            req.error = error instanceof Error ? error : new Error(String(error));
            req.completedAt = Date.now();
            callbacks?.onRequestError?.(req, req.error);
            throw { requestId: req.id, error: req.error };
          }
        })
      );

      const mappedResults = results.map((result, index) => {
        if (result.status === "fulfilled") {
          return {
            success: true,
            data: result.value.data as T,
            requestId: trackedRequests[index].id,
          };
        } else {
          return {
            success: false,
            error: result.reason.error,
            requestId: trackedRequests[index].id,
          };
        }
      });

      const failedCount = mappedResults.filter((r) => !r.success).length;

      batchObj.status = "completed";
      callbacks?.onBatchComplete?.(batchObj);

      setMetrics((prev) => ({
        ...prev,
        totalBatches: prev.totalBatches + 1,
        batchedRequests: prev.batchedRequests + requests.length,
        failedRequests: prev.failedRequests + failedCount,
        averageBatchSize:
          (prev.averageBatchSize * (prev.totalBatches) + requests.length) /
          (prev.totalBatches + 1),
      }));

      return {
        results: mappedResults,
        totalLatencyMs: Date.now() - startTime,
        batchId,
      };
    },
    [fullConfig, executeRequest, callbacks]
  );

  /**
   * Cancel a specific request
   */
  const cancel = useCallback((requestId: string) => {
    const request = requestsRef.current.get(requestId);
    if (!request) return;

    const controller = abortControllersRef.current.get(requestId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(requestId);
    }

    request.status = "cancelled";
    request.completedAt = Date.now();
    requestsRef.current.set(requestId, request);

    // Remove from batch queue
    batchQueueRef.current = batchQueueRef.current.filter(
      (r) => r.id !== requestId
    );

    setMetrics((prev) => ({
      ...prev,
      cancelledRequests: prev.cancelledRequests + 1,
    }));
  }, []);

  /**
   * Cancel all pending requests
   */
  const cancelAll = useCallback(() => {
    for (const [, controller] of abortControllersRef.current) {
      controller.abort();
    }
    abortControllersRef.current.clear();

    for (const [id, request] of requestsRef.current) {
      if (request.status === "pending" || request.status === "batched" || request.status === "executing") {
        request.status = "cancelled";
        request.completedAt = Date.now();
        requestsRef.current.set(id, request);
      }
    }

    batchQueueRef.current = [];

    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
  }, []);

  /**
   * Clear the response cache
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  /**
   * Flush offline queue
   */
  const flushOfflineQueue = useCallback(async () => {
    if (!isOnline || offlineQueueRef.current.length === 0) return;

    const queue = [...offlineQueueRef.current];
    offlineQueueRef.current = [];
    callbacks?.onOfflineQueueChange?.(0);

    for (const tracked of queue) {
      batchQueueRef.current.push(tracked);
    }

    if (!batchTimeoutRef.current && batchQueueRef.current.length > 0) {
      batchTimeoutRef.current = setTimeout(() => {
        batchTimeoutRef.current = null;
        processBatchQueue();
      }, fullConfig.batchWindow);
    }
  }, [isOnline, fullConfig.batchWindow, processBatchQueue, callbacks]);

  /**
   * Get pending request count
   */
  const getPendingCount = useCallback((): number => {
    let count = 0;
    for (const request of requestsRef.current.values()) {
      if (
        request.status === "pending" ||
        request.status === "batched" ||
        request.status === "executing"
      ) {
        count++;
      }
    }
    return count;
  }, []);

  /**
   * Get request status
   */
  const getRequestStatus = useCallback(
    (requestId: string): TrackedRequest | null => {
      return requestsRef.current.get(requestId) || null;
    },
    []
  );

  /**
   * Reset metrics
   */
  const resetMetrics = useCallback(() => {
    setMetrics({
      totalRequests: 0,
      coalescedRequests: 0,
      batchedRequests: 0,
      failedRequests: 0,
      cancelledRequests: 0,
      averageLatencyMs: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalBatches: 0,
      averageBatchSize: 0,
      savedRequests: 0,
      savedBandwidthEstimate: 0,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAll();
    };
  }, [cancelAll]);

  // Compute state
  const state: CoalescerState = useMemo(
    () => ({
      isOnline,
      pendingRequests: getPendingCount(),
      pendingBatches: batchQueueRef.current.length > 0 ? 1 : 0,
      offlineQueueSize: offlineQueueRef.current.length,
      cacheSize: cacheRef.current.size,
    }),
    [isOnline, getPendingCount]
  );

  const controls: CoalescerControls = useMemo(
    () => ({
      request,
      batchRequest,
      cancel,
      cancelAll,
      clearCache,
      flushOfflineQueue,
      getPendingCount,
      getRequestStatus,
      resetMetrics,
    }),
    [
      request,
      batchRequest,
      cancel,
      cancelAll,
      clearCache,
      flushOfflineQueue,
      getPendingCount,
      getRequestStatus,
      resetMetrics,
    ]
  );

  return {
    state,
    metrics,
    controls,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Simple request hook with automatic deduplication
 */
export function useCoalescedRequest<T = unknown>(
  endpoint: string,
  options?: Partial<CoalescerConfig>
): {
  execute: (data?: unknown) => Promise<T>;
  isLoading: boolean;
  error: Error | null;
} {
  const { controls } = useRequestCoalescer(options);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (data?: unknown): Promise<T> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await controls.request<T>(endpoint, data);
        return response.data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [endpoint, controls]
  );

  return { execute, isLoading, error };
}

/**
 * Hook for chat-specific request coalescing
 */
export function useChatRequestCoalescer(
  config?: Partial<CoalescerConfig>
): UseRequestCoalescerResult {
  return useRequestCoalescer({
    maxBatchSize: 1, // Chat requests shouldn't be batched
    batchWindow: 0,
    deduplicationWindow: 500, // Longer dedup window for chat
    defaultTimeout: 30000, // 30 second timeout for LLM responses
    enableCache: false, // Don't cache chat responses
    ...config,
  });
}

export default useRequestCoalescer;
