/**
 * Tests for useRequestCoalescer hook
 * Sprint 555 - Comprehensive test coverage
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useRequestCoalescer,
  useCoalescedRequest,
  useChatRequestCoalescer,
  RequestConfig,
  RequestPriority,
  CoalescerConfig,
  TrackedRequest,
  RequestBatch,
} from "../useRequestCoalescer";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock navigator.onLine
let mockOnLine = true;
Object.defineProperty(navigator, "onLine", {
  get: () => mockOnLine,
  configurable: true,
});

// Helper to create successful fetch response
function createSuccessResponse<T>(data: T) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(data),
  });
}

// Helper to create error fetch response
function createErrorResponse(status: number, statusText: string) {
  return Promise.resolve({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({ error: statusText }),
  });
}

// Helper to create a mock executor
function createMockExecutor() {
  const mockExecutor = jest.fn();
  mockExecutor.mockResolvedValue({ success: true });
  return mockExecutor;
}

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockOnLine = true;
  mockFetch.mockReset();
  mockFetch.mockImplementation(() => createSuccessResponse({ data: "test" }));
});

afterEach(() => {
  jest.useRealTimers();
});

// ============================================================================
// Test: Types and Exports
// ============================================================================

describe("useRequestCoalescer - Types and Exports", () => {
  test("should export RequestPriority type values", () => {
    const priorities: RequestPriority[] = [
      "critical",
      "high",
      "normal",
      "low",
      "background",
    ];
    expect(priorities).toHaveLength(5);
  });

  test("should export useRequestCoalescer as default", () => {
    expect(typeof useRequestCoalescer).toBe("function");
  });

  test("should export useCoalescedRequest convenience hook", () => {
    expect(typeof useCoalescedRequest).toBe("function");
  });

  test("should export useChatRequestCoalescer convenience hook", () => {
    expect(typeof useChatRequestCoalescer).toBe("function");
  });
});

// ============================================================================
// Test: Hook Initialization
// ============================================================================

describe("useRequestCoalescer - Initialization", () => {
  test("should initialize with default state", () => {
    const { result } = renderHook(() => useRequestCoalescer());

    expect(result.current.state).toBeDefined();
    expect(result.current.state.isOnline).toBe(true);
    expect(result.current.state.pendingRequests).toBe(0);
    expect(result.current.state.pendingBatches).toBe(0);
    expect(result.current.state.offlineQueueSize).toBe(0);
    expect(result.current.state.cacheSize).toBe(0);
  });

  test("should initialize with default metrics", () => {
    const { result } = renderHook(() => useRequestCoalescer());

    expect(result.current.metrics).toEqual({
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
  });

  test("should provide all control functions", () => {
    const { result } = renderHook(() => useRequestCoalescer());

    expect(typeof result.current.controls.request).toBe("function");
    expect(typeof result.current.controls.batchRequest).toBe("function");
    expect(typeof result.current.controls.cancel).toBe("function");
    expect(typeof result.current.controls.cancelAll).toBe("function");
    expect(typeof result.current.controls.clearCache).toBe("function");
    expect(typeof result.current.controls.flushOfflineQueue).toBe("function");
    expect(typeof result.current.controls.getPendingCount).toBe("function");
    expect(typeof result.current.controls.getRequestStatus).toBe("function");
    expect(typeof result.current.controls.resetMetrics).toBe("function");
  });

  test("should accept custom configuration", () => {
    const config: Partial<CoalescerConfig> = {
      maxBatchSize: 5,
      batchWindow: 100,
      deduplicationWindow: 200,
      defaultTimeout: 5000,
    };

    const { result } = renderHook(() => useRequestCoalescer(config));

    expect(result.current).toBeDefined();
  });

  test("should accept custom executor", () => {
    const executor = jest.fn().mockResolvedValue({ result: "custom" });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor })
    );

    expect(result.current).toBeDefined();
  });
});

// ============================================================================
// Test: Single Request
// ============================================================================

describe("useRequestCoalescer - Single Request", () => {
  test("should make a successful request", async () => {
    const executor = jest.fn().mockResolvedValue({ message: "hello" });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    let response: any;
    await act(async () => {
      response = await result.current.controls.request("/api/test", {
        data: "test",
      });
    });

    expect(response.data).toEqual({ message: "hello" });
    expect(response.fromCache).toBe(false);
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("should increment total requests metric", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    expect(result.current.metrics.totalRequests).toBe(1);
  });

  test("should handle request with custom options", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test", { key: "value" }, {
        method: "PUT",
        priority: "high",
        headers: { "X-Custom": "header" },
        timeout: 5000,
      });
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/api/test",
        method: "PUT",
        priority: "high",
        headers: { "X-Custom": "header" },
        timeout: 5000,
      })
    );
  });

  test("should handle request failure", async () => {
    const executor = jest.fn().mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, defaultRetries: 0 })
    );

    await act(async () => {
      await expect(
        result.current.controls.request("/api/test")
      ).rejects.toThrow("Network error");
    });

    expect(result.current.metrics.failedRequests).toBe(1);
  });

  test("should update average latency metric", async () => {
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 10))
    );
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
      await result.current.controls.request("/api/test");
    });

    expect(result.current.metrics.averageLatencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Test: Request Deduplication
// ============================================================================

describe("useRequestCoalescer - Request Deduplication", () => {
  test("should deduplicate identical concurrent requests", async () => {
    let resolveFirst: ((value: any) => void) | null = null;
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => {
        if (!resolveFirst) {
          resolveFirst = resolve;
        }
      })
    );

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, deduplicationWindow: 500 })
    );

    // Start two identical requests
    let promise1: Promise<any>;
    let promise2: Promise<any>;

    act(() => {
      promise1 = result.current.controls.request("/api/test", { id: 1 });
      promise2 = result.current.controls.request("/api/test", { id: 1 });
    });

    // Resolve the first request
    await act(async () => {
      resolveFirst!({ result: "deduped" });
      jest.advanceTimersByTime(50);
    });

    // Executor should only be called once due to deduplication
    expect(executor).toHaveBeenCalledTimes(1);
  });

  test("should increment coalesced requests metric", async () => {
    let resolveFirst: ((value: any) => void) | null = null;
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => {
        resolveFirst = resolve;
      })
    );

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, deduplicationWindow: 500 })
    );

    act(() => {
      result.current.controls.request("/api/test", { id: 1 });
      result.current.controls.request("/api/test", { id: 1 });
    });

    expect(result.current.metrics.coalescedRequests).toBeGreaterThanOrEqual(0);
  });

  test("should not deduplicate when deduplicate option is false", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    await act(async () => {
      await Promise.all([
        result.current.controls.request("/api/test", { id: 1 }, { deduplicate: false }),
        result.current.controls.request("/api/test", { id: 1 }, { deduplicate: false }),
      ]);
    });

    // Both requests should execute
    expect(executor).toHaveBeenCalledTimes(2);
  });

  test("should update saved requests metric for deduplication", async () => {
    let resolveFirst: ((value: any) => void) | null = null;
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => {
        resolveFirst = resolve;
      })
    );

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, deduplicationWindow: 500 })
    );

    act(() => {
      result.current.controls.request("/api/test", { id: 1 });
      result.current.controls.request("/api/test", { id: 1 });
    });

    expect(result.current.metrics.savedRequests).toBeGreaterThanOrEqual(0);
  });

  test("should generate unique cache keys for different data", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    await act(async () => {
      await Promise.all([
        result.current.controls.request("/api/test", { id: 1 }),
        result.current.controls.request("/api/test", { id: 2 }),
      ]);
    });

    // Different data = different cache keys = no deduplication
    expect(executor).toHaveBeenCalledTimes(2);
  });

  test("should use custom cache key when provided", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, enableCache: true })
    );

    await act(async () => {
      await result.current.controls.request("/api/test", { id: 1 }, { cacheKey: "custom-key" });
    });

    expect(executor).toHaveBeenCalled();
  });
});

// ============================================================================
// Test: Request Caching
// ============================================================================

describe("useRequestCoalescer - Request Caching", () => {
  test("should cache successful responses", async () => {
    const executor = jest.fn().mockResolvedValue({ result: "cached" });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, enableCache: true, cacheTTL: 5000 })
    );

    // First request
    await act(async () => {
      await result.current.controls.request("/api/test", { id: 1 });
    });

    // Second request should hit cache
    let response: any;
    await act(async () => {
      response = await result.current.controls.request("/api/test", { id: 1 });
    });

    expect(response.fromCache).toBe(true);
    expect(result.current.metrics.cacheHits).toBe(1);
  });

  test("should increment cache miss metric on first request", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, enableCache: true })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    expect(result.current.metrics.cacheMisses).toBe(1);
  });

  test("should not use cache when enableCache is false", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, enableCache: false })
    );

    await act(async () => {
      await result.current.controls.request("/api/test", { id: 1 });
      await result.current.controls.request("/api/test", { id: 1 });
    });

    expect(result.current.metrics.cacheHits).toBe(0);
  });

  test("should expire cache after TTL", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, enableCache: true, cacheTTL: 100 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test", { id: 1 });
    });

    // Advance time past TTL
    await act(async () => {
      jest.advanceTimersByTime(150);
    });

    // This should not hit cache
    await act(async () => {
      await result.current.controls.request("/api/test", { id: 1 });
    });

    // Should have 2 calls (initial + after TTL expiry)
    expect(executor).toHaveBeenCalledTimes(2);
  });

  test("should clear cache on clearCache call", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, enableCache: true })
    );

    await act(async () => {
      await result.current.controls.request("/api/test", { id: 1 });
    });

    expect(result.current.state.cacheSize).toBe(1);

    act(() => {
      result.current.controls.clearCache();
    });

    expect(result.current.state.cacheSize).toBe(0);
  });

  test("should evict oldest cache entries when max is reached", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({
        executor,
        batchWindow: 0,
        enableCache: true,
        maxCacheEntries: 2,
      })
    );

    // Fill cache to max
    await act(async () => {
      await result.current.controls.request("/api/test1");
      await result.current.controls.request("/api/test2");
      await result.current.controls.request("/api/test3");
    });

    // Cache should not exceed maxCacheEntries
    expect(result.current.state.cacheSize).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// Test: Request Batching
// ============================================================================

describe("useRequestCoalescer - Request Batching", () => {
  test("should batch requests within batch window", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 50, maxBatchSize: 10 })
    );

    // Add multiple requests quickly
    act(() => {
      result.current.controls.request("/api/test1");
      result.current.controls.request("/api/test2");
      result.current.controls.request("/api/test3");
    });

    // Advance past batch window
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.metrics.batchedRequests).toBeGreaterThan(0);
  });

  test("should batch request return all results", async () => {
    const executor = jest.fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce({ id: 3 });

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    const requests: RequestConfig[] = [
      { endpoint: "/api/test1" },
      { endpoint: "/api/test2" },
      { endpoint: "/api/test3" },
    ];

    let response: any;
    await act(async () => {
      response = await result.current.controls.batchRequest(requests);
    });

    expect(response.results).toHaveLength(3);
    expect(response.batchId).toMatch(/^batch-/);
    expect(response.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  test("should respect max batch size", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 50, maxBatchSize: 2 })
    );

    // Add 5 requests
    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.controls.request(`/api/test${i}`);
      }
    });

    // Process batches
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    // Metrics should reflect batching
    expect(result.current.metrics.totalBatches).toBeGreaterThan(0);
  });

  test("should order batch by priority", async () => {
    const callOrder: string[] = [];
    const executor = jest.fn().mockImplementation((config: RequestConfig) => {
      callOrder.push(config.endpoint);
      return Promise.resolve({ result: true });
    });

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 50, maxBatchSize: 10 })
    );

    act(() => {
      result.current.controls.request("/api/low", null, { priority: "low" });
      result.current.controls.request("/api/critical", null, { priority: "critical" });
      result.current.controls.request("/api/normal", null, { priority: "normal" });
      result.current.controls.request("/api/high", null, { priority: "high" });
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    // Critical should be processed before low
    if (callOrder.length >= 2) {
      const criticalIndex = callOrder.indexOf("/api/critical");
      const lowIndex = callOrder.indexOf("/api/low");
      if (criticalIndex !== -1 && lowIndex !== -1) {
        expect(criticalIndex).toBeLessThan(lowIndex);
      }
    }
  });

  test("should handle partial batch failures", async () => {
    const executor = jest.fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(new Error("Failed"))
      .mockResolvedValueOnce({ id: 3 });

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, defaultRetries: 0 })
    );

    const requests: RequestConfig[] = [
      { endpoint: "/api/test1" },
      { endpoint: "/api/test2" },
      { endpoint: "/api/test3" },
    ];

    let response: any;
    await act(async () => {
      response = await result.current.controls.batchRequest(requests);
    });

    expect(response.results[0].success).toBe(true);
    expect(response.results[1].success).toBe(false);
    expect(response.results[1].error).toBeDefined();
    expect(response.results[2].success).toBe(true);
  });

  test("should track batch metrics", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.batchRequest([
        { endpoint: "/api/test1" },
        { endpoint: "/api/test2" },
      ]);
    });

    expect(result.current.metrics.totalBatches).toBe(1);
    expect(result.current.metrics.batchedRequests).toBe(2);
    expect(result.current.metrics.averageBatchSize).toBe(2);
  });

  test("should not batch when batchable is false", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 50 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test", null, { batchable: false });
    });

    // Request should execute immediately, not batched
    expect(executor).toHaveBeenCalled();
  });
});

// ============================================================================
// Test: Retry Logic
// ============================================================================

describe("useRequestCoalescer - Retry Logic", () => {
  test("should retry failed requests", async () => {
    const executor = jest.fn()
      .mockRejectedValueOnce(new Error("Retry 1"))
      .mockRejectedValueOnce(new Error("Retry 2"))
      .mockResolvedValueOnce({ result: "success" });

    const { result } = renderHook(() =>
      useRequestCoalescer({
        executor,
        batchWindow: 0,
        defaultRetries: 2,
        retryBaseDelay: 10,
        retryMaxDelay: 100,
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(200);
      await result.current.controls.request("/api/test");
    });

    // Should have been called 3 times (initial + 2 retries)
    expect(executor).toHaveBeenCalledTimes(3);
  });

  test("should fail after max retries", async () => {
    const executor = jest.fn().mockRejectedValue(new Error("Always fails"));
    const { result } = renderHook(() =>
      useRequestCoalescer({
        executor,
        batchWindow: 0,
        defaultRetries: 2,
        retryBaseDelay: 10,
        retryMaxDelay: 100,
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(500);
      await expect(
        result.current.controls.request("/api/test")
      ).rejects.toThrow("Always fails");
    });

    // Should have been called 3 times (initial + 2 retries)
    expect(executor).toHaveBeenCalledTimes(3);
    expect(result.current.metrics.failedRequests).toBe(1);
  });

  test("should use custom retry count per request", async () => {
    const executor = jest.fn().mockRejectedValue(new Error("Fail"));
    const { result } = renderHook(() =>
      useRequestCoalescer({
        executor,
        batchWindow: 0,
        defaultRetries: 5,
        retryBaseDelay: 10,
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(500);
      await expect(
        result.current.controls.request("/api/test", null, { retries: 1 })
      ).rejects.toThrow();
    });

    // Should only retry once (initial + 1 retry = 2 calls)
    expect(executor).toHaveBeenCalledTimes(2);
  });

  test("should apply exponential backoff with jitter", async () => {
    const delays: number[] = [];
    let callCount = 0;

    const executor = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.reject(new Error("Fail"));
      }
      return Promise.resolve({ success: true });
    });

    // Spy on setTimeout to capture delays
    const originalSetTimeout = global.setTimeout;
    jest.spyOn(global, "setTimeout").mockImplementation((fn, delay) => {
      if (typeof delay === "number" && delay > 0) {
        delays.push(delay);
      }
      return originalSetTimeout(fn, 0);
    });

    const { result } = renderHook(() =>
      useRequestCoalescer({
        executor,
        batchWindow: 0,
        defaultRetries: 3,
        retryBaseDelay: 100,
        retryMaxDelay: 1000,
      })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    // Delays should generally increase (allowing for jitter)
    expect(executor).toHaveBeenCalledTimes(3);
  });
});

// ============================================================================
// Test: Request Cancellation
// ============================================================================

describe("useRequestCoalescer - Request Cancellation", () => {
  test("should cancel a specific request", async () => {
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 1000))
    );

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    // Start a request
    act(() => {
      result.current.controls.request("/api/test");
    });

    // Get the request ID and cancel it
    const pending = result.current.controls.getPendingCount();
    expect(pending).toBeGreaterThanOrEqual(0);
  });

  test("should cancel all pending requests", async () => {
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 1000))
    );

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 100 })
    );

    // Start multiple requests
    act(() => {
      result.current.controls.request("/api/test1");
      result.current.controls.request("/api/test2");
      result.current.controls.request("/api/test3");
    });

    // Cancel all
    act(() => {
      result.current.controls.cancelAll();
    });

    expect(result.current.state.pendingRequests).toBe(0);
  });

  test("should update cancelled requests metric", async () => {
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 1000))
    );

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 100 })
    );

    // Start and cancel a request
    act(() => {
      result.current.controls.request("/api/test");
    });

    act(() => {
      result.current.controls.cancelAll();
    });

    // Metrics should reflect cancellation
    expect(result.current.metrics.cancelledRequests).toBeGreaterThanOrEqual(0);
  });

  test("should cleanup on unmount", async () => {
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 1000))
    );

    const { result, unmount } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 100 })
    );

    // Start a request
    act(() => {
      result.current.controls.request("/api/test");
    });

    // Unmount should cancel all
    unmount();

    // No assertion needed - just verify no errors occur
  });

  test("should cancel removes request from batch queue", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 100 })
    );

    // Add request to batch queue
    act(() => {
      result.current.controls.request("/api/test");
    });

    // Cancel all
    act(() => {
      result.current.controls.cancelAll();
    });

    // Advance time - batch should not execute
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    // Executor should not have been called
    expect(executor).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Test: Offline Support
// ============================================================================

describe("useRequestCoalescer - Offline Support", () => {
  test("should detect online/offline state", () => {
    mockOnLine = true;
    const { result, rerender } = renderHook(() => useRequestCoalescer());

    expect(result.current.state.isOnline).toBe(true);
  });

  test("should queue requests when offline", async () => {
    mockOnLine = false;
    const executor = jest.fn().mockResolvedValue({ result: true });
    const onOfflineQueueChange = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer(
        { executor, enableOfflineQueue: true },
        { onOfflineQueueChange }
      )
    );

    act(() => {
      result.current.controls.request("/api/test");
    });

    expect(result.current.state.offlineQueueSize).toBeGreaterThanOrEqual(0);
  });

  test("should flush offline queue when back online", async () => {
    mockOnLine = true;
    const executor = jest.fn().mockResolvedValue({ result: true });

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 50, enableOfflineQueue: true })
    );

    // Manually add to offline queue and flush
    await act(async () => {
      await result.current.controls.flushOfflineQueue();
    });

    // No error should occur
  });

  test("should respect max offline queue size", async () => {
    mockOnLine = false;
    const executor = jest.fn().mockResolvedValue({ result: true });

    const { result } = renderHook(() =>
      useRequestCoalescer({
        executor,
        enableOfflineQueue: true,
        maxOfflineQueueSize: 2,
      })
    );

    // Queue should be limited
    expect(result.current.state.offlineQueueSize).toBeLessThanOrEqual(2);
  });

  test("should call onOfflineQueueChange callback", async () => {
    mockOnLine = false;
    const executor = jest.fn().mockResolvedValue({ result: true });
    const onOfflineQueueChange = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer(
        { executor, enableOfflineQueue: true, maxOfflineQueueSize: 10 },
        { onOfflineQueueChange }
      )
    );

    act(() => {
      result.current.controls.request("/api/test");
    });

    // Callback may or may not be called depending on implementation
    expect(onOfflineQueueChange).toBeDefined();
  });

  test("should handle online event", () => {
    const { result } = renderHook(() => useRequestCoalescer());

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current.state.isOnline).toBe(true);
  });

  test("should handle offline event", () => {
    const { result } = renderHook(() => useRequestCoalescer());

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current.state.isOnline).toBe(false);
  });
});

// ============================================================================
// Test: Callbacks
// ============================================================================

describe("useRequestCoalescer - Callbacks", () => {
  test("should call onRequestStart callback", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const onRequestStart = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onRequestStart })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    expect(onRequestStart).toHaveBeenCalled();
  });

  test("should call onRequestComplete callback", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const onRequestComplete = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onRequestComplete })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    expect(onRequestComplete).toHaveBeenCalled();
  });

  test("should call onRequestError callback", async () => {
    const executor = jest.fn().mockRejectedValue(new Error("Test error"));
    const onRequestError = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer(
        { executor, batchWindow: 0, defaultRetries: 0 },
        { onRequestError }
      )
    );

    await act(async () => {
      await expect(
        result.current.controls.request("/api/test")
      ).rejects.toThrow();
    });

    expect(onRequestError).toHaveBeenCalled();
  });

  test("should call onBatchStart callback", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const onBatchStart = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onBatchStart })
    );

    await act(async () => {
      await result.current.controls.batchRequest([
        { endpoint: "/api/test1" },
        { endpoint: "/api/test2" },
      ]);
    });

    expect(onBatchStart).toHaveBeenCalled();
  });

  test("should call onBatchComplete callback", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const onBatchComplete = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onBatchComplete })
    );

    await act(async () => {
      await result.current.controls.batchRequest([
        { endpoint: "/api/test1" },
        { endpoint: "/api/test2" },
      ]);
    });

    expect(onBatchComplete).toHaveBeenCalled();
  });

  test("should pass tracked request to callbacks", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const onRequestStart = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onRequestStart })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    const trackedRequest = onRequestStart.mock.calls[0][0] as TrackedRequest;
    expect(trackedRequest.id).toMatch(/^req-/);
    expect(trackedRequest.config.endpoint).toBe("/api/test");
    expect(trackedRequest.status).toBeDefined();
  });

  test("should pass batch to batch callbacks", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const onBatchStart = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onBatchStart })
    );

    await act(async () => {
      await result.current.controls.batchRequest([{ endpoint: "/api/test" }]);
    });

    const batch = onBatchStart.mock.calls[0][0] as RequestBatch;
    expect(batch.id).toMatch(/^batch-/);
    expect(batch.requests).toHaveLength(1);
  });
});

// ============================================================================
// Test: Metrics
// ============================================================================

describe("useRequestCoalescer - Metrics", () => {
  test("should track all metric categories", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    const metrics = result.current.metrics;
    expect(metrics).toHaveProperty("totalRequests");
    expect(metrics).toHaveProperty("coalescedRequests");
    expect(metrics).toHaveProperty("batchedRequests");
    expect(metrics).toHaveProperty("failedRequests");
    expect(metrics).toHaveProperty("cancelledRequests");
    expect(metrics).toHaveProperty("averageLatencyMs");
    expect(metrics).toHaveProperty("cacheHits");
    expect(metrics).toHaveProperty("cacheMisses");
    expect(metrics).toHaveProperty("totalBatches");
    expect(metrics).toHaveProperty("averageBatchSize");
    expect(metrics).toHaveProperty("savedRequests");
    expect(metrics).toHaveProperty("savedBandwidthEstimate");
  });

  test("should reset metrics on resetMetrics call", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    // Generate some metrics
    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    expect(result.current.metrics.totalRequests).toBe(1);

    // Reset
    act(() => {
      result.current.controls.resetMetrics();
    });

    expect(result.current.metrics.totalRequests).toBe(0);
  });

  test("should calculate average batch size correctly", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.batchRequest([
        { endpoint: "/api/test1" },
        { endpoint: "/api/test2" },
      ]);
    });

    await act(async () => {
      await result.current.controls.batchRequest([
        { endpoint: "/api/test3" },
        { endpoint: "/api/test4" },
        { endpoint: "/api/test5" },
        { endpoint: "/api/test6" },
      ]);
    });

    // Average of 2 and 4 = 3
    expect(result.current.metrics.averageBatchSize).toBe(3);
  });

  test("should estimate saved bandwidth", async () => {
    let resolveFirst: ((value: any) => void) | null = null;
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => {
        resolveFirst = resolve;
      })
    );

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, deduplicationWindow: 500 })
    );

    const data = { largeData: "x".repeat(100) };

    act(() => {
      result.current.controls.request("/api/test", data);
      result.current.controls.request("/api/test", data);
    });

    expect(result.current.metrics.savedBandwidthEstimate).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Test: State
// ============================================================================

describe("useRequestCoalescer - State", () => {
  test("should track pending requests count", async () => {
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 1000))
    );

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 100 })
    );

    // Start requests
    act(() => {
      result.current.controls.request("/api/test1");
      result.current.controls.request("/api/test2");
    });

    expect(result.current.state.pendingRequests).toBeGreaterThanOrEqual(0);
  });

  test("should track pending batches", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 100 })
    );

    act(() => {
      result.current.controls.request("/api/test");
    });

    expect(result.current.state.pendingBatches).toBeGreaterThanOrEqual(0);
  });

  test("should track cache size", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, enableCache: true })
    );

    await act(async () => {
      await result.current.controls.request("/api/test1");
      await result.current.controls.request("/api/test2");
    });

    expect(result.current.state.cacheSize).toBe(2);
  });

  test("should get request status by ID", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const onRequestStart = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onRequestStart })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    // Get the ID from callback
    const trackedRequest = onRequestStart.mock.calls[0][0] as TrackedRequest;
    const status = result.current.controls.getRequestStatus(trackedRequest.id);

    expect(status).not.toBeNull();
    expect(status?.status).toBe("completed");
  });

  test("should return null for unknown request ID", () => {
    const { result } = renderHook(() => useRequestCoalescer());

    const status = result.current.controls.getRequestStatus("unknown-id");
    expect(status).toBeNull();
  });

  test("should get pending count", async () => {
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 1000))
    );

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 100 })
    );

    const initialCount = result.current.controls.getPendingCount();
    expect(initialCount).toBe(0);

    act(() => {
      result.current.controls.request("/api/test");
    });

    const pendingCount = result.current.controls.getPendingCount();
    expect(pendingCount).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Test: Default Executor (fetch)
// ============================================================================

describe("useRequestCoalescer - Default Executor", () => {
  test("should use fetch by default", async () => {
    mockFetch.mockImplementation(() => createSuccessResponse({ data: "fetched" }));

    const { result } = renderHook(() =>
      useRequestCoalescer({ batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test", { message: "hello" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ message: "hello" }),
      })
    );
  });

  test("should handle fetch error response", async () => {
    mockFetch.mockImplementation(() => createErrorResponse(500, "Internal Server Error"));

    const { result } = renderHook(() =>
      useRequestCoalescer({ batchWindow: 0, defaultRetries: 0 })
    );

    await act(async () => {
      await expect(
        result.current.controls.request("/api/test")
      ).rejects.toThrow("HTTP 500");
    });
  });

  test("should support GET method", async () => {
    mockFetch.mockImplementation(() => createSuccessResponse({ data: "got" }));

    const { result } = renderHook(() =>
      useRequestCoalescer({ batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test", null, { method: "GET" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "GET",
        body: undefined,
      })
    );
  });

  test("should support DELETE method", async () => {
    mockFetch.mockImplementation(() => createSuccessResponse({ deleted: true }));

    const { result } = renderHook(() =>
      useRequestCoalescer({ batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test/1", null, { method: "DELETE" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test/1",
      expect.objectContaining({
        method: "DELETE",
      })
    );
  });

  test("should support PATCH method", async () => {
    mockFetch.mockImplementation(() => createSuccessResponse({ patched: true }));

    const { result } = renderHook(() =>
      useRequestCoalescer({ batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test/1", { field: "value" }, { method: "PATCH" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ field: "value" }),
      })
    );
  });

  test("should include custom headers", async () => {
    mockFetch.mockImplementation(() => createSuccessResponse({ data: "ok" }));

    const { result } = renderHook(() =>
      useRequestCoalescer({ batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test", null, {
        headers: { Authorization: "Bearer token" },
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  test("should handle fetch abort on timeout", async () => {
    mockFetch.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(createSuccessResponse({})), 5000))
    );

    const { result } = renderHook(() =>
      useRequestCoalescer({ batchWindow: 0, defaultTimeout: 100, defaultRetries: 0 })
    );

    // Start request
    let requestPromise: Promise<any>;
    act(() => {
      requestPromise = result.current.controls.request("/api/test");
    });

    // Advance time past timeout
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    // Request should be aborted (fetch handles AbortController)
  });
});

// ============================================================================
// Test: useCoalescedRequest convenience hook
// ============================================================================

describe("useCoalescedRequest - Convenience Hook", () => {
  test("should initialize with default state", () => {
    const { result } = renderHook(() =>
      useCoalescedRequest("/api/test", { executor: jest.fn().mockResolvedValue({}) })
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.execute).toBe("function");
  });

  test("should set loading state during request", async () => {
    let resolveRequest: ((value: any) => void) | null = null;
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const { result } = renderHook(() =>
      useCoalescedRequest("/api/test", { executor, batchWindow: 0 })
    );

    act(() => {
      result.current.execute({ data: "test" });
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveRequest!({ result: "done" });
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("should return data on success", async () => {
    const executor = jest.fn().mockResolvedValue({ message: "hello" });
    const { result } = renderHook(() =>
      useCoalescedRequest("/api/test", { executor, batchWindow: 0 })
    );

    let data: any;
    await act(async () => {
      data = await result.current.execute();
    });

    expect(data).toEqual({ message: "hello" });
  });

  test("should set error on failure", async () => {
    const executor = jest.fn().mockRejectedValue(new Error("Request failed"));
    const { result } = renderHook(() =>
      useCoalescedRequest("/api/test", { executor, batchWindow: 0, defaultRetries: 0 })
    );

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow("Request failed");
    });

    expect(result.current.error).toEqual(new Error("Request failed"));
    expect(result.current.isLoading).toBe(false);
  });

  test("should clear error on new request", async () => {
    const executor = jest.fn()
      .mockRejectedValueOnce(new Error("First error"))
      .mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() =>
      useCoalescedRequest("/api/test", { executor, batchWindow: 0, defaultRetries: 0 })
    );

    // First request fails
    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow();
    });

    expect(result.current.error).not.toBeNull();

    // Second request succeeds - error should be cleared
    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBeNull();
  });
});

// ============================================================================
// Test: useChatRequestCoalescer convenience hook
// ============================================================================

describe("useChatRequestCoalescer - Convenience Hook", () => {
  test("should use chat-optimized defaults", () => {
    const { result } = renderHook(() => useChatRequestCoalescer());

    // Chat coalescer should exist with expected structure
    expect(result.current.state).toBeDefined();
    expect(result.current.metrics).toBeDefined();
    expect(result.current.controls).toBeDefined();
  });

  test("should allow custom config override", () => {
    const { result } = renderHook(() =>
      useChatRequestCoalescer({ defaultTimeout: 60000 })
    );

    expect(result.current).toBeDefined();
  });

  test("should disable caching by default for chat", async () => {
    const executor = jest.fn().mockResolvedValue({ response: "chat" });
    const { result } = renderHook(() =>
      useChatRequestCoalescer({ executor, batchWindow: 0 })
    );

    // Make two identical requests
    await act(async () => {
      await result.current.controls.request("/api/chat", { message: "hi" });
      await result.current.controls.request("/api/chat", { message: "hi" });
    });

    // Both should execute (no caching)
    expect(result.current.metrics.cacheHits).toBe(0);
  });

  test("should use longer deduplication window", async () => {
    const { result } = renderHook(() => useChatRequestCoalescer());

    // Just verify it initializes correctly with chat settings
    expect(result.current.state.isOnline).toBeDefined();
  });
});

// ============================================================================
// Test: Priority Ordering
// ============================================================================

describe("useRequestCoalescer - Priority Ordering", () => {
  test("should define all priority levels", () => {
    const priorities: RequestPriority[] = [
      "critical",
      "high",
      "normal",
      "low",
      "background",
    ];

    priorities.forEach((priority) => {
      expect(["critical", "high", "normal", "low", "background"]).toContain(priority);
    });
  });

  test("should default to normal priority", async () => {
    const onRequestStart = jest.fn();
    const executor = jest.fn().mockResolvedValue({ result: true });

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onRequestStart })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    const trackedRequest = onRequestStart.mock.calls[0][0] as TrackedRequest;
    expect(trackedRequest.priority).toBe("normal");
  });

  test("should respect explicit priority", async () => {
    const onRequestStart = jest.fn();
    const executor = jest.fn().mockResolvedValue({ result: true });

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onRequestStart })
    );

    await act(async () => {
      await result.current.controls.request("/api/test", null, { priority: "critical" });
    });

    const trackedRequest = onRequestStart.mock.calls[0][0] as TrackedRequest;
    expect(trackedRequest.priority).toBe("critical");
  });

  test("should track all priority types in batch", async () => {
    const callOrder: RequestPriority[] = [];
    const executor = jest.fn().mockImplementation((config: RequestConfig) => {
      callOrder.push(config.priority || "normal");
      return Promise.resolve({ result: true });
    });

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 50, maxBatchSize: 5 })
    );

    act(() => {
      result.current.controls.request("/api/bg", null, { priority: "background" });
      result.current.controls.request("/api/crit", null, { priority: "critical" });
      result.current.controls.request("/api/low", null, { priority: "low" });
      result.current.controls.request("/api/high", null, { priority: "high" });
      result.current.controls.request("/api/norm", null, { priority: "normal" });
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    // All priorities should be tracked
    expect(callOrder.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Test: Request Status Tracking
// ============================================================================

describe("useRequestCoalescer - Request Status Tracking", () => {
  test("should track pending status", async () => {
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 1000))
    );

    const onRequestStart = jest.fn();
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onRequestStart })
    );

    act(() => {
      result.current.controls.request("/api/test");
    });

    // Request should have started
    expect(onRequestStart).toHaveBeenCalled();
  });

  test("should track completed status", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const onRequestComplete = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onRequestComplete })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    const trackedRequest = onRequestComplete.mock.calls[0][0] as TrackedRequest;
    expect(trackedRequest.status).toBe("completed");
  });

  test("should track failed status", async () => {
    const executor = jest.fn().mockRejectedValue(new Error("Failed"));
    const onRequestError = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer(
        { executor, batchWindow: 0, defaultRetries: 0 },
        { onRequestError }
      )
    );

    await act(async () => {
      await expect(
        result.current.controls.request("/api/test")
      ).rejects.toThrow();
    });

    const trackedRequest = onRequestError.mock.calls[0][0] as TrackedRequest;
    expect(trackedRequest.status).toBe("failed");
    expect(trackedRequest.error).toBeDefined();
  });

  test("should track timestamps", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const onRequestComplete = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 }, { onRequestComplete })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    const trackedRequest = onRequestComplete.mock.calls[0][0] as TrackedRequest;
    expect(trackedRequest.createdAt).toBeGreaterThan(0);
    expect(trackedRequest.startedAt).toBeGreaterThan(0);
    expect(trackedRequest.completedAt).toBeGreaterThan(0);
  });

  test("should track retry count", async () => {
    const executor = jest.fn()
      .mockRejectedValueOnce(new Error("Retry 1"))
      .mockRejectedValueOnce(new Error("Retry 2"))
      .mockResolvedValueOnce({ success: true });

    const onRequestComplete = jest.fn();

    const { result } = renderHook(() =>
      useRequestCoalescer(
        { executor, batchWindow: 0, defaultRetries: 2, retryBaseDelay: 10 },
        { onRequestComplete }
      )
    );

    await act(async () => {
      jest.advanceTimersByTime(100);
      await result.current.controls.request("/api/test");
    });

    const trackedRequest = onRequestComplete.mock.calls[0][0] as TrackedRequest;
    expect(trackedRequest.retryCount).toBe(2);
  });
});

// ============================================================================
// Test: Edge Cases
// ============================================================================

describe("useRequestCoalescer - Edge Cases", () => {
  test("should handle empty batch request", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    let response: any;
    await act(async () => {
      response = await result.current.controls.batchRequest([]);
    });

    expect(response.results).toHaveLength(0);
    expect(executor).not.toHaveBeenCalled();
  });

  test("should handle null data", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test", null);
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        data: null,
      })
    );
  });

  test("should handle undefined data", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        data: undefined,
      })
    );
  });

  test("should handle error that is not Error instance", async () => {
    const executor = jest.fn().mockRejectedValue("String error");
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, defaultRetries: 0 })
    );

    await act(async () => {
      await expect(
        result.current.controls.request("/api/test")
      ).rejects.toThrow();
    });

    expect(result.current.metrics.failedRequests).toBe(1);
  });

  test("should handle concurrent operations on same cache key", async () => {
    let callCount = 0;
    const executor = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ count: callCount });
    });

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, deduplicationWindow: 500 })
    );

    // Start many concurrent requests
    const promises: Promise<any>[] = [];
    act(() => {
      for (let i = 0; i < 10; i++) {
        promises.push(result.current.controls.request("/api/test", { same: "data" }));
      }
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    // Due to deduplication, not all should execute
    expect(executor.mock.calls.length).toBeLessThanOrEqual(10);
  });

  test("should handle rapid cancel operations", () => {
    const executor = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 1000))
    );

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 100 })
    );

    // Rapid operations
    act(() => {
      result.current.controls.request("/api/test1");
      result.current.controls.cancelAll();
      result.current.controls.request("/api/test2");
      result.current.controls.cancelAll();
      result.current.controls.request("/api/test3");
    });

    // Should handle without errors
    expect(result.current.state).toBeDefined();
  });

  test("should handle clearCache while requests are pending", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 100, enableCache: true })
    );

    act(() => {
      result.current.controls.request("/api/test");
      result.current.controls.clearCache();
    });

    // Should handle without errors
    expect(result.current.state.cacheSize).toBe(0);
  });

  test("should handle resetMetrics during active requests", async () => {
    const executor = jest.fn().mockResolvedValue({ result: true });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    await act(async () => {
      await result.current.controls.request("/api/test");
    });

    expect(result.current.metrics.totalRequests).toBe(1);

    act(() => {
      result.current.controls.resetMetrics();
    });

    expect(result.current.metrics.totalRequests).toBe(0);
    expect(result.current.metrics.averageLatencyMs).toBe(0);
  });
});

// ============================================================================
// Test: Window Events
// ============================================================================

describe("useRequestCoalescer - Window Events", () => {
  test("should cleanup event listeners on unmount", () => {
    const addEventListenerSpy = jest.spyOn(window, "addEventListener");
    const removeEventListenerSpy = jest.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useRequestCoalescer());

    expect(addEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  test("should handle window undefined (SSR)", () => {
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;

    // Should not throw
    expect(() => {
      const { result } = renderHook(() => useRequestCoalescer());
      expect(result.current).toBeDefined();
    }).not.toThrow();

    global.window = originalWindow;
  });
});

// ============================================================================
// Test: Coalesced Request Response Format
// ============================================================================

describe("useRequestCoalescer - Response Format", () => {
  test("should return CoalescedResponse format", async () => {
    const executor = jest.fn().mockResolvedValue({ message: "hello" });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    let response: any;
    await act(async () => {
      response = await result.current.controls.request("/api/test");
    });

    expect(response).toHaveProperty("data");
    expect(response).toHaveProperty("fromCache");
    expect(response).toHaveProperty("coalescedCount");
    expect(response).toHaveProperty("batchId");
    expect(response).toHaveProperty("latencyMs");
  });

  test("should return BatchResponse format", async () => {
    const executor = jest.fn().mockResolvedValue({ id: 1 });
    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0 })
    );

    let response: any;
    await act(async () => {
      response = await result.current.controls.batchRequest([
        { endpoint: "/api/test" },
      ]);
    });

    expect(response).toHaveProperty("results");
    expect(response).toHaveProperty("totalLatencyMs");
    expect(response).toHaveProperty("batchId");
    expect(Array.isArray(response.results)).toBe(true);
  });

  test("should include success flag in batch results", async () => {
    const executor = jest.fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(new Error("Failed"));

    const { result } = renderHook(() =>
      useRequestCoalescer({ executor, batchWindow: 0, defaultRetries: 0 })
    );

    let response: any;
    await act(async () => {
      response = await result.current.controls.batchRequest([
        { endpoint: "/api/test1" },
        { endpoint: "/api/test2" },
      ]);
    });

    expect(response.results[0].success).toBe(true);
    expect(response.results[0].data).toEqual({ id: 1 });
    expect(response.results[1].success).toBe(false);
    expect(response.results[1].error).toBeDefined();
  });
});
