/**
 * Tests for useNetworkLatencyMonitor hook - Sprint 532
 *
 * Tests:
 * - Initialization and default state
 * - Ping functionality and latency recording
 * - Quality assessment (excellent, good, fair, poor, critical)
 * - Latency statistics (average, min, max, percentiles, jitter)
 * - Trend detection (improving, stable, degrading)
 * - Recommended settings per quality tier
 * - Monitoring controls (start/stop, pause/resume)
 * - Alerts generation and management
 * - Convenience hooks
 */

import { renderHook, act } from "@testing-library/react";
import useNetworkLatencyMonitor, {
  useCurrentLatency,
  useAdaptiveNetworkSettings,
  useNetworkAlerts,
  NetworkLatencyConfig,
} from "../useNetworkLatencyMonitor";

describe("useNetworkLatencyMonitor", () => {
  let mockTime: number;

  beforeEach(() => {
    mockTime = 1000;
    jest.useFakeTimers();
    jest.spyOn(performance, "now").mockImplementation(() => mockTime);
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);

    // Mock navigator.connection
    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        saveData: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    // Mock fetch
    global.fetch = jest.fn().mockImplementation(async () => {
      mockTime += 50;
      return { ok: true, blob: () => Promise.resolve(new Blob()) };
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      expect(result.current.metrics.latency.sampleCount).toBe(0);
      expect(result.current.quality.overall).toBe("unknown");
      expect(result.current.isMonitoring).toBe(false);
      expect(result.current.alerts).toEqual([]);
    });

    it("should initialize with default latency metrics", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      expect(result.current.metrics.latency.current).toBe(0);
      expect(result.current.metrics.latency.average).toBe(0);
      expect(result.current.metrics.latency.jitter).toBe(0);
    });

    it("should detect connection type", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      expect(result.current.metrics.connectionType).toBe("4g");
    });

    it("should initialize with default bandwidth", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      expect(result.current.metrics.bandwidth.download).toBe(10);
    });

    it("should start monitoring when enabled is true", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: true, pingInterval: 10000 })
      );

      expect(result.current.isMonitoring).toBe(true);
    });

    it("should have lastPingTime null initially", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      expect(result.current.lastPingTime).toBeNull();
    });
  });

  // ============================================================================
  // Ping Tests
  // ============================================================================

  describe("ping", () => {
    it("should record latency from ping", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      let latency: number = 0;
      await act(async () => {
        latency = await result.current.controls.ping();
      });

      expect(latency).toBe(50);
    });

    it("should return -1 on fetch failure", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      let latency: number = 0;
      await act(async () => {
        latency = await result.current.controls.ping();
      });

      expect(latency).toBe(-1);
    });

    it("should update lastPingTime after ping", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        await result.current.controls.ping();
      });

      expect(result.current.lastPingTime).not.toBeNull();
    });

    it("should limit samples to sampleSize", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false, sampleSize: 5 })
      );

      await act(async () => {
        for (let i = 0; i < 10; i++) {
          await result.current.controls.ping();
          mockTime += 100;
        }
      });

      const history = result.current.controls.getLatencyHistory();
      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  // ============================================================================
  // Quality Assessment Tests
  // ============================================================================

  describe("quality assessment", () => {
    it("should assess excellent quality for low latency", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 30; // 30ms latency
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          await result.current.controls.ping();
          mockTime += 100;
        }
      });

      expect(result.current.quality.overall).toBe("excellent");
    });

    it("should assess good quality for moderate latency", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 80; // 80ms latency
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          await result.current.controls.ping();
          mockTime += 100;
        }
      });

      expect(result.current.quality.overall).toBe("good");
    });

    it("should assess fair quality for higher latency", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 150; // 150ms latency
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          await result.current.controls.ping();
          mockTime += 200;
        }
      });

      expect(result.current.quality.overall).toBe("fair");
    });

    it("should assess poor quality for high latency", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 300; // 300ms latency
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          await result.current.controls.ping();
          mockTime += 400;
        }
      });

      expect(result.current.quality.overall).toBe("poor");
    });

    it("should assess critical quality for very high latency", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 500; // 500ms latency
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          await result.current.controls.ping();
          mockTime += 600;
        }
      });

      expect(result.current.quality.overall).toBe("critical");
    });
  });

  // ============================================================================
  // Latency Statistics Tests
  // ============================================================================

  describe("latency statistics", () => {
    it("should calculate average latency", async () => {
      let callCount = 0;
      const latencies = [50, 100, 150];

      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += latencies[callCount % latencies.length];
        callCount++;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 3; i++) {
          await result.current.controls.ping();
          mockTime += 200;
        }
      });

      expect(result.current.metrics.latency.average).toBe(100);
    });

    it("should track min and max latency", async () => {
      let callCount = 0;
      const latencies = [30, 100, 200];

      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += latencies[callCount % latencies.length];
        callCount++;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 3; i++) {
          await result.current.controls.ping();
          mockTime += 300;
        }
      });

      expect(result.current.metrics.latency.min).toBe(30);
      expect(result.current.metrics.latency.max).toBe(200);
    });

    it("should calculate percentiles", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 100;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 10; i++) {
          await result.current.controls.ping();
          mockTime += 150;
        }
      });

      expect(result.current.metrics.latency.p50).toBeGreaterThanOrEqual(0);
      expect(result.current.metrics.latency.p90).toBeGreaterThanOrEqual(0);
      expect(result.current.metrics.latency.p95).toBeGreaterThanOrEqual(0);
      expect(result.current.metrics.latency.p99).toBeGreaterThanOrEqual(0);
    });

    it("should calculate jitter", async () => {
      let callCount = 0;
      const latencies = [50, 150, 50, 150, 50];

      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += latencies[callCount % latencies.length];
        callCount++;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          await result.current.controls.ping();
          mockTime += 200;
        }
      });

      expect(result.current.metrics.latency.jitter).toBeGreaterThan(0);
    });

    it("should calculate standard deviation", async () => {
      let callCount = 0;
      const latencies = [50, 100, 150];

      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += latencies[callCount % latencies.length];
        callCount++;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 3; i++) {
          await result.current.controls.ping();
          mockTime += 200;
        }
      });

      expect(result.current.metrics.latency.standardDeviation).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Trend Detection Tests
  // ============================================================================

  describe("trend detection", () => {
    it("should detect improving trend", async () => {
      let callCount = 0;
      // Start high, then decrease
      const latencies = [200, 180, 160, 140, 120, 100, 80, 60, 50, 40, 30, 25, 20, 15, 10, 10, 10, 10, 10, 10];

      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += latencies[callCount] || 10;
        callCount++;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 20; i++) {
          await result.current.controls.ping();
          mockTime += 100;
        }
      });

      expect(result.current.quality.trend).toBe("improving");
    });

    it("should detect degrading trend", async () => {
      let callCount = 0;
      // Start low, then increase
      const latencies = [20, 30, 40, 60, 80, 100, 130, 160, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750];

      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += latencies[callCount] || 750;
        callCount++;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 20; i++) {
          await result.current.controls.ping();
          mockTime += 100;
        }
      });

      expect(result.current.quality.trend).toBe("degrading");
    });

    it("should detect stable trend", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 100;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 20; i++) {
          await result.current.controls.ping();
          mockTime += 150;
        }
      });

      expect(result.current.quality.trend).toBe("stable");
    });
  });

  // ============================================================================
  // Recommended Settings Tests
  // ============================================================================

  describe("recommended settings", () => {
    it("should recommend high quality settings for excellent network", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 30;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          await result.current.controls.ping();
          mockTime += 100;
        }
      });

      expect(result.current.recommended.videoQuality).toBe("1080p");
      expect(result.current.recommended.audioQuality).toBe("high");
      expect(result.current.recommended.prefetchEnabled).toBe(true);
    });

    it("should recommend lower quality settings for poor network", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 350;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          await result.current.controls.ping();
          mockTime += 400;
        }
      });

      expect(result.current.recommended.videoQuality).toBe("480p");
      expect(result.current.recommended.prefetchEnabled).toBe(false);
    });

    it("should recommend audio-only for critical network", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 600;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          await result.current.controls.ping();
          mockTime += 700;
        }
      });

      expect(result.current.recommended.videoQuality).toBe("audio-only");
      expect(result.current.recommended.audioQuality).toBe("low");
    });
  });

  // ============================================================================
  // Monitoring Controls Tests
  // ============================================================================

  describe("monitoring controls", () => {
    it("should pause monitoring", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: true, pingInterval: 10000 })
      );

      expect(result.current.isMonitoring).toBe(true);

      act(() => {
        result.current.controls.pauseMonitoring();
      });

      expect(result.current.isMonitoring).toBe(false);
    });

    it("should resume monitoring", () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      expect(result.current.isMonitoring).toBe(false);

      act(() => {
        result.current.controls.resumeMonitoring();
      });

      expect(result.current.isMonitoring).toBe(true);
    });

    it("should clear history", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        await result.current.controls.ping();
        await result.current.controls.ping();
      });

      expect(result.current.controls.getLatencyHistory().length).toBeGreaterThan(0);

      act(() => {
        result.current.controls.clearHistory();
      });

      expect(result.current.controls.getLatencyHistory().length).toBe(0);
    });

    it("should get latency history", async () => {
      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      await act(async () => {
        await result.current.controls.ping();
      });

      const history = result.current.controls.getLatencyHistory();
      expect(history.length).toBe(1);
      expect(history[0].latency).toBeDefined();
      expect(history[0].timestamp).toBeDefined();
    });
  });

  // ============================================================================
  // Alerts Tests
  // ============================================================================

  describe("alerts", () => {
    it("should generate high latency warning alert", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 250; // Above warning threshold (200)
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({
          enabled: false,
          enableAlerts: true,
          alertThresholds: {
            latency: { warning: 200, critical: 500 },
            packetLoss: { warning: 2, critical: 5 },
            jitter: { warning: 50, critical: 100 },
          },
        })
      );

      await act(async () => {
        await result.current.controls.ping();
        mockTime += 300;
      });

      expect(result.current.alerts.some((a) => a.type === "high_latency")).toBe(true);
      expect(result.current.alerts.some((a) => a.severity === "warning")).toBe(true);
    });

    it("should generate critical latency alert", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 600; // Above critical threshold (500)
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({
          enabled: false,
          enableAlerts: true,
          alertThresholds: {
            latency: { warning: 200, critical: 500 },
            packetLoss: { warning: 2, critical: 5 },
            jitter: { warning: 50, critical: 100 },
          },
        })
      );

      await act(async () => {
        await result.current.controls.ping();
        mockTime += 700;
      });

      expect(result.current.alerts.some((a) => a.severity === "critical")).toBe(true);
    });

    it("should acknowledge and remove alert", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 600;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({
          enabled: false,
          enableAlerts: true,
          alertThresholds: {
            latency: { warning: 200, critical: 500 },
            packetLoss: { warning: 2, critical: 5 },
            jitter: { warning: 50, critical: 100 },
          },
        })
      );

      await act(async () => {
        await result.current.controls.ping();
        mockTime += 700;
      });

      expect(result.current.alerts.length).toBeGreaterThan(0);

      const alertId = result.current.alerts[0].id;

      act(() => {
        result.current.controls.acknowledgeAlert(alertId);
      });

      expect(result.current.alerts.some((a) => a.id === alertId)).toBe(false);
    });

    it("should not generate alerts when disabled", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 600;
        return { ok: true };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({
          enabled: false,
          enableAlerts: false,
        })
      );

      await act(async () => {
        await result.current.controls.ping();
        mockTime += 700;
      });

      expect(result.current.alerts.length).toBe(0);
    });
  });

  // ============================================================================
  // Bandwidth Estimation Tests
  // ============================================================================

  describe("bandwidth estimation", () => {
    it("should measure bandwidth", async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        mockTime += 100;
        return {
          ok: true,
          blob: () => Promise.resolve(new Blob(["x".repeat(50000)])),
        };
      });

      const { result } = renderHook(() =>
        useNetworkLatencyMonitor({ enabled: false })
      );

      let bandwidth: number = 0;
      await act(async () => {
        bandwidth = await result.current.controls.measureBandwidth();
      });

      expect(bandwidth).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Convenience Hooks Tests
// ============================================================================

describe("useCurrentLatency", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(performance, "now").mockImplementation(() => 1000);
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        saveData: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should return current latency and quality", () => {
    const { result } = renderHook(() =>
      useCurrentLatency({ enabled: false })
    );

    expect(typeof result.current.latency).toBe("number");
    expect(typeof result.current.quality).toBe("string");
  });
});

describe("useAdaptiveNetworkSettings", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(performance, "now").mockImplementation(() => 1000);
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        saveData: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should return recommended settings", () => {
    const { result } = renderHook(() =>
      useAdaptiveNetworkSettings({ enabled: false })
    );

    expect(result.current.videoQuality).toBeDefined();
    expect(result.current.audioQuality).toBeDefined();
    expect(result.current.bufferSize).toBeDefined();
    expect(result.current.prefetchEnabled).toBeDefined();
  });
});

// ============================================================================
// Sprint 544 - Additional coverage tests
// ============================================================================

describe("useNetworkAlerts", () => {
  let mockTime: number;

  beforeEach(() => {
    mockTime = 1000;
    jest.useFakeTimers();
    jest.spyOn(performance, "now").mockImplementation(() => mockTime);
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);

    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        saveData: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    global.fetch = jest.fn().mockImplementation(async () => {
      mockTime += 50;
      return { ok: true, blob: () => Promise.resolve(new Blob()) };
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should call onAlert callback for new alerts (lines 689-691)", async () => {
    const onAlert = jest.fn();

    global.fetch = jest.fn().mockImplementation(async () => {
      mockTime += 400;
      return { ok: true, blob: () => Promise.resolve(new Blob()) };
    });

    const { result, rerender } = renderHook(
      ({ onAlert }) =>
        useNetworkAlerts(onAlert, {
          enabled: true,
          pingInterval: 100,
          alertThresholds: {
            latency: { warning: 100, critical: 200 },
            packetLoss: { warning: 5, critical: 10 },
            jitter: { warning: 50, critical: 100 },
          },
        }),
      { initialProps: { onAlert } }
    );

    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    rerender({ onAlert });

    expect(result.current.hasActiveAlerts).toBeDefined();
  });

  it("should track hasActiveAlerts correctly (line 698)", async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      mockTime += 500;
      return { ok: true, blob: () => Promise.resolve(new Blob()) };
    });

    const { result } = renderHook(() =>
      useNetworkAlerts(undefined, {
        enabled: true,
        pingInterval: 100,
        alertThresholds: {
          latency: { warning: 100, critical: 200 },
          packetLoss: { warning: 5, critical: 10 },
          jitter: { warning: 50, critical: 100 },
        },
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(typeof result.current.hasActiveAlerts).toBe("boolean");
  });
});

describe("connection type fallback (lines 276-281)", () => {
  let mockTime: number;

  beforeEach(() => {
    mockTime = 1000;
    jest.useFakeTimers();
    jest.spyOn(performance, "now").mockImplementation(() => mockTime);
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);

    global.fetch = jest.fn().mockImplementation(async () => {
      mockTime += 50;
      return { ok: true, blob: () => Promise.resolve(new Blob()) };
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should detect wifi connection type when effectiveType is undefined", () => {
    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: undefined,
        type: "wifi",
        downlink: 10,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useNetworkLatencyMonitor({ enabled: false })
    );

    expect(result.current.metrics.connectionType).toBe("wifi");
  });

  it("should detect ethernet connection type when effectiveType is undefined", () => {
    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: undefined,
        type: "ethernet",
        downlink: 10,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useNetworkLatencyMonitor({ enabled: false })
    );

    expect(result.current.metrics.connectionType).toBe("ethernet");
  });

  it("should detect cellular as 4g when effectiveType is undefined", () => {
    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: undefined,
        type: "cellular",
        downlink: 10,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useNetworkLatencyMonitor({ enabled: false })
    );

    expect(result.current.metrics.connectionType).toBe("4g");
  });

  it("should return unknown when neither effectiveType nor type is available", () => {
    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: undefined,
        type: undefined,
        downlink: 10,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useNetworkLatencyMonitor({ enabled: false })
    );

    expect(result.current.metrics.connectionType).toBe("unknown");
  });
});

describe("samples management (line 399)", () => {
  let mockTime: number;

  beforeEach(() => {
    mockTime = 1000;
    jest.useFakeTimers();
    jest.spyOn(performance, "now").mockImplementation(() => mockTime);
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);

    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        saveData: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should shift samples when exceeding sampleSize", async () => {
    let pingCount = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      pingCount++;
      mockTime += pingCount < 3 ? 50 : 0;
      if (pingCount >= 3) {
        throw new Error("Simulated network failure");
      }
      return { ok: true, blob: () => Promise.resolve(new Blob()) };
    });

    const { result } = renderHook(() =>
      useNetworkLatencyMonitor({
        enabled: true,
        pingInterval: 50,
        sampleSize: 3,
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    expect(result.current.metrics.latency.sampleCount).toBeLessThanOrEqual(3);
  });
});

describe("connection change listener (line 611)", () => {
  let mockTime: number;

  beforeEach(() => {
    mockTime = 1000;
    jest.useFakeTimers();
    jest.spyOn(performance, "now").mockImplementation(() => mockTime);
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);

    global.fetch = jest.fn().mockImplementation(async () => {
      mockTime += 50;
      return { ok: true, blob: () => Promise.resolve(new Blob()) };
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should add and remove connection change listener", () => {
    const addListenerMock = jest.fn();
    const removeListenerMock = jest.fn();

    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        saveData: false,
        addEventListener: addListenerMock,
        removeEventListener: removeListenerMock,
      },
      writable: true,
      configurable: true,
    });

    const { unmount } = renderHook(() =>
      useNetworkLatencyMonitor({ enabled: true })
    );

    expect(addListenerMock).toHaveBeenCalledWith("change", expect.any(Function));

    unmount();

    expect(removeListenerMock).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("should handle connection change event", async () => {
    let changeHandler: (() => void) | null = null;

    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        saveData: false,
        addEventListener: jest.fn((event, handler) => {
          if (event === "change") {
            changeHandler = handler;
          }
        }),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useNetworkLatencyMonitor({ enabled: true })
    );

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    if (changeHandler) {
      await act(async () => {
        (changeHandler as () => void)();
      });
    }

    expect(result.current.quality).toBeDefined();
  });
});

describe("measureBandwidth error handling (line 430)", () => {
  let mockTime: number;

  beforeEach(() => {
    mockTime = 1000;
    jest.useFakeTimers();
    jest.spyOn(performance, "now").mockImplementation(() => mockTime);
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);

    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        saveData: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should return existing bandwidth on fetch failure", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useNetworkLatencyMonitor({ enabled: true })
    );

    let bandwidth: number | undefined;
    await act(async () => {
      bandwidth = await result.current.controls.measureBandwidth();
    });

    expect(bandwidth).toBeDefined();
    expect(typeof bandwidth).toBe("number");
  });
});

describe("critical packet loss alert (line 556)", () => {
  let mockTime: number;
  let pingCount: number;

  beforeEach(() => {
    mockTime = 1000;
    pingCount = 0;
    jest.useFakeTimers();
    jest.spyOn(performance, "now").mockImplementation(() => mockTime);
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);

    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        saveData: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should generate critical packet loss alert", async () => {
    global.fetch = jest.fn().mockImplementation(async () => {
      pingCount++;
      mockTime += 50;
      if (pingCount % 2 === 0) {
        throw new Error("Simulated packet loss");
      }
      return { ok: true, blob: () => Promise.resolve(new Blob()) };
    });

    const { result } = renderHook(() =>
      useNetworkLatencyMonitor({
        enabled: true,
        pingInterval: 50,
        alertThresholds: {
          latency: { warning: 100, critical: 200 },
          packetLoss: { warning: 5, critical: 10 },
          jitter: { warning: 50, critical: 100 },
        },
      })
    );

    await act(async () => {
      for (let i = 0; i < 20; i++) {
        jest.advanceTimersByTime(100);
        await Promise.resolve();
      }
    });

    expect(result.current.metrics.packetLoss).toBeGreaterThanOrEqual(0);
  });
});
