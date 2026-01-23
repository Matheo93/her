/**
 * Tests for Network Latency Adapter Hook - Sprint 526
 *
 * Tests RTT measurement, connection quality classification, bandwidth estimation,
 * and adaptation recommendations
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useNetworkLatencyAdapter,
  useConnectionQuality,
  useIsNetworkOnline,
  useConnectionHealth,
  useRecommendedQualityTier,
  type ConnectionQuality,
  type AdapterConfig,
} from "../useNetworkLatencyAdapter";

// Mock timers
let mockTime = 0;

// Mock navigator.onLine and connection API
const mockNavigator = {
  onLine: true,
  connection: {
    effectiveType: "4g" as const,
    type: "wifi" as const,
    downlink: 10,
    rtt: 50,
  },
};

// Mock fetch for latency measurement
const mockFetch = jest.fn();

beforeEach(() => {
  mockTime = 0;
  jest.useFakeTimers();
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);

  // Mock navigator
  Object.defineProperty(navigator, "onLine", {
    get: () => mockNavigator.onLine,
    configurable: true,
  });
  Object.defineProperty(navigator, "connection", {
    get: () => mockNavigator.connection,
    configurable: true,
  });

  // Mock fetch
  global.fetch = mockFetch;
  mockFetch.mockResolvedValue({ ok: true });

  // Reset mock navigator state
  mockNavigator.onLine = true;
  mockNavigator.connection.effectiveType = "4g";
  mockNavigator.connection.downlink = 10;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Helper to advance time and resolve fetch
async function advanceTimeAndFetch(ms: number = 50) {
  mockTime += ms;
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("useNetworkLatencyAdapter", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.state.isOnline).toBe(true);
      expect(result.current.state.connectionQuality).toBe("good");
      expect(result.current.state.currentRtt).toBe(0);
      expect(result.current.metrics.samplesTaken).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({
          targetLatencyMs: 50,
          measurementIntervalMs: 2000,
          enableMonitoring: false,
          qualityThresholds: {
            excellent: 25,
            good: 50,
            fair: 100,
            poor: 200,
          },
        })
      );

      // Check that hook initialized successfully
      expect(result.current.state).toBeDefined();
      expect(result.current.controls).toBeDefined();
      expect(result.current.recommendations).toBeDefined();
    });

    it("should detect network type from navigator", () => {
      mockNavigator.connection.effectiveType = "3g";

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.state.networkType).toBe("3g");
    });

    it("should detect offline state", () => {
      mockNavigator.onLine = false;

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.state.isOnline).toBe(false);
      expect(result.current.state.networkType).toBe("offline");
    });
  });

  describe("latency measurement", () => {
    it("should measure latency via fetch", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      mockFetch.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 0));
        return { ok: true };
      });

      await act(async () => {
        const rtt = await result.current.controls.measureLatency();
        expect(rtt).toBeGreaterThanOrEqual(0);
      });

      expect(result.current.metrics.samplesTaken).toBe(1);
    });

    it("should record successful samples", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      mockFetch.mockResolvedValue({ ok: true });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      expect(result.current.metrics.samplesTaken).toBe(1);
      expect(result.current.metrics.lastMeasurement).toBeGreaterThan(0);
    });

    it("should handle fetch errors gracefully", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      mockFetch.mockRejectedValue(new Error("Network error"));

      await act(async () => {
        const rtt = await result.current.controls.measureLatency();
        expect(rtt).toBe(Infinity);
      });
    });
  });

  describe("connection quality classification", () => {
    it("should classify excellent quality for low RTT", async () => {
      const onQualityChanged = jest.fn();
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter(
          {
            enableMonitoring: false,
            qualityThresholds: {
              excellent: 50,
              good: 100,
              fair: 200,
              poor: 500,
            },
          },
          { onQualityChanged }
        )
      );

      // Simulate fast RTT by controlling the mock
      mockFetch.mockImplementation(async () => {
        mockTime += 30; // 30ms RTT
        return { ok: true };
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      expect(result.current.state.connectionQuality).toBe("excellent");
    });

    it("should classify poor quality for high RTT", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({
          enableMonitoring: false,
          qualityThresholds: {
            excellent: 50,
            good: 100,
            fair: 200,
            poor: 500,
          },
        })
      );

      // Simulate slow RTT
      mockFetch.mockImplementation(async () => {
        mockTime += 400; // 400ms RTT
        return { ok: true };
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      expect(result.current.state.connectionQuality).toBe("poor");
    });
  });

  describe("bandwidth estimation", () => {
    it("should estimate bandwidth from Network Information API", async () => {
      mockNavigator.connection.downlink = 5; // 5 Mbps

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      await act(async () => {
        const estimate = await result.current.controls.estimateBandwidth();
        expect(estimate.downloadMbps).toBe(5);
        expect(estimate.confidence).toBeGreaterThan(0);
      });
    });

    it("should fall back to RTT-based estimation", async () => {
      // Remove downlink from mock
      mockNavigator.connection.downlink = undefined as unknown as number;

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // First record some samples
      mockFetch.mockImplementation(async () => {
        mockTime += 100;
        return { ok: true };
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      await act(async () => {
        const estimate = await result.current.controls.estimateBandwidth();
        expect(estimate.confidence).toBe(0.3); // Fallback has lower confidence
      });
    });
  });

  describe("adaptation recommendations", () => {
    it("should recommend high quality for excellent connection", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // Simulate excellent connection
      mockFetch.mockImplementation(async () => {
        mockTime += 30;
        return { ok: true };
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      const recommendations = result.current.controls.getRecommendations();
      expect(recommendations.recommendedQualityTier).toBe("ultra");
      expect(recommendations.reduceQuality).toBe(false);
      expect(recommendations.disableAnimations).toBe(false);
    });

    it("should recommend reduced quality for poor connection", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // Simulate poor connection
      mockFetch.mockImplementation(async () => {
        mockTime += 400;
        return { ok: true };
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      const recommendations = result.current.controls.getRecommendations();
      expect(recommendations.recommendedQualityTier).toBe("low");
      expect(recommendations.reduceQuality).toBe(true);
      expect(recommendations.reduceChatPolling).toBe(true);
    });

    it("should recommend minimal settings when offline", () => {
      mockNavigator.onLine = false;

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      const recommendations = result.current.controls.getRecommendations();
      expect(recommendations.recommendedQualityTier).toBe("minimal");
      expect(recommendations.disableAnimations).toBe(true);
      expect(recommendations.enablePrefetch).toBe(false);
    });
  });

  describe("monitoring controls", () => {
    it("should start and stop monitoring", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.metrics.samplesTaken).toBe(0);

      act(() => {
        result.current.controls.startMonitoring();
      });

      // Monitoring should have started and taken initial sample
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      act(() => {
        result.current.controls.stopMonitoring();
      });

      const samplesAfterStop = result.current.metrics.samplesTaken;

      // Advance more time - no new samples should be taken
      await act(async () => {
        jest.advanceTimersByTime(10000);
      });

      expect(result.current.metrics.samplesTaken).toBe(samplesAfterStop);
    });

    it("should force evaluation on demand", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      await act(async () => {
        result.current.controls.evaluate();
      });

      expect(result.current.metrics.samplesTaken).toBe(1);
    });

    it("should reset metrics", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // Generate some metrics
      await act(async () => {
        await result.current.controls.measureLatency();
        await result.current.controls.measureLatency();
      });

      expect(result.current.metrics.samplesTaken).toBe(2);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.samplesTaken).toBe(0);
      expect(result.current.metrics.latencySpikes).toBe(0);
    });

    it("should allow quality override", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // Set quality override
      act(() => {
        result.current.controls.setQualityOverride("poor");
      });

      expect(result.current.state.connectionQuality).toBe("poor");

      // Clear override
      act(() => {
        result.current.controls.setQualityOverride(null);
      });

      expect(result.current.state.connectionQuality).toBe("good"); // Back to default
    });
  });

  describe("connection stats", () => {
    it("should calculate connection stats from samples", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // Take multiple samples with varying RTT
      for (let rtt of [100, 120, 110, 130, 90]) {
        mockFetch.mockImplementationOnce(async () => {
          mockTime += rtt;
          return { ok: true };
        });
        await act(async () => {
          await result.current.controls.measureLatency();
        });
      }

      const stats = result.current.state.stats;
      expect(stats.avgRtt).toBeGreaterThan(0);
      expect(stats.minRtt).toBeLessThanOrEqual(stats.avgRtt);
      expect(stats.maxRtt).toBeGreaterThanOrEqual(stats.avgRtt);
    });
  });

  describe("callbacks", () => {
    it("should call onLatencySpike for high latency", async () => {
      const onLatencySpike = jest.fn();
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter(
          {
            enableMonitoring: false,
            spikeThresholdMs: 100,
          },
          { onLatencySpike }
        )
      );

      // Simulate spike
      mockFetch.mockImplementation(async () => {
        mockTime += 500; // Way above threshold
        return { ok: true };
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      expect(onLatencySpike).toHaveBeenCalled();
      expect(result.current.metrics.latencySpikes).toBe(1);
    });

    it("should call onQualityChanged when quality changes", async () => {
      const onQualityChanged = jest.fn();
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter(
          { enableMonitoring: false },
          { onQualityChanged }
        )
      );

      // Start with good, then degrade to poor
      mockFetch.mockImplementation(async () => {
        mockTime += 400;
        return { ok: true };
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      expect(onQualityChanged).toHaveBeenCalled();
    });
  });

  describe("online/offline events", () => {
    it("should handle offline event", async () => {
      const onDisconnect = jest.fn();
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter(
          { enableMonitoring: false },
          { onDisconnect }
        )
      );

      expect(result.current.state.isOnline).toBe(true);

      // Simulate offline event
      mockNavigator.onLine = false;
      await act(async () => {
        window.dispatchEvent(new Event("offline"));
      });

      expect(result.current.state.isOnline).toBe(false);
      expect(result.current.state.connectionQuality).toBe("offline");
      expect(onDisconnect).toHaveBeenCalled();
    });

    it("should handle online event", async () => {
      mockNavigator.onLine = false;

      const onReconnect = jest.fn();
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter(
          { enableMonitoring: false },
          { onReconnect }
        )
      );

      // Simulate coming back online
      mockNavigator.onLine = true;
      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });

      expect(result.current.state.isOnline).toBe(true);
    });
  });

  describe("connection health", () => {
    it("should calculate connection health score", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // Good connection should have high health
      mockFetch.mockImplementation(async () => {
        mockTime += 50;
        return { ok: true };
      });

      // Take several samples to build stability
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await result.current.controls.measureLatency();
        });
      }

      expect(result.current.state.connectionHealth).toBeGreaterThan(0.5);
    });

    it("should return 0 health when offline", () => {
      mockNavigator.onLine = false;

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.state.connectionHealth).toBe(0);
    });
  });
});

describe("convenience hooks", () => {
  describe("useConnectionQuality", () => {
    it("should return current connection quality", () => {
      const { result } = renderHook(() => useConnectionQuality());
      expect(["excellent", "good", "fair", "poor", "offline"]).toContain(
        result.current
      );
    });
  });

  describe("useIsNetworkOnline", () => {
    it("should return online status", () => {
      mockNavigator.onLine = true;
      const { result } = renderHook(() => useIsNetworkOnline());
      expect(result.current).toBe(true);
    });
  });

  describe("useConnectionHealth", () => {
    it("should return health score", () => {
      const { result } = renderHook(() => useConnectionHealth());
      expect(result.current).toBeGreaterThanOrEqual(0);
      expect(result.current).toBeLessThanOrEqual(1);
    });
  });

  describe("useRecommendedQualityTier", () => {
    it("should return recommended tier", () => {
      const { result } = renderHook(() => useRecommendedQualityTier());
      expect(["ultra", "high", "medium", "low", "minimal"]).toContain(
        result.current
      );
    });
  });
});
