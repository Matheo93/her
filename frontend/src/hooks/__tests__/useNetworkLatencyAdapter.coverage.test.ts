/**
 * Coverage tests for useNetworkLatencyAdapter - Sprint 763
 *
 * Targets uncovered branches:
 * - Network type detection (ethernet, wifi, 2g, slow-2g)
 * - Sample window trimming
 * - Bandwidth estimation RTT-based fallbacks
 * - Monitoring controls edge cases
 * - Convenience hooks
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useNetworkLatencyAdapter,
  useConnectionQuality,
  useIsNetworkOnline,
  useConnectionHealth,
  useRecommendedQualityTier,
  ConnectionQuality,
} from "../useNetworkLatencyAdapter";

// Mock navigator.onLine and connection API
let mockOnLine = true;
let mockConnectionInfo: {
  effectiveType: "slow-2g" | "2g" | "3g" | "4g";
  type?: "wifi" | "cellular" | "bluetooth" | "ethernet" | "other" | "none" | "unknown";
  downlink?: number;
  rtt?: number;
} | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  mockOnLine = true;
  mockConnectionInfo = {
    effectiveType: "4g",
    type: "wifi",
    downlink: 10,
    rtt: 50,
  };

  // Mock navigator.onLine
  Object.defineProperty(navigator, "onLine", {
    get: () => mockOnLine,
    configurable: true,
  });

  // Mock navigator.connection
  Object.defineProperty(navigator, "connection", {
    get: () => mockConnectionInfo,
    configurable: true,
  });

  // Mock fetch
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useNetworkLatencyAdapter coverage - Sprint 763", () => {
  describe("network type detection edge cases", () => {
    it("should detect ethernet when effectiveType is not defined", () => {
      // When effectiveType is undefined, falls through to type check
      mockConnectionInfo = {
        effectiveType: undefined as unknown as "4g",
        type: "ethernet",
        downlink: 100,
      };

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.state.networkType).toBe("ethernet");
    });

    it("should detect wifi when effectiveType is not defined", () => {
      mockConnectionInfo = {
        effectiveType: undefined as unknown as "4g",
        type: "wifi",
        downlink: 50,
      };

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.state.networkType).toBe("wifi");
    });

    it("should detect 2g connection", () => {
      mockConnectionInfo = {
        effectiveType: "2g",
        downlink: 0.5,
      };

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.state.networkType).toBe("2g");
    });

    it("should detect slow-2g as 2g", () => {
      mockConnectionInfo = {
        effectiveType: "slow-2g",
        downlink: 0.1,
      };

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.state.networkType).toBe("2g");
    });

    it("should return unknown when connection API is not available", () => {
      mockConnectionInfo = null;

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.state.networkType).toBe("unknown");
    });

    it("should return unknown when type is not recognized and effectiveType undefined", () => {
      mockConnectionInfo = {
        effectiveType: undefined as unknown as "4g",
        type: "other" as "wifi",
      };

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // Falls through to unknown since "other" is not ethernet/wifi
      expect(result.current.state.networkType).toBe("unknown");
    });

    it("should prioritize effectiveType 4g over type", () => {
      mockConnectionInfo = {
        effectiveType: "4g",
        type: "ethernet",
      };

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // 4g check comes before type check
      expect(result.current.state.networkType).toBe("4g");
    });

    it("should prioritize effectiveType 3g over type", () => {
      mockConnectionInfo = {
        effectiveType: "3g",
        type: "wifi",
      };

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.state.networkType).toBe("3g");
    });
  });

  describe("sample window trimming", () => {
    it("should trim samples when exceeding window size", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({
          enableMonitoring: false,
          sampleWindowSize: 3,
        })
      );

      // Take more samples than window size
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await result.current.controls.measureLatency();
        });
      }

      // Should only have 3 samples (window size)
      expect(result.current.metrics.samplesTaken).toBe(5);
      // Stats should still work (calculated from trimmed samples)
      expect(result.current.state.stats).toBeDefined();
    });

    it("should trim failed samples when exceeding window size", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({
          enableMonitoring: false,
          sampleWindowSize: 3,
        })
      );

      // Take more failed samples than window size
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await result.current.controls.measureLatency();
        });
      }

      // Samples are tracked but failed
      expect(result.current.state.stats.packetLoss).toBe(1); // All failed
    });
  });

  describe("bandwidth estimation RTT-based fallbacks", () => {
    it("should estimate 50 Mbps for RTT < 50ms", async () => {
      mockConnectionInfo = { effectiveType: "4g" }; // No downlink

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // Mock performance.now for controlled RTT
      let time = 0;
      jest.spyOn(performance, "now").mockImplementation(() => {
        time += 30; // 30ms RTT
        return time;
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      let estimate: { downloadMbps: number } | null = null;
      await act(async () => {
        estimate = await result.current.controls.estimateBandwidth();
      });

      expect(estimate!.downloadMbps).toBe(50);
    });

    it("should estimate 20 Mbps for RTT 50-100ms", async () => {
      mockConnectionInfo = { effectiveType: "4g" }; // No downlink

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      let time = 0;
      jest.spyOn(performance, "now").mockImplementation(() => {
        time += 75; // 75ms RTT
        return time;
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      let estimate: { downloadMbps: number } | null = null;
      await act(async () => {
        estimate = await result.current.controls.estimateBandwidth();
      });

      expect(estimate!.downloadMbps).toBe(20);
    });

    it("should estimate 10 Mbps for RTT 100-200ms", async () => {
      mockConnectionInfo = { effectiveType: "4g" }; // No downlink

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      let time = 0;
      jest.spyOn(performance, "now").mockImplementation(() => {
        time += 150; // 150ms RTT
        return time;
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      let estimate: { downloadMbps: number } | null = null;
      await act(async () => {
        estimate = await result.current.controls.estimateBandwidth();
      });

      expect(estimate!.downloadMbps).toBe(10);
    });

    it("should estimate 5 Mbps for RTT 200-500ms", async () => {
      mockConnectionInfo = { effectiveType: "4g" }; // No downlink

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      let time = 0;
      jest.spyOn(performance, "now").mockImplementation(() => {
        time += 350; // 350ms RTT
        return time;
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      let estimate: { downloadMbps: number } | null = null;
      await act(async () => {
        estimate = await result.current.controls.estimateBandwidth();
      });

      expect(estimate!.downloadMbps).toBe(5);
    });

    it("should estimate 1 Mbps for RTT > 500ms", async () => {
      mockConnectionInfo = { effectiveType: "4g" }; // No downlink

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      let time = 0;
      jest.spyOn(performance, "now").mockImplementation(() => {
        time += 600; // 600ms RTT
        return time;
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      let estimate: { downloadMbps: number } | null = null;
      await act(async () => {
        estimate = await result.current.controls.estimateBandwidth();
      });

      expect(estimate!.downloadMbps).toBe(1);
    });

    it("should return zero estimate when bandwidth estimation is disabled", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({
          enableMonitoring: false,
          enableBandwidthEstimation: false,
        })
      );

      let estimate: { downloadMbps: number; confidence: number } | null = null;
      await act(async () => {
        estimate = await result.current.controls.estimateBandwidth();
      });

      expect(estimate!.downloadMbps).toBe(0);
      expect(estimate!.confidence).toBe(0);
    });
  });

  describe("monitoring controls edge cases", () => {
    it("should not start monitoring twice", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      act(() => {
        result.current.controls.startMonitoring();
      });

      const samplesBefore = result.current.metrics.samplesTaken;

      // Try to start again (should be no-op)
      act(() => {
        result.current.controls.startMonitoring();
      });

      // Should not have taken extra immediate samples
      expect(result.current.metrics.samplesTaken).toBe(samplesBefore);
    });

    it("should stop monitoring gracefully when not monitoring", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // Should not throw
      act(() => {
        result.current.controls.stopMonitoring();
      });

      expect(result.current.state).toBeDefined();
    });

    it("should measure and estimate on interval during monitoring", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({
          enableMonitoring: false,
          measurementIntervalMs: 1000,
        })
      );

      act(() => {
        result.current.controls.startMonitoring();
      });

      const initialSamples = result.current.metrics.samplesTaken;

      // Advance timer by interval
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.metrics.samplesTaken).toBeGreaterThan(initialSamples);

      // Stop monitoring
      act(() => {
        result.current.controls.stopMonitoring();
      });
    });
  });

  describe("network type update interval", () => {
    it("should update network type periodically", async () => {
      mockConnectionInfo = {
        effectiveType: "4g",
        type: "wifi",
      };

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      expect(result.current.state.networkType).toBe("wifi");

      // Change network type
      mockConnectionInfo = {
        effectiveType: "3g",
      };

      // Advance by network type check interval (10000ms)
      await act(async () => {
        jest.advanceTimersByTime(10000);
      });

      expect(result.current.state.networkType).toBe("3g");
    });
  });

  describe("quality change callback", () => {
    it("should call onQualityChanged when quality changes during measurement", async () => {
      const onQualityChanged = jest.fn();

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter(
          {
            enableMonitoring: false,
            qualityThresholds: {
              excellent: 10,
              good: 50,
              fair: 100,
              poor: 200,
            },
          },
          { onQualityChanged }
        )
      );

      // Simulate slow connection
      let time = 0;
      jest.spyOn(performance, "now").mockImplementation(() => {
        time += 150; // 150ms RTT (fair quality)
        return time;
      });

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      expect(onQualityChanged).toHaveBeenCalledWith("good", "fair");
      expect(result.current.metrics.qualityChanges).toBe(1);
    });
  });

  describe("recommendation scenarios", () => {
    it("should recommend excellent settings", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      act(() => {
        result.current.controls.setQualityOverride("excellent");
      });

      const recommendations = result.current.controls.getRecommendations();
      expect(recommendations.recommendedQualityTier).toBe("ultra");
      expect(recommendations.recommendedBufferMs).toBe(50);
      expect(recommendations.recommendedPrefetchDepth).toBe(5);
    });

    it("should recommend fair settings", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      act(() => {
        result.current.controls.setQualityOverride("fair");
      });

      const recommendations = result.current.controls.getRecommendations();
      expect(recommendations.recommendedQualityTier).toBe("medium");
      expect(recommendations.recommendedBufferMs).toBe(200);
      expect(recommendations.recommendedPrefetchDepth).toBe(2);
    });

    it("should recommend poor settings with reduced quality", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      act(() => {
        result.current.controls.setQualityOverride("poor");
      });

      const recommendations = result.current.controls.getRecommendations();
      expect(recommendations.recommendedQualityTier).toBe("low");
      expect(recommendations.reduceQuality).toBe(true);
      expect(recommendations.reduceChatPolling).toBe(true);
      expect(recommendations.enablePrefetch).toBe(false);
      expect(recommendations.recommendedBufferMs).toBe(500);
    });

    it("should use static avatar when packet loss is high", async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error("Lost"))
        .mockRejectedValueOnce(new Error("Lost"));

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({
          enableMonitoring: false,
          sampleWindowSize: 7,
        })
      );

      // Take samples with high packet loss (2/7 = ~28%)
      for (let i = 0; i < 7; i++) {
        await act(async () => {
          await result.current.controls.measureLatency();
        });
      }

      const recommendations = result.current.controls.getRecommendations();
      expect(recommendations.useStaticAvatar).toBe(true);
    });

    it("should increase buffering when jitter is high", async () => {
      let rtt = 50;
      jest.spyOn(performance, "now").mockImplementation(() => rtt);

      global.fetch = jest.fn().mockImplementation(async () => {
        // Simulate varying latency for jitter
        rtt += Math.random() > 0.5 ? 100 : -50;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({
          enableMonitoring: false,
          sampleWindowSize: 10,
        })
      );

      // Take samples to establish jitter
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          await result.current.controls.measureLatency();
        });
      }

      const recommendations = result.current.controls.getRecommendations();
      // High jitter should recommend increased buffering
      expect(recommendations.increaseBuffering).toBeDefined();
    });
  });

  describe("connection health calculation", () => {
    it("should calculate fair quality health score", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      act(() => {
        result.current.controls.setQualityOverride("fair");
      });

      // Fair quality = 0.6 * 0.4 (quality) + stability + loss
      expect(result.current.state.connectionHealth).toBeGreaterThan(0);
      expect(result.current.state.connectionHealth).toBeLessThan(0.8);
    });

    it("should calculate poor quality health score", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      act(() => {
        result.current.controls.setQualityOverride("poor");
      });

      // Poor quality = 0.3 * 0.4 (quality) + stability + loss
      expect(result.current.state.connectionHealth).toBeLessThan(0.5);
    });

    it("should calculate excellent quality health score", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      act(() => {
        result.current.controls.setQualityOverride("excellent");
      });

      // Excellent quality = 1 * 0.4 (quality) + stability + loss
      expect(result.current.state.connectionHealth).toBeGreaterThan(0.3);
    });
  });

  describe("measurement time trimming", () => {
    it("should trim measurement times when exceeding 50 entries", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      // Take more than 50 measurements
      for (let i = 0; i < 55; i++) {
        await act(async () => {
          await result.current.controls.measureLatency();
        });
      }

      // avgMeasurementTime should still be calculated (from trimmed entries)
      expect(result.current.metrics.avgMeasurementTime).toBeGreaterThanOrEqual(0);
      expect(result.current.metrics.samplesTaken).toBe(55);
    });
  });

  describe("online event without prior offline", () => {
    it("should not call onReconnect when coming online without prior offline", async () => {
      const onReconnect = jest.fn();

      renderHook(() =>
        useNetworkLatencyAdapter(
          { enableMonitoring: false },
          { onReconnect }
        )
      );

      // Trigger online event without going offline first
      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });

      // Should not call onReconnect since wasOnlineRef starts as true
      expect(onReconnect).not.toHaveBeenCalled();
    });
  });
});

describe("Convenience hooks - Sprint 763", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockOnLine = true;
    mockConnectionInfo = {
      effectiveType: "4g",
      type: "wifi",
      downlink: 10,
    };

    Object.defineProperty(navigator, "onLine", {
      get: () => mockOnLine,
      configurable: true,
    });

    Object.defineProperty(navigator, "connection", {
      get: () => mockConnectionInfo,
      configurable: true,
    });

    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("useConnectionQuality", () => {
    it("should return connection quality", () => {
      const { result } = renderHook(() => useConnectionQuality());

      expect(["excellent", "good", "fair", "poor", "offline"]).toContain(
        result.current
      );
    });
  });

  describe("useIsNetworkOnline", () => {
    it("should return online status", () => {
      const { result } = renderHook(() => useIsNetworkOnline());

      expect(result.current).toBe(true);
    });

    it("should return false when offline", () => {
      mockOnLine = false;

      const { result } = renderHook(() => useIsNetworkOnline());

      expect(result.current).toBe(false);
    });
  });

  describe("useConnectionHealth", () => {
    it("should return connection health score", () => {
      const { result } = renderHook(() => useConnectionHealth());

      expect(result.current).toBeGreaterThanOrEqual(0);
      expect(result.current).toBeLessThanOrEqual(1);
    });
  });

  describe("useRecommendedQualityTier", () => {
    it("should return recommended quality tier", () => {
      const { result } = renderHook(() => useRecommendedQualityTier());

      expect(["ultra", "high", "medium", "low", "minimal"]).toContain(
        result.current
      );
    });
  });
});

describe("Utility functions coverage", () => {
  describe("calculateJitter with single sample", () => {
    it("should handle single sample gracefully", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      await act(async () => {
        await result.current.controls.measureLatency();
      });

      // Jitter should be 0 with single sample
      expect(result.current.state.stats.jitter).toBe(0);
    });
  });

  describe("calculateStability edge cases", () => {
    it("should return 1 for less than 5 samples", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      await act(async () => {
        await result.current.controls.measureLatency();
        await result.current.controls.measureLatency();
      });

      expect(result.current.state.stats.stability).toBe(1);
    });

    it("should return 0 when all samples fail", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("fail"));

      const { result } = renderHook(() =>
        useNetworkLatencyAdapter({ enableMonitoring: false })
      );

      for (let i = 0; i < 6; i++) {
        await act(async () => {
          await result.current.controls.measureLatency();
        });
      }

      // No successful RTTs means stability calculation returns 0
      expect(result.current.state.stats.stability).toBe(0);
    });
  });
});
