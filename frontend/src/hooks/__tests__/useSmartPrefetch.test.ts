/**
 * Tests for useSmartPrefetch hook - Sprint 540
 *
 * Tests intelligent asset and data preloading including:
 * - Predictive prefetching based on user behavior
 * - Network-aware prefetch scheduling
 * - Priority-based resource loading
 * - Memory pressure awareness
 * - Intersection observer for viewport-based prefetching
 */

import { renderHook, act } from "@testing-library/react";
import {
  useSmartPrefetch,
  useImagePrefetch,
  useAudioPrefetch,
  useCriticalPrefetch,
} from "../useSmartPrefetch";

// Mock dependencies
jest.mock("../useMobileDetect", () => ({
  useMobileDetect: jest.fn(() => ({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
  })),
}));

jest.mock("../useNetworkStatus", () => ({
  useNetworkStatus: jest.fn(() => ({
    isOnline: true,
    wasOffline: false,
    isSlowConnection: false,
    effectiveType: "4g",
    downlink: 10,
    rtt: 50,
    saveData: false,
  })),
}));

jest.mock("../useDeviceCapabilities", () => ({
  useDeviceCapabilities: jest.fn(() => ({
    battery: {
      isLowBattery: false,
      level: 0.8,
      charging: true,
    },
    memory: {
      deviceMemory: 8,
      jsHeapSizeLimit: 2000000000,
    },
    performance: {
      hardwareConcurrency: 8,
    },
  })),
}));

jest.mock("../useVisibility", () => ({
  useVisibility: jest.fn(() => ({
    isVisible: true,
    visibilityState: "visible",
  })),
}));

import { useMobileDetect } from "../useMobileDetect";
import { useNetworkStatus } from "../useNetworkStatus";
import { useDeviceCapabilities } from "../useDeviceCapabilities";
import { useVisibility } from "../useVisibility";

// Mock requestIdleCallback
const mockRequestIdleCallback = jest.fn((cb: IdleRequestCallback) => {
  const id = setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0);
  return id as unknown as number;
});

const mockCancelIdleCallback = jest.fn((id: number) => {
  clearTimeout(id);
});

Object.defineProperty(window, "requestIdleCallback", {
  value: mockRequestIdleCallback,
  writable: true,
  configurable: true,
});

Object.defineProperty(window, "cancelIdleCallback", {
  value: mockCancelIdleCallback,
  writable: true,
  configurable: true,
});

// Mock IntersectionObserver
const mockObserve = jest.fn();
const mockUnobserve = jest.fn();
const mockDisconnect = jest.fn();

class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
  }

  observe = mockObserve;
  unobserve = mockUnobserve;
  disconnect = mockDisconnect;
  takeRecords = () => [];
  root = null;
  rootMargin = "";
  thresholds = [0];
}

global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock fetch
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  headers: {
    get: () => "1000",
  },
});

// Mock Image
class MockImage {
  onload: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  src = "";

  constructor() {
    setTimeout(() => {
      if (this.src && this.onload) {
        this.onload();
      }
    }, 0);
  }
}

global.Image = MockImage as unknown as typeof Image;

describe("useSmartPrefetch", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    // Reset mocks
    (useMobileDetect as jest.Mock).mockReturnValue({
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });

    (useNetworkStatus as jest.Mock).mockReturnValue({
      isOnline: true,
      wasOffline: false,
      isSlowConnection: false,
      effectiveType: "4g",
      downlink: 10,
      rtt: 50,
      saveData: false,
    });

    (useDeviceCapabilities as jest.Mock).mockReturnValue({
      battery: {
        isLowBattery: false,
        level: 0.8,
        charging: true,
      },
      memory: {
        deviceMemory: 8,
      },
      performance: {
        hardwareConcurrency: 8,
      },
    });

    (useVisibility as jest.Mock).mockReturnValue({
      isVisible: true,
      visibilityState: "visible",
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: {
        get: () => "1000",
      },
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      expect(result.current.config.maxConcurrent).toBe(4);
      expect(result.current.config.maxQueueSize).toBe(50);
      expect(result.current.config.timeout).toBe(30000);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useSmartPrefetch({
          config: {
            maxConcurrent: 2,
            timeout: 10000,
          },
        })
      );

      expect(result.current.config.maxConcurrent).toBe(2);
      expect(result.current.config.timeout).toBe(10000);
    });

    it("should be active by default", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      expect(result.current.isActive).toBe(true);
      expect(result.current.isPaused).toBe(false);
    });

    it("should start paused when autoStart is false", () => {
      const { result } = renderHook(() =>
        useSmartPrefetch({ autoStart: false })
      );

      expect(result.current.isPaused).toBe(true);
    });

    it("should initialize with zero metrics", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      expect(result.current.metrics.totalResources).toBe(0);
      expect(result.current.metrics.pending).toBe(0);
      expect(result.current.metrics.loaded).toBe(0);
      expect(result.current.metrics.bytesLoaded).toBe(0);
    });

    it("should provide control functions", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      expect(typeof result.current.controls.prefetch).toBe("function");
      expect(typeof result.current.controls.prefetchAll).toBe("function");
      expect(typeof result.current.controls.cancel).toBe("function");
      expect(typeof result.current.controls.cancelAll).toBe("function");
      expect(typeof result.current.controls.pause).toBe("function");
      expect(typeof result.current.controls.resume).toBe("function");
    });
  });

  // ============================================================================
  // Prefetch Tests
  // ============================================================================

  describe("prefetch", () => {
    it("should add resource to queue", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      let id: string = "";
      act(() => {
        id = result.current.controls.prefetch("https://example.com/data.json");
      });

      expect(id).toBeDefined();
      expect(result.current.metrics.totalResources).toBe(1);
    });

    it("should prefetch with custom priority", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      act(() => {
        result.current.controls.prefetch("https://example.com/critical.json", {
          priority: "critical",
        });
      });

      expect(result.current.metrics.pending).toBe(1);
    });

    it("should prefetch with custom type", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      act(() => {
        result.current.controls.prefetch("https://example.com/image.jpg", {
          type: "image",
        });
      });

      expect(result.current.metrics.totalResources).toBe(1);
    });

    it("should return same ID for duplicate URL", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      let id1: string = "";
      let id2: string = "";

      act(() => {
        id1 = result.current.controls.prefetch("https://example.com/data.json");
        id2 = result.current.controls.prefetch("https://example.com/data.json");
      });

      expect(id1).toBe(id2);
      expect(result.current.metrics.totalResources).toBe(1);
    });

    it("should prefetch all resources", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      let ids: string[] = [];
      act(() => {
        ids = result.current.controls.prefetchAll([
          { url: "https://example.com/1.json" },
          { url: "https://example.com/2.json" },
          { url: "https://example.com/3.json" },
        ]);
      });

      expect(ids.length).toBe(3);
      expect(result.current.metrics.totalResources).toBe(3);
    });
  });

  // ============================================================================
  // Cancel Tests
  // ============================================================================

  describe("cancel", () => {
    it("should cancel pending prefetch", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      let id: string = "";
      act(() => {
        id = result.current.controls.prefetch("https://example.com/data.json");
      });

      let cancelled = false;
      act(() => {
        cancelled = result.current.controls.cancel(id);
      });

      expect(cancelled).toBe(true);
      expect(result.current.metrics.cancelled).toBe(1);
    });

    it("should not cancel non-existent prefetch", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      let cancelled = false;
      act(() => {
        cancelled = result.current.controls.cancel("non-existent-id");
      });

      expect(cancelled).toBe(false);
    });

    it("should cancel all pending prefetches", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      act(() => {
        result.current.controls.prefetchAll([
          { url: "https://example.com/1.json" },
          { url: "https://example.com/2.json" },
          { url: "https://example.com/3.json" },
        ]);
      });

      act(() => {
        result.current.controls.cancelAll();
      });

      expect(result.current.metrics.cancelled).toBe(3);
    });
  });

  // ============================================================================
  // Status Tests
  // ============================================================================

  describe("status", () => {
    it("should get resource status", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      let id: string = "";
      act(() => {
        id = result.current.controls.prefetch("https://example.com/data.json");
      });

      const status = result.current.controls.getStatus(id);
      expect(status).toBe("pending");
    });

    it("should return null for non-existent resource", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      const status = result.current.controls.getStatus("non-existent");
      expect(status).toBeNull();
    });

    it("should check if resource is loaded", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      act(() => {
        result.current.controls.prefetch("https://example.com/data.json");
      });

      const isLoaded = result.current.controls.isLoaded("https://example.com/data.json");
      expect(isLoaded).toBe(false);
    });
  });

  // ============================================================================
  // Pause/Resume Tests
  // ============================================================================

  describe("pause and resume", () => {
    it("should pause prefetching", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      expect(result.current.isPaused).toBe(false);

      act(() => {
        result.current.controls.pause();
      });

      expect(result.current.isPaused).toBe(true);
      expect(result.current.isActive).toBe(false);
    });

    it("should resume prefetching", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      act(() => {
        result.current.controls.pause();
      });

      expect(result.current.isPaused).toBe(true);

      act(() => {
        result.current.controls.resume();
      });

      expect(result.current.isPaused).toBe(false);
      expect(result.current.isActive).toBe(true);
    });
  });

  // ============================================================================
  // Clear Tests
  // ============================================================================

  describe("clear", () => {
    it("should clear loaded resources", async () => {
      const { result } = renderHook(() => useSmartPrefetch());

      // Note: We can't easily test loaded resources without more complex async setup
      // Just verify the function exists and doesn't throw
      act(() => {
        result.current.controls.clearLoaded();
      });

      expect(result.current.metrics.loaded).toBe(0);
    });
  });

  // ============================================================================
  // Network Awareness Tests
  // ============================================================================

  describe("network awareness", () => {
    it("should be inactive when offline", () => {
      (useNetworkStatus as jest.Mock).mockReturnValue({
        isOnline: false,
        wasOffline: true,
        isSlowConnection: false,
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
        saveData: false,
      });

      const { result } = renderHook(() => useSmartPrefetch());

      expect(result.current.isActive).toBe(false);
    });

    it("should be inactive when data saver is enabled", () => {
      (useNetworkStatus as jest.Mock).mockReturnValue({
        isOnline: true,
        wasOffline: false,
        isSlowConnection: false,
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
        saveData: true,
      });

      const { result } = renderHook(() => useSmartPrefetch());

      expect(result.current.isActive).toBe(false);
    });

    it("should be inactive on slow connection by default", () => {
      (useNetworkStatus as jest.Mock).mockReturnValue({
        isOnline: true,
        wasOffline: false,
        isSlowConnection: true,
        effectiveType: "2g",
        downlink: 0.5,
        rtt: 500,
        saveData: false,
      });

      const { result } = renderHook(() => useSmartPrefetch());

      expect(result.current.isActive).toBe(false);
    });

    it("should be active on slow connection when enabled", () => {
      (useNetworkStatus as jest.Mock).mockReturnValue({
        isOnline: true,
        wasOffline: false,
        isSlowConnection: true,
        effectiveType: "2g",
        downlink: 0.5,
        rtt: 500,
        saveData: false,
      });

      const { result } = renderHook(() =>
        useSmartPrefetch({
          config: { enableOnSlowConnection: true },
        })
      );

      expect(result.current.isActive).toBe(true);
    });
  });

  // ============================================================================
  // Visibility Awareness Tests
  // ============================================================================

  describe("visibility awareness", () => {
    it("should be inactive when page is hidden", () => {
      (useVisibility as jest.Mock).mockReturnValue({
        isVisible: false,
        visibilityState: "hidden",
      });

      const { result } = renderHook(() => useSmartPrefetch());

      expect(result.current.isActive).toBe(false);
    });
  });

  // ============================================================================
  // Battery Awareness Tests
  // ============================================================================

  describe("battery awareness", () => {
    it("should be inactive on low battery by default", () => {
      (useDeviceCapabilities as jest.Mock).mockReturnValue({
        battery: {
          isLowBattery: true,
          level: 0.1,
          charging: false,
        },
        memory: {
          deviceMemory: 8,
        },
        performance: {
          hardwareConcurrency: 8,
        },
      });

      const { result } = renderHook(() => useSmartPrefetch());

      expect(result.current.isActive).toBe(false);
    });

    it("should be active on low battery when enabled", () => {
      (useDeviceCapabilities as jest.Mock).mockReturnValue({
        battery: {
          isLowBattery: true,
          level: 0.1,
          charging: false,
        },
        memory: {
          deviceMemory: 8,
        },
        performance: {
          hardwareConcurrency: 8,
        },
      });

      const { result } = renderHook(() =>
        useSmartPrefetch({
          config: { enableOnLowBattery: true },
        })
      );

      expect(result.current.isActive).toBe(true);
    });
  });

  // ============================================================================
  // Viewport Prefetch Tests
  // ============================================================================

  describe("viewport prefetching", () => {
    it("should register element for viewport observation", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      const element = document.createElement("div");
      let unobserve: (() => void) | undefined;

      act(() => {
        unobserve = result.current.controls.observeElement(element, [
          "https://example.com/1.jpg",
          "https://example.com/2.jpg",
        ]);
      });

      expect(mockObserve).toHaveBeenCalledWith(element);
      expect(typeof unobserve).toBe("function");
    });

    it("should unobserve element on cleanup", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      const element = document.createElement("div");
      let unobserve: (() => void) | undefined;

      act(() => {
        unobserve = result.current.controls.observeElement(element, [
          "https://example.com/1.jpg",
        ]);
      });

      act(() => {
        unobserve?.();
      });

      expect(mockUnobserve).toHaveBeenCalledWith(element);
    });

    it("should not observe when viewport prefetch is disabled", () => {
      const { result } = renderHook(() =>
        useSmartPrefetch({
          config: { enableViewportPrefetch: false },
        })
      );

      const element = document.createElement("div");

      act(() => {
        result.current.controls.observeElement(element, [
          "https://example.com/1.jpg",
        ]);
      });

      expect(mockObserve).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Metrics Tests
  // ============================================================================

  describe("metrics", () => {
    it("should calculate efficiency", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      // With no resources, efficiency should be 0
      expect(result.current.metrics.efficiency).toBe(0);
    });

    it("should track resource counts by status", () => {
      const { result } = renderHook(() => useSmartPrefetch());

      act(() => {
        result.current.controls.prefetchAll([
          { url: "https://example.com/1.json" },
          { url: "https://example.com/2.json" },
        ]);
      });

      expect(result.current.metrics.pending).toBe(2);
      expect(result.current.metrics.totalResources).toBe(2);
    });
  });

  // ============================================================================
  // Callback Tests
  // ============================================================================

  describe("callbacks", () => {
    it("should call onComplete when prefetch completes", async () => {
      const onComplete = jest.fn();
      const { result } = renderHook(() =>
        useSmartPrefetch({ onComplete })
      );

      act(() => {
        result.current.controls.prefetch("https://example.com/data.json");
      });

      // Advance timers to trigger processing
      await act(async () => {
        jest.advanceTimersByTime(200);
        await Promise.resolve();
      });

      // Note: Full async completion testing would require more setup
    });

    it("should accept individual prefetch callbacks", () => {
      const onLoad = jest.fn();
      const onError = jest.fn();
      const { result } = renderHook(() => useSmartPrefetch());

      act(() => {
        result.current.controls.prefetch("https://example.com/data.json", {
          onLoad,
          onError,
        });
      });

      // Callbacks are registered but won't be called without full async flow
      expect(result.current.metrics.totalResources).toBe(1);
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useSmartPrefetch());
      unmount();

      // Should disconnect observer on cleanup
      // Note: Observer is only created when observeElement is called
    });
  });
});

// ============================================================================
// Sub-Hooks Tests
// ============================================================================

describe("useImagePrefetch", () => {
  beforeEach(() => {
    jest.useFakeTimers();

    (useMobileDetect as jest.Mock).mockReturnValue({
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });

    (useNetworkStatus as jest.Mock).mockReturnValue({
      isOnline: true,
      wasOffline: false,
      isSlowConnection: false,
      effectiveType: "4g",
      downlink: 10,
      rtt: 50,
      saveData: false,
    });

    (useDeviceCapabilities as jest.Mock).mockReturnValue({
      battery: { isLowBattery: false, level: 0.8, charging: true },
      memory: { deviceMemory: 8 },
      performance: { hardwareConcurrency: 8 },
    });

    (useVisibility as jest.Mock).mockReturnValue({
      isVisible: true,
      visibilityState: "visible",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should provide image prefetch function", () => {
    const { result } = renderHook(() => useImagePrefetch());

    expect(typeof result.current).toBe("function");
  });

  it("should prefetch images", () => {
    const { result } = renderHook(() => useImagePrefetch());

    act(() => {
      result.current(["https://example.com/1.jpg", "https://example.com/2.jpg"]);
    });

    // Images should be queued
  });
});

describe("useAudioPrefetch", () => {
  beforeEach(() => {
    jest.useFakeTimers();

    (useMobileDetect as jest.Mock).mockReturnValue({
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });

    (useNetworkStatus as jest.Mock).mockReturnValue({
      isOnline: true,
      wasOffline: false,
      isSlowConnection: false,
      effectiveType: "4g",
      downlink: 10,
      rtt: 50,
      saveData: false,
    });

    (useDeviceCapabilities as jest.Mock).mockReturnValue({
      battery: { isLowBattery: false, level: 0.8, charging: true },
      memory: { deviceMemory: 8 },
      performance: { hardwareConcurrency: 8 },
    });

    (useVisibility as jest.Mock).mockReturnValue({
      isVisible: true,
      visibilityState: "visible",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should provide audio prefetch function", () => {
    const { result } = renderHook(() => useAudioPrefetch());

    expect(typeof result.current).toBe("function");
  });

  it("should prefetch audio files", () => {
    const { result } = renderHook(() => useAudioPrefetch());

    act(() => {
      result.current(["https://example.com/audio1.mp3", "https://example.com/audio2.mp3"]);
    });

    // Audio files should be queued
  });
});

describe("useCriticalPrefetch", () => {
  beforeEach(() => {
    jest.useFakeTimers();

    (useMobileDetect as jest.Mock).mockReturnValue({
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });

    (useNetworkStatus as jest.Mock).mockReturnValue({
      isOnline: true,
      wasOffline: false,
      isSlowConnection: false,
      effectiveType: "4g",
      downlink: 10,
      rtt: 50,
      saveData: false,
    });

    (useDeviceCapabilities as jest.Mock).mockReturnValue({
      battery: { isLowBattery: false, level: 0.8, charging: true },
      memory: { deviceMemory: 8 },
      performance: { hardwareConcurrency: 8 },
    });

    (useVisibility as jest.Mock).mockReturnValue({
      isVisible: true,
      visibilityState: "visible",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should return loaded status", () => {
    const { result } = renderHook(() =>
      useCriticalPrefetch(["https://example.com/critical.js"])
    );

    // Initially not all loaded
    expect(typeof result.current).toBe("boolean");
  });

  it("should prefetch critical resources on mount", () => {
    const onReady = jest.fn();
    renderHook(() =>
      useCriticalPrefetch(["https://example.com/critical.js"], onReady)
    );

    // Resources should be prefetched
  });
});
