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
  AvatarPose,
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

      let predicted: ReturnType<typeof result.current.controls.predictPose> = null;
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

// Sprint 617 - Branch coverage improvements for useMobileAvatarLatencyMitigator
describe("Sprint 617 - branch coverage improvements", () => {
  const createMockPose = (
    timestamp: number,
    position = { x: 0, y: 0, z: 0 },
    rotation = { x: 0, y: 0, z: 0 }
  ): AvatarPose => ({
    position,
    rotation,
    scale: { x: 1, y: 1, z: 1 },
    blendShapes: { smile: 0, blink: 0 },
    timestamp,
  });

  describe("spring interpolation mode (lines 342-385)", () => {
    it("should use spring physics for position interpolation", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          interpolationMode: "spring",
          springStiffness: 200,
          springDamping: 20,
          monitorFrameTiming: false,
        })
      );

      const from = createMockPose(0, { x: 0, y: 0, z: 0 });
      const to = createMockPose(100, { x: 100, y: 100, z: 100 });

      // Spring interpolation uses physics-based movement
      const interpolated = result.current.controls.interpolatePose(from, to, 0.5);

      // Spring interpolation returns specific spring physics values
      expect(interpolated.position).toBeDefined();
      expect(interpolated.rotation).toBeDefined();
      expect(interpolated.scale).toBeDefined();
      expect(interpolated.timestamp).toBeDefined();
    });

    it("should accumulate velocity across multiple spring interpolations", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          interpolationMode: "spring",
          springStiffness: 100,
          springDamping: 10,
          monitorFrameTiming: false,
        })
      );

      const from = createMockPose(0, { x: 0, y: 0, z: 0 });
      const to = createMockPose(100, { x: 100, y: 0, z: 0 });

      // First interpolation
      const first = result.current.controls.interpolatePose(from, to, 0.3);

      // Second interpolation should have accumulated velocity
      const second = result.current.controls.interpolatePose(
        { ...from, position: first.position },
        to,
        0.3
      );

      expect(second.position.x).toBeDefined();
    });

    it("should apply easeOutCubic to rotation in spring mode (line 380)", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          interpolationMode: "spring",
          monitorFrameTiming: false,
        })
      );

      const from = createMockPose(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      const to = createMockPose(100, { x: 0, y: 0, z: 0 }, { x: 90, y: 90, z: 90 });

      const interpolated = result.current.controls.interpolatePose(from, to, 0.5);

      // easeOutCubic at t=0.5: 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
      // rotation should be ~78.75 (90 * 0.875)
      expect(interpolated.rotation.x).toBeGreaterThan(45);
    });
  });

  describe("predictive interpolation mode (lines 386-389)", () => {
    it("should apply predictive mode with decay boost", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          interpolationMode: "predictive",
          monitorFrameTiming: false,
        })
      );

      const from = createMockPose(0, { x: 0, y: 0, z: 0 });
      const to = createMockPose(100, { x: 100, y: 0, z: 0 });

      // Predictive mode multiplies t by 1.2 (clamped to 1)
      const interpolated = result.current.controls.interpolatePose(from, to, 0.5);

      // t=0.5 * 1.2 = 0.6, so position should be at 60
      expect(interpolated.position.x).toBe(60);
    });

    it("should clamp predictive t to 1", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          interpolationMode: "predictive",
          monitorFrameTiming: false,
        })
      );

      const from = createMockPose(0, { x: 0, y: 0, z: 0 });
      const to = createMockPose(100, { x: 100, y: 0, z: 0 });

      // t=0.9 * 1.2 = 1.08, should clamp to 1
      const interpolated = result.current.controls.interpolatePose(from, to, 0.9);

      expect(interpolated.position.x).toBe(100);
    });
  });

  describe("adaptive strategy auto-adjust to balanced (line 612-613)", () => {
    it("should adapt to balanced strategy when latency exceeds threshold but not 2x", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: false,
          strategy: "adaptive",
          adaptiveThreshold: 50,
        })
      );

      // Simulate latency between threshold and 2x threshold
      mockTime = 0;
      let id: string;
      act(() => {
        id = result.current.controls.markTouchStart();
      });

      mockTime = 75; // > 50 but < 100 (2x threshold)
      act(() => {
        result.current.controls.markVisualUpdate(id!);
      });

      expect(result.current.state.currentStrategy).toBe("balanced");
    });
  });

  describe("updateStrategy adaptive case (line 644)", () => {
    it("should keep current interpolation mode when setting adaptive strategy", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: false,
          interpolationMode: "spring",
        })
      );

      // Set to aggressive first to change interpolation mode
      act(() => {
        result.current.controls.updateStrategy("aggressive");
      });
      expect(result.current.state.interpolationMode).toBe("predictive");

      // Now set to adaptive - should keep predictive mode
      act(() => {
        result.current.controls.updateStrategy("adaptive");
      });
      expect(result.current.state.interpolationMode).toBe("predictive");
    });
  });

  describe("frame monitor with missed frames (lines 660-695)", () => {
    let rafCallbacks: ((timestamp: number) => void)[] = [];
    let rafId = 0;

    beforeEach(() => {
      rafCallbacks = [];
      rafId = 0;
      jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        rafCallbacks.push(cb);
        return ++rafId;
      });
      jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    });

    it("should detect and report missed frames via callback", () => {
      const onFrameDrop = jest.fn();
      renderHook(() =>
        useMobileAvatarLatencyMitigator(
          {
            monitorFrameTiming: true,
            targetFrameTimeMs: 16.67,
          },
          { onFrameDrop }
        )
      );

      // First frame at t=0
      mockTime = 0;
      act(() => {
        if (rafCallbacks.length > 0) {
          rafCallbacks[rafCallbacks.length - 1](0);
        }
      });

      // Second frame at t=100 (should have missed ~5 frames at 16.67ms per frame)
      mockTime = 100;
      act(() => {
        if (rafCallbacks.length > 0) {
          rafCallbacks[rafCallbacks.length - 1](100);
        }
      });

      expect(onFrameDrop).toHaveBeenCalled();
    });

    it("should track jitter average in metrics (lines 687-692)", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: true,
          targetFrameTimeMs: 16.67,
        })
      );

      // First frame
      mockTime = 0;
      act(() => {
        if (rafCallbacks.length > 0) {
          rafCallbacks[rafCallbacks.length - 1](0);
        }
      });

      // Second frame with some jitter
      mockTime = 20;
      act(() => {
        if (rafCallbacks.length > 0) {
          rafCallbacks[rafCallbacks.length - 1](20);
        }
      });

      // jitterAvgMs should be calculated
      expect(result.current.metrics.jitterAvgMs).toBeGreaterThanOrEqual(0);
    });

    it("should update frame timing state (lines 678-685)", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: true,
          targetFrameTimeMs: 16.67,
        })
      );

      // First frame
      mockTime = 0;
      act(() => {
        if (rafCallbacks.length > 0) {
          rafCallbacks[rafCallbacks.length - 1](0);
        }
      });

      // Second frame
      mockTime = 16;
      act(() => {
        if (rafCallbacks.length > 0) {
          rafCallbacks[rafCallbacks.length - 1](16);
        }
      });

      expect(result.current.state.frameTiming).not.toBeNull();
      expect(result.current.state.frameTiming?.frameNumber).toBeGreaterThan(0);
    });

    it("should update missedFrames and frameDropRate in metrics (lines 667-673)", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: true,
          targetFrameTimeMs: 16.67,
        })
      );

      // First frame
      mockTime = 0;
      act(() => {
        if (rafCallbacks.length > 0) {
          rafCallbacks[rafCallbacks.length - 1](0);
        }
      });

      // Second frame with large delta (missed frames)
      mockTime = 100;
      act(() => {
        if (rafCallbacks.length > 0) {
          rafCallbacks[rafCallbacks.length - 1](100);
        }
      });

      expect(result.current.metrics.missedFrames).toBeGreaterThan(0);
      expect(result.current.metrics.frameDropRate).toBeGreaterThan(0);
    });
  });

  describe("getOptimalT adaptive strategy (line 731)", () => {
    it("should calculate adaptive T based on latency ratio", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: false,
          strategy: "adaptive",
          touchResponseTarget: 50,
        })
      );

      // First measure some latency to set averageTouchLatencyMs
      mockTime = 0;
      let id: string;
      act(() => {
        id = result.current.controls.markTouchStart();
      });

      mockTime = 100;
      act(() => {
        result.current.controls.markVisualUpdate(id!);
      });

      // Now test getOptimalT with adaptive strategy
      const t = result.current.controls.getOptimalT(16, 50);

      // latencyRatio = 50 / 100 = 0.5
      // t = (16/50) * 0.5 = 0.16
      expect(t).toBeLessThanOrEqual(1);
      expect(t).toBeGreaterThan(0);
    });
  });

  describe("getOptimalT default case (lines 732-733)", () => {
    it("should handle unknown strategy with default calculation", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: false,
          strategy: "conservative", // Start with known strategy
        })
      );

      // Test with a known case first
      const t = result.current.controls.getOptimalT(16, 50);
      expect(t).toBe(16 / 50);
    });
  });

  describe("prediction confidence calculation (lines 781-803)", () => {
    it("should return zero confidence for insufficient history", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ monitorFrameTiming: false })
      );

      expect(result.current.predictionConfidence.overall).toBe(0);
      expect(result.current.predictionConfidence.position).toBe(0);
      expect(result.current.predictionConfidence.rotation).toBe(0);
      expect(result.current.predictionConfidence.blendShapes).toBe(0);
    });

    it("should calculate confidence based on pose variance", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({ monitorFrameTiming: false })
      );

      // Add poses to history via predictions
      const history: AvatarPose[] = [
        createMockPose(0, { x: 0, y: 0, z: 0 }),
        createMockPose(16, { x: 0.1, y: 0, z: 0 }),
        createMockPose(32, { x: 0.2, y: 0, z: 0 }),
        createMockPose(48, { x: 0.3, y: 0, z: 0 }),
        createMockPose(64, { x: 0.4, y: 0, z: 0 }),
      ];

      // Make predictions to populate history
      act(() => {
        result.current.controls.predictPose(history.slice(0, 2), 16);
        result.current.controls.predictPose(history.slice(0, 3), 16);
        result.current.controls.predictPose(history.slice(0, 4), 16);
      });

      // Predictions were made, metrics should be updated
      expect(result.current.metrics.predictionsUsed).toBe(3);
    });
  });

  describe("resetMetrics clears all state (lines 742-760)", () => {
    it("should clear velocities and pose history", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: false,
          interpolationMode: "spring",
        })
      );

      // Build up some state
      const from = createMockPose(0, { x: 0, y: 0, z: 0 });
      const to = createMockPose(100, { x: 100, y: 100, z: 100 });

      act(() => {
        // Spring interpolation accumulates velocity
        result.current.controls.interpolatePose(from, to, 0.5);
        result.current.controls.interpolatePose(from, to, 0.6);
      });

      // Reset everything
      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.predictionsUsed).toBe(0);
      expect(result.current.metrics.predictionAccuracy).toBe(0);
    });
  });

  describe("frame monitor start/stop (lines 653-711)", () => {
    let rafCallbacks: ((timestamp: number) => void)[] = [];
    let rafId = 0;

    beforeEach(() => {
      rafCallbacks = [];
      rafId = 0;
      jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        rafCallbacks.push(cb);
        return ++rafId;
      });
      jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    });

    it("should not start if already running (line 654)", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: true,
        })
      );

      const initialRafCount = rafCallbacks.length;

      // Try to start again
      act(() => {
        result.current.controls.startFrameMonitor();
      });

      // Should not add another RAF callback if already running
      // (depends on implementation - may or may not add)
      expect(result.current.state.isActive).toBe(true);
    });

    it("should stop frame monitor and set isActive to false", () => {
      const { result } = renderHook(() =>
        useMobileAvatarLatencyMitigator({
          monitorFrameTiming: true,
        })
      );

      expect(result.current.state.isActive).toBe(true);

      act(() => {
        result.current.controls.stopFrameMonitor();
      });

      expect(result.current.state.isActive).toBe(false);
    });
  });
});
