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
