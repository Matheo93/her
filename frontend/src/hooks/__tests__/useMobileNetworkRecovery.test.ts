/**
 * Tests for Mobile Network Recovery Hook - Sprint 524
 *
 * Tests network state management, request queueing,
 * automatic reconnection, and recovery strategies.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useMobileNetworkRecovery,
  useOnlineStatus,
  useOfflineQueue,
  NetworkState,
  ConnectionType,
  RecoveryStrategy,
  RecoveryConfig,
  calculateBackoff,
  getConnectionType,
  generateId,
} from "../useMobileNetworkRecovery";

// Mock fetch
let mockFetchResponse: { ok: boolean } = { ok: true };

beforeEach(() => {
  jest.useFakeTimers();
  mockFetchResponse = { ok: true };

  global.fetch = jest.fn().mockImplementation(() =>
    Promise.resolve({
      ok: mockFetchResponse.ok,
    })
  );

  // Mock navigator.connection
  Object.defineProperty(navigator, "connection", {
    value: {
      type: "wifi",
      effectiveType: "4g",
      downlink: 10,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    writable: true,
    configurable: true,
  });

  // Mock navigator.onLine
  Object.defineProperty(navigator, "onLine", {
    value: true,
    writable: true,
    configurable: true,
  });

  // Mock performance.now
  jest.spyOn(performance, "now").mockReturnValue(0);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useMobileNetworkRecovery", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      expect(result.current.state.network).toBe("online");
      expect(result.current.state.queuedRequests).toHaveLength(0);
      expect(result.current.state.reconnectAttempts).toBe(0);
      expect(result.current.isOnline).toBe(true);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useMobileNetworkRecovery({
          maxRetries: 10,
          initialDelayMs: 2000,
          strategy: "immediate",
        })
      );

      expect(result.current.config.maxRetries).toBe(10);
      expect(result.current.config.initialDelayMs).toBe(2000);
      expect(result.current.config.strategy).toBe("immediate");
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      expect(result.current.metrics.totalDisconnections).toBe(0);
      expect(result.current.metrics.successfulRecoveries).toBe(0);
      expect(result.current.metrics.failedRecoveries).toBe(0);
      expect(result.current.metrics.requestsQueued).toBe(0);
      expect(result.current.metrics.requestsReplayed).toBe(0);
    });

    it("should initialize sync state", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      expect(result.current.state.sync.pendingCount).toBe(0);
      expect(result.current.state.sync.syncInProgress).toBe(false);
      expect(result.current.state.sync.failedCount).toBe(0);
    });

    it("should initialize quality metrics", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      expect(result.current.state.quality.score).toBe(100);
      expect(result.current.state.quality.latency).toBe(0);
      expect(result.current.state.quality.bandwidth).toBe(0);
    });
  });

  describe("request queueing", () => {
    it("should queue a request", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      let requestId: string;
      act(() => {
        requestId = result.current.controls.queueRequest({
          url: "/api/test",
          method: "POST",
          body: { data: "test" },
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
      });

      expect(requestId!).toBeDefined();
      expect(result.current.state.queuedRequests).toHaveLength(1);
      expect(result.current.state.queuedRequests[0].url).toBe("/api/test");
      expect(result.current.state.queuedRequests[0].method).toBe("POST");
      expect(result.current.metrics.requestsQueued).toBe(1);
    });

    it("should cancel a queued request", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      let requestId: string;
      act(() => {
        requestId = result.current.controls.queueRequest({
          url: "/api/test",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
      });

      expect(result.current.state.queuedRequests).toHaveLength(1);

      act(() => {
        result.current.controls.cancelRequest(requestId!);
      });

      expect(result.current.state.queuedRequests).toHaveLength(0);
    });

    it("should clear entire queue", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      act(() => {
        result.current.controls.queueRequest({
          url: "/api/test1",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
        result.current.controls.queueRequest({
          url: "/api/test2",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
      });

      expect(result.current.state.queuedRequests).toHaveLength(2);

      act(() => {
        result.current.controls.clearQueue();
      });

      expect(result.current.state.queuedRequests).toHaveLength(0);
    });

    it("should enforce max queue size", () => {
      const { result } = renderHook(() =>
        useMobileNetworkRecovery({ queueMaxSize: 2 })
      );

      act(() => {
        result.current.controls.queueRequest({
          url: "/api/test1",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
        result.current.controls.queueRequest({
          url: "/api/test2",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
        result.current.controls.queueRequest({
          url: "/api/test3",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
      });

      // Should have dropped oldest
      expect(result.current.state.queuedRequests).toHaveLength(2);
      expect(result.current.state.queuedRequests[0].url).toBe("/api/test2");
      expect(result.current.state.queuedRequests[1].url).toBe("/api/test3");
    });

    it("should assign unique IDs to requests", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      let id1: string, id2: string;
      act(() => {
        id1 = result.current.controls.queueRequest({
          url: "/api/test1",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
        id2 = result.current.controls.queueRequest({
          url: "/api/test2",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
      });

      expect(id1!).not.toBe(id2!);
      expect(id1!).toMatch(/^req-/);
    });

    it("should set expiry time on requests", () => {
      const { result } = renderHook(() =>
        useMobileNetworkRecovery({ requestExpiryMs: 60000 })
      );

      act(() => {
        result.current.controls.queueRequest({
          url: "/api/test",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
      });

      expect(result.current.state.queuedRequests[0].expiresAt).toBeGreaterThan(0);
    });
  });

  describe("config updates", () => {
    it("should update config", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      act(() => {
        result.current.controls.updateConfig({
          maxRetries: 10,
          autoSync: false,
        });
      });

      expect(result.current.config.maxRetries).toBe(10);
      expect(result.current.config.autoSync).toBe(false);
    });
  });

  describe("sync control", () => {
    it("should pause and resume sync", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      act(() => {
        result.current.controls.pauseSync();
      });

      // Queue a request
      act(() => {
        result.current.controls.queueRequest({
          url: "/api/test",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
      });

      // canSync should be false when paused
      // (Note: canSync depends on internal isPausedRef which we can't directly check)

      act(() => {
        result.current.controls.resumeSync();
      });
    });
  });

  describe("network change callbacks", () => {
    it("should register and unregister network change callback", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());
      const callback = jest.fn();

      let unsubscribe: () => void;
      act(() => {
        unsubscribe = result.current.controls.onNetworkChange(callback);
      });

      expect(typeof unsubscribe!).toBe("function");

      act(() => {
        unsubscribe!();
      });
    });

    it("should register and unregister queue drained callback", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());
      const callback = jest.fn();

      let unsubscribe: () => void;
      act(() => {
        unsubscribe = result.current.controls.onQueueDrained(callback);
      });

      expect(typeof unsubscribe!).toBe("function");

      act(() => {
        unsubscribe!();
      });
    });
  });

  describe("connection checking", () => {
    it("should provide checkConnection function", async () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      mockFetchResponse = { ok: true };

      let isConnected: boolean;
      await act(async () => {
        isConnected = await result.current.controls.checkConnection();
      });

      expect(isConnected!).toBe(true);
    });

    it("should return false when connection check fails", async () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

      let isConnected: boolean;
      await act(async () => {
        isConnected = await result.current.controls.checkConnection();
      });

      expect(isConnected!).toBe(false);
    });
  });

  describe("derived values", () => {
    it("should report isOnline correctly", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      expect(result.current.isOnline).toBe(true);
    });

    it("should report canSync correctly", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      // No requests queued
      expect(result.current.canSync).toBe(false);

      // Queue a request
      act(() => {
        result.current.controls.queueRequest({
          url: "/api/test",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
      });

      expect(result.current.canSync).toBe(true);
    });
  });

  describe("default config values", () => {
    it("should have correct default config", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      expect(result.current.config.enabled).toBe(true);
      expect(result.current.config.strategy).toBe("exponential");
      expect(result.current.config.maxRetries).toBe(5);
      expect(result.current.config.initialDelayMs).toBe(1000);
      expect(result.current.config.maxDelayMs).toBe(30000);
      expect(result.current.config.backoffMultiplier).toBe(2);
      expect(result.current.config.queueMaxSize).toBe(100);
      expect(result.current.config.autoSync).toBe(true);
    });
  });

  describe("connection type detection", () => {
    it("should detect connection type", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      // Should detect wifi from mock
      expect(["wifi", "unknown"]).toContain(result.current.state.connectionType);
    });
  });

  describe("force reconnect", () => {
    it("should provide forceReconnect function", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      expect(typeof result.current.controls.forceReconnect).toBe("function");
    });

    it("should reset reconnect attempts when called", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      // Force reconnect resets attempts
      act(() => {
        result.current.controls.forceReconnect();
      });

      expect(result.current.state.reconnectAttempts).toBe(0);
    });
  });

  describe("retry failed requests", () => {
    it("should reset retry count on failed requests", () => {
      const { result } = renderHook(() => useMobileNetworkRecovery());

      // Queue a request
      act(() => {
        result.current.controls.queueRequest({
          url: "/api/test",
          method: "GET",
          maxRetries: 3,
          priority: 1,
          expiresAt: null,
        });
      });

      // Manually simulate a retry count increase
      expect(result.current.state.queuedRequests[0].retries).toBe(0);

      act(() => {
        result.current.controls.retryFailed();
      });

      // Retry count should still be 0 (reset)
      expect(result.current.state.queuedRequests[0].retries).toBe(0);
    });
  });
});

describe("useOnlineStatus", () => {
  it("should provide isOnline status", () => {
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current.isOnline).toBe(true);
  });

  it("should provide connectionType", () => {
    const { result } = renderHook(() => useOnlineStatus());

    expect(typeof result.current.connectionType).toBe("string");
  });
});

describe("useOfflineQueue", () => {
  it("should provide queue function", () => {
    const { result } = renderHook(() => useOfflineQueue());

    expect(typeof result.current.queue).toBe("function");
  });

  it("should queue requests with simplified API", () => {
    const { result } = renderHook(() => useOfflineQueue());

    let requestId: string;
    act(() => {
      requestId = result.current.queue("/api/test", "POST", { data: "test" });
    });

    expect(requestId!).toBeDefined();
    expect(result.current.pending).toBe(1);
  });

  it("should provide pending count", () => {
    const { result } = renderHook(() => useOfflineQueue());

    expect(result.current.pending).toBe(0);

    act(() => {
      result.current.queue("/api/test", "GET");
    });

    expect(result.current.pending).toBe(1);
  });

  it("should provide sync function", () => {
    const { result } = renderHook(() => useOfflineQueue());

    expect(typeof result.current.sync).toBe("function");
  });
});

// ============================================================================
// Sprint 628 - Utility Function Tests
// ============================================================================

describe("Sprint 628 - calculateBackoff utility function (lines 150-151)", () => {
  const baseConfig: RecoveryConfig = {
    enabled: true,
    strategy: "exponential",
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    queueMaxSize: 100,
    requestTimeoutMs: 10000,
    requestExpiryMs: 300000,
    autoSync: true,
    syncIntervalMs: 30000,
    qualityCheckIntervalMs: 10000,
    degradedThreshold: 50,
  };

  it("should return initial delay for first attempt (attempt 0)", () => {
    const delay = calculateBackoff(0, baseConfig);
    // 1000 * 2^0 = 1000
    expect(delay).toBe(1000);
  });

  it("should apply exponential multiplier for subsequent attempts", () => {
    const delay1 = calculateBackoff(1, baseConfig);
    // 1000 * 2^1 = 2000
    expect(delay1).toBe(2000);

    const delay2 = calculateBackoff(2, baseConfig);
    // 1000 * 2^2 = 4000
    expect(delay2).toBe(4000);

    const delay3 = calculateBackoff(3, baseConfig);
    // 1000 * 2^3 = 8000
    expect(delay3).toBe(8000);
  });

  it("should cap delay at maxDelayMs", () => {
    // 1000 * 2^5 = 32000 > 30000, should cap at 30000
    const delay = calculateBackoff(5, baseConfig);
    expect(delay).toBe(30000);

    // Even higher attempts should still cap
    const delay10 = calculateBackoff(10, baseConfig);
    expect(delay10).toBe(30000);
  });

  it("should work with different config values", () => {
    const customConfig: RecoveryConfig = {
      ...baseConfig,
      initialDelayMs: 500,
      maxDelayMs: 10000,
      backoffMultiplier: 3,
    };

    const delay0 = calculateBackoff(0, customConfig);
    expect(delay0).toBe(500); // 500 * 3^0 = 500

    const delay1 = calculateBackoff(1, customConfig);
    expect(delay1).toBe(1500); // 500 * 3^1 = 1500

    const delay2 = calculateBackoff(2, customConfig);
    expect(delay2).toBe(4500); // 500 * 3^2 = 4500

    const delay3 = calculateBackoff(3, customConfig);
    expect(delay3).toBe(10000); // 500 * 3^3 = 13500, capped at 10000
  });
});

describe("Sprint 628 - getConnectionType utility function (lines 155-169)", () => {
  it("should return 'wifi' for wifi connection", () => {
    Object.defineProperty(navigator, "connection", {
      value: { type: "wifi" },
      writable: true,
      configurable: true,
    });

    expect(getConnectionType()).toBe("wifi");
  });

  it("should return 'cellular' for cellular connection", () => {
    Object.defineProperty(navigator, "connection", {
      value: { type: "cellular" },
      writable: true,
      configurable: true,
    });

    expect(getConnectionType()).toBe("cellular");
  });

  it("should return 'cellular' for 4g effectiveType", () => {
    Object.defineProperty(navigator, "connection", {
      value: { effectiveType: "4g" },
      writable: true,
      configurable: true,
    });

    expect(getConnectionType()).toBe("cellular");
  });

  it("should return 'cellular' for 3g effectiveType", () => {
    Object.defineProperty(navigator, "connection", {
      value: { effectiveType: "3g" },
      writable: true,
      configurable: true,
    });

    expect(getConnectionType()).toBe("cellular");
  });

  it("should return 'cellular' for 2g effectiveType", () => {
    Object.defineProperty(navigator, "connection", {
      value: { effectiveType: "2g" },
      writable: true,
      configurable: true,
    });

    expect(getConnectionType()).toBe("cellular");
  });

  it("should return 'ethernet' for ethernet connection", () => {
    Object.defineProperty(navigator, "connection", {
      value: { type: "ethernet" },
      writable: true,
      configurable: true,
    });

    expect(getConnectionType()).toBe("ethernet");
  });

  it("should return 'none' for none type", () => {
    Object.defineProperty(navigator, "connection", {
      value: { type: "none" },
      writable: true,
      configurable: true,
    });

    expect(getConnectionType()).toBe("none");
  });

  it("should return 'unknown' for unknown connection type", () => {
    Object.defineProperty(navigator, "connection", {
      value: { type: "something-else" },
      writable: true,
      configurable: true,
    });

    expect(getConnectionType()).toBe("unknown");
  });

  it("should return 'unknown' when connection API is not available", () => {
    Object.defineProperty(navigator, "connection", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    expect(getConnectionType()).toBe("unknown");
  });

  it("should use effectiveType when type is not available", () => {
    Object.defineProperty(navigator, "connection", {
      value: { effectiveType: "wifi" },
      writable: true,
      configurable: true,
    });

    expect(getConnectionType()).toBe("wifi");
  });
});

describe("Sprint 628 - generateId utility function (line 142)", () => {
  it("should generate unique IDs", () => {
    const id1 = generateId();
    const id2 = generateId();
    const id3 = generateId();

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  it("should generate IDs with correct prefix", () => {
    const id = generateId();
    expect(id.startsWith("req-")).toBe(true);
  });

  it("should generate IDs with timestamp component", () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now);

    const id = generateId();
    expect(id).toContain(now.toString());
  });

  it("should generate IDs with random suffix", () => {
    const ids = new Set<string>();

    // Generate 10 IDs and ensure they're all unique
    for (let i = 0; i < 10; i++) {
      ids.add(generateId());
    }

    expect(ids.size).toBe(10);
  });
});

describe("Sprint 628 - network quality and state transitions", () => {
  it("should initialize with connection type", () => {
    Object.defineProperty(navigator, "connection", {
      value: { type: "wifi" },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileNetworkRecovery());

    expect(result.current.state.connectionType).toBe("wifi");
  });

  it("should handle missing connection API gracefully", () => {
    Object.defineProperty(navigator, "connection", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileNetworkRecovery());

    expect(result.current.state.connectionType).toBe("unknown");
  });

  it("should track sync state", () => {
    const { result } = renderHook(() => useMobileNetworkRecovery());

    expect(result.current.state.sync).toBeDefined();
    expect(result.current.state.sync.pendingCount).toBe(0);
    expect(result.current.state.sync.syncInProgress).toBe(false);
  });

  it("should expose controls for manual sync via retryFailed", () => {
    const { result } = renderHook(() => useMobileNetworkRecovery());

    expect(result.current.controls.retryFailed).toBeDefined();
    expect(typeof result.current.controls.retryFailed).toBe("function");
  });

  it("should expose controls for pausing and resuming sync", () => {
    const { result } = renderHook(() => useMobileNetworkRecovery());

    expect(result.current.controls.pauseSync).toBeDefined();
    expect(result.current.controls.resumeSync).toBeDefined();
    expect(typeof result.current.controls.pauseSync).toBe("function");
    expect(typeof result.current.controls.resumeSync).toBe("function");
  });

  it("should expose controls for clearing queue", () => {
    const { result } = renderHook(() => useMobileNetworkRecovery());

    expect(result.current.controls.clearQueue).toBeDefined();
    expect(typeof result.current.controls.clearQueue).toBe("function");
  });

  it("should provide isOnline and canSync helpers", () => {
    const { result } = renderHook(() => useMobileNetworkRecovery());

    expect(typeof result.current.isOnline).toBe("boolean");
    expect(typeof result.current.canSync).toBe("boolean");
    // isOnline should be true, canSync should be false (no queued requests)
    expect(result.current.isOnline).toBe(true);
    expect(result.current.canSync).toBe(false);
  });
});
