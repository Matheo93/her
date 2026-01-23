/**
 * Tests for Mobile Avatar Latency Mitigator Hook - Sprint 521
 *
 * Tests frame timing, pose interpolation, and touch-to-visual latency measurement
 */

import { renderHook, act } from "@testing-library/react";
import {
  useMobileAvatarLatencyMitigator,
  usePoseInterpolation,
  useTouchLatencyMeasurement,
  type AvatarPose,
} from "../useMobileAvatarLatencyMitigator";

// Mock performance.now for consistent timing
let mockTime = 0;
const originalPerformanceNow = performance.now;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useMobileAvatarLatencyMitigator", () => {
  const createMockPose = (timestamp: number): AvatarPose => ({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    blendShapes: { smile: 0, blink: 0 },
    timestamp,
  });

  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useMobileAvatarLatencyMitigator());

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.currentStrategy).toBe("adaptive");
      expect(result.current.state.interpolationMode).toBe("easeOut");
      expect(result.current.state.isMeasuring).toBe(false);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          strategy: "aggressive",
          interpolationMode: "spring",
          targetFrameTimeMs: 33.33,
        })
      );

      expect(result.current.state.currentStrategy).toBe("aggressive");
      expect(result.current.state.interpolationMode).toBe("spring");
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useMobileAvatarLatencyMitigator());

      expect(result.current.metrics.totalMeasurements).toBe(0);
      expect(result.current.metrics.averageTouchLatencyMs).toBe(0);
      expect(result.current.metrics.missedFrames).toBe(0);
    });
  });

  describe("pose interpolation", () => {
    it("should interpolate position between two poses", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ interpolationMode: "linear" })
      );

      const from = createMockPose(0);
      from.position = { x: 0, y: 0, z: 0 };

      const to = createMockPose(100);
      to.position = { x: 100, y: 100, z: 100 };

      const interpolated = result.current.controls.interpolatePose(from, to, 0.5);

      expect(interpolated.position.x).toBe(50);
      expect(interpolated.position.y).toBe(50);
      expect(interpolated.position.z).toBe(50);
    });

    it("should interpolate rotation", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ interpolationMode: "linear" })
      );

      const from = createMockPose(0);
      from.rotation = { x: 0, y: 0, z: 0 };

      const to = createMockPose(100);
      to.rotation = { x: 90, y: 180, z: 270 };

      const interpolated = result.current.controls.interpolatePose(from, to, 0.5);

      expect(interpolated.rotation.x).toBe(45);
      expect(interpolated.rotation.y).toBe(90);
      expect(interpolated.rotation.z).toBe(135);
    });

    it("should interpolate blend shapes", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ interpolationMode: "linear" })
      );

      const from = createMockPose(0);
      from.blendShapes = { smile: 0, blink: 0 };

      const to = createMockPose(100);
      to.blendShapes = { smile: 1, blink: 1 };

      const interpolated = result.current.controls.interpolatePose(from, to, 0.5);

      expect(interpolated.blendShapes?.smile).toBe(0.5);
      expect(interpolated.blendShapes?.blink).toBe(0.5);
    });

    it("should clamp t value between 0 and 1", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ interpolationMode: "linear" })
      );

      const from = createMockPose(0);
      from.position = { x: 0, y: 0, z: 0 };

      const to = createMockPose(100);
      to.position = { x: 100, y: 100, z: 100 };

      // t < 0 should clamp to 0
      const under = result.current.controls.interpolatePose(from, to, -0.5);
      expect(under.position.x).toBe(0);

      // t > 1 should clamp to 1
      const over = result.current.controls.interpolatePose(from, to, 1.5);
      expect(over.position.x).toBe(100);
    });

    it("should apply easeOut curve", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ interpolationMode: "easeOut" })
      );

      const from = createMockPose(0);
      from.position = { x: 0, y: 0, z: 0 };

      const to = createMockPose(100);
      to.position = { x: 100, y: 0, z: 0 };

      // easeOut at t=0.5 should be > 0.5 due to deceleration curve
      const interpolated = result.current.controls.interpolatePose(from, to, 0.5);
      expect(interpolated.position.x).toBeGreaterThan(50);
    });
  });

  describe("latency measurement", () => {
    it("should track touch-to-visual latency", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ monitorFrameTiming: false })
      );

      // Start measurement at t=0
      mockTime = 0;
      let measurementId: string;
      act(() => {
        measurementId = result.current.controls.markTouchStart();
      });

      expect(result.current.state.isMeasuring).toBe(true);

      // Mark intermediate points
      mockTime = 5;
      act(() => {
        result.current.controls.markInputReceived(measurementId!);
      });

      mockTime = 10;
      act(() => {
        result.current.controls.markPoseCalculated(measurementId!);
      });

      mockTime = 15;
      act(() => {
        result.current.controls.markRenderStart(measurementId!);
      });

      // End measurement at t=20
      mockTime = 20;
      let latency: any;
      act(() => {
        latency = result.current.controls.markVisualUpdate(measurementId!);
      });

      expect(latency).toBeDefined();
      expect(latency.totalLatency).toBe(20);
      expect(latency.touchToInput).toBe(5);
      expect(latency.inputToPose).toBe(5);
      expect(latency.poseToRender).toBe(5);
      expect(latency.renderToVisual).toBe(5);
    });

    it("should update metrics after measurement", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ monitorFrameTiming: false })
      );

      // Perform a measurement
      mockTime = 0;
      let id: string;
      act(() => {
        id = result.current.controls.markTouchStart();
        result.current.controls.markInputReceived(id);
      });

      mockTime = 50;
      act(() => {
        result.current.controls.markVisualUpdate(id!);
      });

      expect(result.current.metrics.totalMeasurements).toBe(1);
      expect(result.current.metrics.averageTouchLatencyMs).toBe(50);
    });

    it("should call onLatencyMeasured callback", () => {
      const onLatencyMeasured = jest.fn();
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator(
          { monitorFrameTiming: false },
          { onLatencyMeasured }
        )
      );

      mockTime = 0;
      let id: string;
      act(() => {
        id = result.current.controls.markTouchStart();
      });

      mockTime = 30;
      act(() => {
        result.current.controls.markVisualUpdate(id!);
      });

      expect(onLatencyMeasured).toHaveBeenCalledWith(
        expect.objectContaining({ totalLatency: 30 })
      );
    });

    it("should call onHighLatency callback when latency exceeds threshold", () => {
      const onHighLatency = jest.fn();
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator(
          { monitorFrameTiming: false, adaptiveThreshold: 50 },
          { onHighLatency }
        )
      );

      mockTime = 0;
      let id: string;
      act(() => {
        id = result.current.controls.markTouchStart();
      });

      mockTime = 150; // Exceeds threshold of 50ms
      act(() => {
        result.current.controls.markVisualUpdate(id!);
      });

      expect(onHighLatency).toHaveBeenCalledWith(150);
    });
  });

  describe("strategy management", () => {
    it("should update strategy", () => {
      const onStrategyChange = jest.fn();
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator(
          { monitorFrameTiming: false },
          { onStrategyChange }
        )
      );

      act(() => {
        result.current.controls.updateStrategy("aggressive");
      });

      expect(result.current.state.currentStrategy).toBe("aggressive");
      expect(onStrategyChange).toHaveBeenCalledWith("aggressive");
    });

    it("should adapt interpolation mode based on strategy", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ monitorFrameTiming: false })
      );

      act(() => {
        result.current.controls.updateStrategy("conservative");
      });
      expect(result.current.state.interpolationMode).toBe("linear");

      act(() => {
        result.current.controls.updateStrategy("balanced");
      });
      expect(result.current.state.interpolationMode).toBe("easeOut");

      act(() => {
        result.current.controls.updateStrategy("aggressive");
      });
      expect(result.current.state.interpolationMode).toBe("predictive");
    });

    it("should auto-adapt strategy under high latency", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: false,
          strategy: "adaptive",
          adaptiveThreshold: 50,
        })
      );

      // Simulate high latency
      mockTime = 0;
      let id: string;
      act(() => {
        id = result.current.controls.markTouchStart();
      });

      mockTime = 200; // > 2x threshold
      act(() => {
        result.current.controls.markVisualUpdate(id!);
      });

      expect(result.current.state.currentStrategy).toBe("aggressive");
    });
  });

  describe("pose prediction", () => {
    it("should predict next pose based on history", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ monitorFrameTiming: false })
      );

      const history: AvatarPose[] = [
        { ...createMockPose(0), position: { x: 0, y: 0, z: 0 } },
        { ...createMockPose(16), position: { x: 10, y: 0, z: 0 } },
      ];

      let predicted: ReturnType<typeof result.current.controls.predictPose>;
      act(() => {
        predicted = result.current.controls.predictPose(history, 16);
      });

      expect(predicted).not.toBeNull();
      // Should extrapolate position based on velocity
      expect(predicted!.position.x).toBe(20);
    });

    it("should return null for insufficient history", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ monitorFrameTiming: false })
      );

      const predicted = result.current.controls.predictPose([createMockPose(0)], 16);

      expect(predicted).toBeNull();
    });

    it("should return null when prediction time exceeds max", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: false,
          maxPredictionMs: 50,
        })
      );

      const history: AvatarPose[] = [
        createMockPose(0),
        createMockPose(16),
      ];

      const predicted = result.current.controls.predictPose(history, 100);

      expect(predicted).toBeNull();
    });

    it("should increment prediction metrics", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ monitorFrameTiming: false })
      );

      const history: AvatarPose[] = [
        createMockPose(0),
        createMockPose(16),
      ];

      act(() => {
        result.current.controls.predictPose(history, 16);
      });

      expect(result.current.metrics.predictionsUsed).toBe(1);
    });
  });

  describe("optimal T calculation", () => {
    it("should calculate conservative T", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: false,
          strategy: "conservative",
        })
      );

      const t = result.current.controls.getOptimalT(16, 50);
      expect(t).toBe(16 / 50);
    });

    it("should calculate balanced T with slight boost", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: false,
          strategy: "balanced",
        })
      );

      const conservativeT = 16 / 50;
      const t = result.current.controls.getOptimalT(16, 50);
      expect(t).toBeCloseTo(conservativeT * 1.1, 5);
    });

    it("should calculate aggressive T with larger boost", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: false,
          strategy: "aggressive",
        })
      );

      const conservativeT = 16 / 50;
      const t = result.current.controls.getOptimalT(16, 50);
      expect(t).toBeCloseTo(conservativeT * 1.3, 5);
    });

    it("should clamp T to max of 1", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: false,
          strategy: "aggressive",
        })
      );

      const t = result.current.controls.getOptimalT(100, 50);
      expect(t).toBeLessThanOrEqual(1);
    });
  });

  describe("metrics reset", () => {
    it("should reset all metrics", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ monitorFrameTiming: false })
      );

      // Add some measurements
      mockTime = 0;
      let id: string;
      act(() => {
        id = result.current.controls.markTouchStart();
      });

      mockTime = 50;
      act(() => {
        result.current.controls.markVisualUpdate(id!);
      });

      expect(result.current.metrics.totalMeasurements).toBe(1);

      // Reset
      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.totalMeasurements).toBe(0);
      expect(result.current.metrics.averageTouchLatencyMs).toBe(0);
      expect(result.current.metrics.touchLatencies).toHaveLength(0);
    });
  });
});

describe("usePoseInterpolation", () => {
  const createMockPose = (timestamp: number): AvatarPose => ({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    timestamp,
  });

  it("should return interpolation function", () => {
    const { result } = renderHook(() => usePoseInterpolation("linear"));

    expect(typeof result.current).toBe("function");
  });

  it("should interpolate poses correctly", () => {
    const { result } = renderHook(() => usePoseInterpolation("linear"));

    const from = createMockPose(0);
    from.position = { x: 0, y: 0, z: 0 };

    const to = createMockPose(100);
    to.position = { x: 100, y: 100, z: 100 };

    const interpolated = result.current(from, to, 0.5);

    expect(interpolated.position.x).toBe(50);
  });
});

describe("useTouchLatencyMeasurement", () => {
  it("should provide measurement functions", () => {
    const { result } = renderHook(() => useTouchLatencyMeasurement());

    expect(typeof result.current.startMeasurement).toBe("function");
    expect(typeof result.current.endMeasurement).toBe("function");
    expect(result.current.averageLatency).toBe(0);
  });

  it("should measure latency", () => {
    const { result } = renderHook(() => useTouchLatencyMeasurement());

    mockTime = 0;
    let id: string;
    act(() => {
      id = result.current.startMeasurement();
    });

    mockTime = 25;
    act(() => {
      result.current.endMeasurement(id!);
    });

    expect(result.current.averageLatency).toBeGreaterThan(0);
  });
});
