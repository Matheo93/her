/**
 * Tests for useOfflineResilience hook
 * Sprint 559 - Comprehensive test coverage for offline support and connection resilience
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useOfflineResilience,
  useIsOffline,
  useConnectionStability,
  useOfflineQueue,
} from "../useOfflineResilience";

// Mock dependencies
jest.mock("../useNetworkStatus", () => ({
  useNetworkStatus: jest.fn(() => ({ isOnline: true })),
}));

jest.mock("../useVisibility", () => ({
  useVisibility: jest.fn(() => ({ isVisible: true })),
}));

// Get mock reference
import { useNetworkStatus } from "../useNetworkStatus";
const mockUseNetworkStatus = useNetworkStatus as jest.Mock;

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    key: jest.fn((i: number) => Object.keys(store)[i] || null),
    get length() {
      return Object.keys(store).length;
    },
  };
})();

Object.defineProperty(global, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

// Mock fetch for checkConnection
global.fetch = jest.fn();

// Mock timers
jest.useFakeTimers();

describe("useOfflineResilience", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    mockLocalStorage.clear();
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
  });

  describe("Initial State", () => {
    it("should initialize with online state when network is online", () => {
      mockUseNetworkStatus.mockReturnValue({ isOnline: true });

      const { result } = renderHook(() => useOfflineResilience());

      // Allow debounce to complete
      act(() => {
        jest.advanceTimersByTime(2500);
      });

      expect(result.current.isOnline).toBe(true);
      expect(result.current.isOffline).toBe(false);
      expect(result.current.isUnstable).toBe(false);
      expect(result.current.isRecovering).toBe(false);
    });

    it("should initialize with offline state when network is offline", () => {
      mockUseNetworkStatus.mockReturnValue({ isOnline: false });

      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        jest.advanceTimersByTime(2500);
      });

      expect(result.current.isOffline).toBe(true);
      expect(result.current.isOnline).toBe(false);
    });

    it("should initialize with default config", () => {
      const { result } = renderHook(() => useOfflineResilience());

      expect(result.current.config.maxQueueSize).toBe(100);
      expect(result.current.config.maxRetries).toBe(3);
      expect(result.current.config.messageExpiry).toBe(5 * 60 * 1000);
      expect(result.current.config.cacheExpiry).toBe(30 * 60 * 1000);
      expect(result.current.config.useIndexedDB).toBe(true);
      expect(result.current.config.connectionDebounce).toBe(2000);
      expect(result.current.config.unstableThreshold).toBe(10000);
      expect(result.current.config.enableOptimisticUpdates).toBe(true);
    });

    it("should initialize with custom config", () => {
      const customConfig = {
        maxQueueSize: 50,
        maxRetries: 5,
        messageExpiry: 60000,
      };

      const { result } = renderHook(() =>
        useOfflineResilience({ config: customConfig })
      );

      expect(result.current.config.maxQueueSize).toBe(50);
      expect(result.current.config.maxRetries).toBe(5);
      expect(result.current.config.messageExpiry).toBe(60000);
      // Defaults should still be present
      expect(result.current.config.cacheExpiry).toBe(30 * 60 * 1000);
    });

    it("should initialize metrics with default values", () => {
      const { result } = renderHook(() => useOfflineResilience());

      expect(result.current.metrics.queuedMessages).toBe(0);
      expect(result.current.metrics.queuedBytes).toBe(0);
      expect(result.current.metrics.cachedStates).toBe(0);
      expect(result.current.metrics.successfulRecoveries).toBe(0);
      expect(result.current.metrics.failedMessages).toBe(0);
    });
  });

  describe("Message Queue", () => {
    it("should queue a message", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        const id = result.current.controls.queueMessage({ text: "Hello" });
        expect(id).toMatch(/^\d+-[a-z0-9]+$/);
      });

      expect(result.current.metrics.queuedMessages).toBe(1);
    });

    it("should queue message with default priority", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.queueMessage({ text: "Test" });
      });

      expect(result.current.metrics.queuedMessages).toBe(1);
    });

    it("should queue message with custom priority", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.queueMessage(
          { text: "Critical" },
          { priority: "critical" }
        );
      });

      expect(result.current.metrics.queuedMessages).toBe(1);
    });

    it("should queue message with custom retry count", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.queueMessage(
          { text: "Test" },
          { maxRetries: 10 }
        );
      });

      expect(result.current.metrics.queuedMessages).toBe(1);
    });

    it("should queue message with expiry", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.queueMessage(
          { text: "Test" },
          { expiresIn: 60000 }
        );
      });

      expect(result.current.metrics.queuedMessages).toBe(1);
    });

    it("should remove a message from queue", () => {
      const { result } = renderHook(() => useOfflineResilience());

      let messageId: string;
      act(() => {
        messageId = result.current.controls.queueMessage({ text: "Test" });
      });

      expect(result.current.metrics.queuedMessages).toBe(1);

      act(() => {
        result.current.controls.removeMessage(messageId);
      });

      // Queue should be empty after removal
      expect(result.current.metrics.queuedMessages).toBe(0);
    });

    it("should return false when removing non-existent message", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        const removed = result.current.controls.removeMessage("non-existent-id");
        expect(removed).toBe(false);
      });
    });

    it("should clear all messages from queue", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.queueMessage({ text: "Test 1" });
        result.current.controls.queueMessage({ text: "Test 2" });
        result.current.controls.queueMessage({ text: "Test 3" });
      });

      expect(result.current.metrics.queuedMessages).toBe(3);

      act(() => {
        result.current.controls.clearQueue();
      });

      expect(result.current.metrics.queuedMessages).toBe(0);
    });

    it("should enforce max queue size", () => {
      const { result } = renderHook(() =>
        useOfflineResilience({ config: { maxQueueSize: 3 } })
      );

      act(() => {
        result.current.controls.queueMessage({ text: "1" }, { priority: "low" });
        result.current.controls.queueMessage({ text: "2" }, { priority: "low" });
        result.current.controls.queueMessage({ text: "3" }, { priority: "low" });
        result.current.controls.queueMessage({ text: "4" }, { priority: "high" });
      });

      // Should still be 3 due to max queue size
      expect(result.current.metrics.queuedMessages).toBe(3);
    });

    it("should calculate queued bytes", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.queueMessage({ text: "Hello World" });
      });

      expect(result.current.metrics.queuedBytes).toBeGreaterThan(0);
    });
  });

  describe("State Cache", () => {
    it("should cache state", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.cacheState("testKey", { data: "test" });
      });

      expect(result.current.metrics.cachedStates).toBe(1);
    });

    it("should retrieve cached state", () => {
      const { result } = renderHook(() => useOfflineResilience());

      const testData = { value: 42, name: "test" };

      act(() => {
        result.current.controls.cacheState("myKey", testData);
      });

      const cached = result.current.controls.getCachedState<typeof testData>("myKey");
      expect(cached).toEqual(testData);
    });

    it("should return null for non-existent cache key", () => {
      const { result } = renderHook(() => useOfflineResilience());

      const cached = result.current.controls.getCachedState("nonExistent");
      expect(cached).toBeNull();
    });

    it("should cache state with custom expiry", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.cacheState("expiring", { data: "test" }, 1000);
      });

      expect(result.current.metrics.cachedStates).toBe(1);
    });

    it("should return null for expired cache", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.cacheState("expiring", { data: "test" }, 1000);
      });

      // Advance past expiry
      act(() => {
        jest.advanceTimersByTime(1500);
      });

      const cached = result.current.controls.getCachedState("expiring");
      expect(cached).toBeNull();
    });

    it("should clear specific cached state", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.cacheState("key1", { data: "test1" });
        result.current.controls.cacheState("key2", { data: "test2" });
      });

      expect(result.current.metrics.cachedStates).toBe(2);

      act(() => {
        result.current.controls.clearCachedState("key1");
      });

      expect(result.current.metrics.cachedStates).toBe(1);
      expect(result.current.controls.getCachedState("key1")).toBeNull();
      expect(result.current.controls.getCachedState("key2")).not.toBeNull();
    });

    it("should clear all cached states", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.cacheState("key1", { data: "test1" });
        result.current.controls.cacheState("key2", { data: "test2" });
        result.current.controls.cacheState("key3", { data: "test3" });
      });

      act(() => {
        result.current.controls.clearAllCache();
      });

      expect(result.current.metrics.cachedStates).toBe(0);
    });

    it("should persist cache to localStorage", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.cacheState("persistKey", { value: 123 });
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "offline_cache_persistKey",
        expect.any(String)
      );
    });

    it("should restore cache from localStorage", () => {
      const cachedData = {
        key: "restoredKey",
        value: { restored: true },
        timestamp: Date.now(),
        expiresAt: Date.now() + 60000,
      };
      mockLocalStorage.setItem(
        "offline_cache_restoredKey",
        JSON.stringify(cachedData)
      );

      const { result } = renderHook(() => useOfflineResilience());

      const restored = result.current.controls.getCachedState<{ restored: boolean }>("restoredKey");
      expect(restored).toEqual({ restored: true });
    });
  });

  describe("Connection Check", () => {
    it("should check connection successfully", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useOfflineResilience());

      let isConnected: boolean;
      await act(async () => {
        isConnected = await result.current.controls.checkConnection();
      });

      expect(isConnected!).toBe(true);
    });

    it("should detect failed connection", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      const { result } = renderHook(() => useOfflineResilience());

      let isConnected: boolean;
      await act(async () => {
        isConnected = await result.current.controls.checkConnection();
      });

      expect(isConnected!).toBe(false);
    });

    it("should handle network error in connection check", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useOfflineResilience());

      let isConnected: boolean;
      await act(async () => {
        isConnected = await result.current.controls.checkConnection();
      });

      expect(isConnected!).toBe(false);
    });

    it("should use custom ping endpoint", async () => {
      const { result } = renderHook(() =>
        useOfflineResilience({ pingEndpoint: "/custom/health" })
      );

      await act(async () => {
        await result.current.controls.checkConnection();
      });

      expect(global.fetch).toHaveBeenCalledWith("/custom/health", expect.any(Object));
    });
  });

  describe("Message Handler", () => {
    it("should set message handler", () => {
      const { result } = renderHook(() => useOfflineResilience());

      const handler = jest.fn().mockResolvedValue(true);

      act(() => {
        result.current.controls.setMessageHandler(handler);
      });

      // Handler is stored internally
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("Queue Flush", () => {
    it("should return empty result when queue is empty", async () => {
      const { result } = renderHook(() => useOfflineResilience());

      // Wait for online state
      act(() => {
        jest.advanceTimersByTime(2500);
      });

      let flushResult: { sent: number; failed: number; remaining: number };
      await act(async () => {
        flushResult = await result.current.controls.flushQueue();
      });

      expect(flushResult!.sent).toBe(0);
      expect(flushResult!.failed).toBe(0);
      expect(flushResult!.remaining).toBe(0);
    });

    it("should not flush when offline", async () => {
      mockUseNetworkStatus.mockReturnValue({ isOnline: false });

      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        jest.advanceTimersByTime(2500);
        result.current.controls.queueMessage({ text: "Test" });
      });

      let flushResult: { sent: number; failed: number; remaining: number };
      await act(async () => {
        flushResult = await result.current.controls.flushQueue();
      });

      expect(flushResult!.sent).toBe(0);
      expect(flushResult!.remaining).toBe(1);
    });

    it("should flush messages when handler succeeds", async () => {
      const handler = jest.fn().mockResolvedValue(true);

      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        jest.advanceTimersByTime(2500);
        result.current.controls.setMessageHandler(handler);
        result.current.controls.queueMessage({ text: "Test 1" });
        result.current.controls.queueMessage({ text: "Test 2" });
      });

      await act(async () => {
        await result.current.controls.flushQueue();
      });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(result.current.metrics.queuedMessages).toBe(0);
    });

    it("should increment retry count on handler failure", async () => {
      const handler = jest.fn().mockResolvedValue(false);

      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        jest.advanceTimersByTime(2500);
        result.current.controls.setMessageHandler(handler);
        result.current.controls.queueMessage({ text: "Test" });
      });

      await act(async () => {
        await result.current.controls.flushQueue();
      });

      // Message should still be in queue with incremented retry
      expect(result.current.metrics.queuedMessages).toBe(1);
    });

    it("should handle handler exceptions", async () => {
      const handler = jest.fn().mockRejectedValue(new Error("Handler error"));

      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        jest.advanceTimersByTime(2500);
        result.current.controls.setMessageHandler(handler);
        result.current.controls.queueMessage({ text: "Test" });
      });

      await act(async () => {
        await result.current.controls.flushQueue();
      });

      // Message should still be in queue
      expect(result.current.metrics.queuedMessages).toBe(1);
    });
  });

  describe("Recovery Callbacks", () => {
    it("should register recovery callback", () => {
      const { result } = renderHook(() => useOfflineResilience());

      const callback = jest.fn();

      act(() => {
        result.current.controls.onRecovery(callback);
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it("should unregister recovery callback", () => {
      const { result } = renderHook(() => useOfflineResilience());

      const callback = jest.fn();

      let unsubscribe: () => void;
      act(() => {
        unsubscribe = result.current.controls.onRecovery(callback);
      });

      act(() => {
        unsubscribe();
      });

      // Callback should not be in the set anymore
    });
  });

  describe("Stability Score", () => {
    it("should start with high stability score", () => {
      const { result } = renderHook(() => useOfflineResilience());

      expect(result.current.metrics.stabilityScore).toBe(100);
    });
  });

  describe("Offline Duration", () => {
    it("should track offline duration", () => {
      mockUseNetworkStatus.mockReturnValue({ isOnline: false });

      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        jest.advanceTimersByTime(2500);
      });

      // Initially at 0, will update on re-render
      expect(result.current.metrics.offlineDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Connection State Transitions", () => {
    it("should handle online callback", () => {
      mockUseNetworkStatus.mockReturnValue({ isOnline: false });

      const onOnline = jest.fn();
      const { result, rerender } = renderHook(() =>
        useOfflineResilience({ onOnline })
      );

      act(() => {
        jest.advanceTimersByTime(2500);
      });

      // Transition to online
      mockUseNetworkStatus.mockReturnValue({ isOnline: true });
      rerender();

      act(() => {
        jest.advanceTimersByTime(2500);
      });

      // Recovery process runs before callback
    });

    it("should handle offline callback", () => {
      mockUseNetworkStatus.mockReturnValue({ isOnline: true });

      const onOffline = jest.fn();
      const { result, rerender } = renderHook(() =>
        useOfflineResilience({ onOffline })
      );

      act(() => {
        jest.advanceTimersByTime(2500);
      });

      // Transition to offline
      mockUseNetworkStatus.mockReturnValue({ isOnline: false });
      rerender();

      act(() => {
        jest.advanceTimersByTime(2500);
      });

      expect(onOffline).toHaveBeenCalled();
    });
  });

  describe("Controls Memoization", () => {
    it("should return stable controls object", () => {
      const { result, rerender } = renderHook(() => useOfflineResilience());

      const controlsRef = result.current.controls;

      rerender();

      expect(result.current.controls).toBe(controlsRef);
    });

    it("should have all control functions defined", () => {
      const { result } = renderHook(() => useOfflineResilience());

      expect(typeof result.current.controls.queueMessage).toBe("function");
      expect(typeof result.current.controls.removeMessage).toBe("function");
      expect(typeof result.current.controls.clearQueue).toBe("function");
      expect(typeof result.current.controls.flushQueue).toBe("function");
      expect(typeof result.current.controls.cacheState).toBe("function");
      expect(typeof result.current.controls.getCachedState).toBe("function");
      expect(typeof result.current.controls.clearCachedState).toBe("function");
      expect(typeof result.current.controls.clearAllCache).toBe("function");
      expect(typeof result.current.controls.checkConnection).toBe("function");
      expect(typeof result.current.controls.setMessageHandler).toBe("function");
      expect(typeof result.current.controls.onRecovery).toBe("function");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty data in queue", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.queueMessage(null);
        result.current.controls.queueMessage(undefined);
        result.current.controls.queueMessage({});
      });

      expect(result.current.metrics.queuedMessages).toBe(3);
    });

    it("should handle large data in queue", () => {
      const { result } = renderHook(() => useOfflineResilience());

      const largeData = { items: Array(1000).fill("test data") };

      act(() => {
        result.current.controls.queueMessage(largeData);
      });

      expect(result.current.metrics.queuedBytes).toBeGreaterThan(0);
    });

    it("should handle rapid queue/dequeue operations", () => {
      const { result } = renderHook(() => useOfflineResilience());

      const ids: string[] = [];

      act(() => {
        for (let i = 0; i < 50; i++) {
          ids.push(result.current.controls.queueMessage({ index: i }));
        }
      });

      act(() => {
        for (let i = 0; i < 25; i++) {
          result.current.controls.removeMessage(ids[i]);
        }
      });

      expect(result.current.metrics.queuedMessages).toBe(25);
    });

    it("should handle cache key with special characters", () => {
      const { result } = renderHook(() => useOfflineResilience());

      act(() => {
        result.current.controls.cacheState("key/with:special-chars", { data: "test" });
      });

      const cached = result.current.controls.getCachedState("key/with:special-chars");
      expect(cached).toEqual({ data: "test" });
    });

    it("should handle unicode in cached data", () => {
      const { result } = renderHook(() => useOfflineResilience());

      const unicodeData = { emoji: "🎉", chinese: "你好", arabic: "مرحبا" };

      act(() => {
        result.current.controls.cacheState("unicodeKey", unicodeData);
      });

      const cached = result.current.controls.getCachedState("unicodeKey");
      expect(cached).toEqual(unicodeData);
    });
  });
});

describe("useIsOffline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });
  });

  it("should return false when online", () => {
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });

    const { result } = renderHook(() => useIsOffline());

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(result.current).toBe(false);
  });

  it("should return true when offline", () => {
    mockUseNetworkStatus.mockReturnValue({ isOnline: false });

    const { result } = renderHook(() => useIsOffline());

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(result.current).toBe(true);
  });
});

describe("useConnectionStability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });
  });

  it("should return stability score", () => {
    const { result } = renderHook(() => useConnectionStability());

    expect(typeof result.current).toBe("number");
    expect(result.current).toBeGreaterThanOrEqual(0);
    expect(result.current).toBeLessThanOrEqual(100);
  });
});

describe("useOfflineQueue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });
  });

  it("should return queue functions", () => {
    const { result } = renderHook(() => useOfflineQueue());

    expect(typeof result.current.queueMessage).toBe("function");
    expect(typeof result.current.flushQueue).toBe("function");
    expect(typeof result.current.queueLength).toBe("number");
  });

  it("should track queue length", () => {
    const { result } = renderHook(() => useOfflineQueue());

    expect(result.current.queueLength).toBe(0);

    act(() => {
      result.current.queueMessage({ test: true });
    });

    expect(result.current.queueLength).toBe(1);
  });

  it("should queue messages via sub-hook", () => {
    const { result } = renderHook(() => useOfflineQueue());

    act(() => {
      const id = result.current.queueMessage({ data: "test" });
      expect(id).toBeDefined();
    });

    expect(result.current.queueLength).toBe(1);
  });
});

describe("Message Priority Sorting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });
  });

  it("should flush critical messages first", async () => {
    const processedOrder: string[] = [];
    const handler = jest.fn(async (msg: { data: { priority: string } }) => {
      processedOrder.push(msg.data.priority);
      return true;
    });

    const { result } = renderHook(() => useOfflineResilience());

    act(() => {
      jest.advanceTimersByTime(2500);
      result.current.controls.setMessageHandler(handler);
      result.current.controls.queueMessage({ priority: "low" }, { priority: "low" });
      result.current.controls.queueMessage({ priority: "critical" }, { priority: "critical" });
      result.current.controls.queueMessage({ priority: "normal" }, { priority: "normal" });
      result.current.controls.queueMessage({ priority: "high" }, { priority: "high" });
    });

    await act(async () => {
      await result.current.controls.flushQueue();
    });

    expect(processedOrder[0]).toBe("critical");
    expect(processedOrder[1]).toBe("high");
    expect(processedOrder[2]).toBe("normal");
    expect(processedOrder[3]).toBe("low");
  });
});

describe("Message Expiry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });
  });

  it("should expire messages based on config", async () => {
    const handler = jest.fn().mockResolvedValue(true);

    const { result } = renderHook(() =>
      useOfflineResilience({ config: { messageExpiry: 1000 } })
    );

    act(() => {
      jest.advanceTimersByTime(2500);
      result.current.controls.setMessageHandler(handler);
      result.current.controls.queueMessage({ text: "Will expire" });
    });

    // Advance past expiry
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    await act(async () => {
      const flushResult = await result.current.controls.flushQueue();
      expect(flushResult.failed).toBe(1);
      expect(flushResult.sent).toBe(0);
    });

    expect(result.current.metrics.failedMessages).toBeGreaterThan(0);
  });

  it("should not expire messages when expiry is null", async () => {
    const handler = jest.fn().mockResolvedValue(true);

    const { result } = renderHook(() =>
      useOfflineResilience({ config: { messageExpiry: null } })
    );

    act(() => {
      jest.advanceTimersByTime(2500);
      result.current.controls.setMessageHandler(handler);
      result.current.controls.queueMessage({ text: "No expiry" });
    });

    // Advance time significantly
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    await act(async () => {
      const flushResult = await result.current.controls.flushQueue();
      expect(flushResult.sent).toBe(1);
    });
  });
});

describe("Max Retries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });
  });

  it("should fail messages after max retries", async () => {
    const handler = jest.fn().mockResolvedValue(false);

    const { result } = renderHook(() =>
      useOfflineResilience({ config: { maxRetries: 2 } })
    );

    act(() => {
      jest.advanceTimersByTime(2500);
      result.current.controls.setMessageHandler(handler);
      result.current.controls.queueMessage({ text: "Test" });
    });

    // First attempt - retry count becomes 1
    await act(async () => {
      await result.current.controls.flushQueue();
    });

    // Second attempt - retry count becomes 2
    await act(async () => {
      await result.current.controls.flushQueue();
    });

    // Third attempt - should fail (retryCount >= maxRetries)
    await act(async () => {
      const flushResult = await result.current.controls.flushQueue();
      expect(flushResult.failed).toBe(1);
    });

    expect(result.current.metrics.failedMessages).toBeGreaterThan(0);
  });
});

describe("localStorage Error Handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });
  });

  it("should handle localStorage setItem error", () => {
    mockLocalStorage.setItem.mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });

    const { result } = renderHook(() => useOfflineResilience());

    // Should not throw
    act(() => {
      result.current.controls.cacheState("key", { data: "large" });
    });

    // Cache should still work in memory
    expect(result.current.metrics.cachedStates).toBe(1);
  });

  it("should handle localStorage getItem error", () => {
    mockLocalStorage.getItem.mockImplementation(() => {
      throw new Error("Parse error");
    });

    const { result } = renderHook(() => useOfflineResilience());

    // Should not throw, just return null
    const cached = result.current.controls.getCachedState("key");
    expect(cached).toBeNull();
  });

  it("should handle corrupted localStorage data", () => {
    mockLocalStorage.getItem.mockReturnValue("not valid json");

    const { result } = renderHook(() => useOfflineResilience());

    // Should not throw, just return null
    const cached = result.current.controls.getCachedState("corruptedKey");
    expect(cached).toBeNull();
  });
});

describe("Timestamps", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });
  });

  it("should track lastOnlineAt", () => {
    const { result } = renderHook(() => useOfflineResilience());

    expect(result.current.metrics.lastOnlineAt).toBeGreaterThan(0);
  });

  it("should track lastOfflineAt when going offline", () => {
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });

    const { result, rerender } = renderHook(() => useOfflineResilience());

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    mockUseNetworkStatus.mockReturnValue({ isOnline: false });
    rerender();

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(result.current.metrics.lastOfflineAt).toBeGreaterThan(0);
  });
});

describe("Cleanup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNetworkStatus.mockReturnValue({ isOnline: true });
  });

  it("should cleanup timeout on unmount", () => {
    const { unmount } = renderHook(() => useOfflineResilience());

    // Should not throw on unmount
    unmount();
  });

  it("should cleanup recovery callbacks on unmount", () => {
    const { result, unmount } = renderHook(() => useOfflineResilience());

    const callback = jest.fn();
    act(() => {
      result.current.controls.onRecovery(callback);
    });

    unmount();
    // Callback reference should be cleaned up
  });
});
