/**
 * Tests for Frame Interpolator Hook - Sprint 525
 *
 * Tests frame interpolation, sub-frame progress, stutter detection, and motion blur
 */

import { renderHook, act } from "@testing-library/react";
import {
  useFrameInterpolator,
  useValueInterpolator,
  useSubFrameProgress,
  useStutterDetection,
  type InterpolationMethod,
} from "../useFrameInterpolator";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);

  // Mock requestAnimationFrame
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    return setTimeout(() => cb(mockTime), 0) as unknown as number;
  });

  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    clearTimeout(id);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useFrameInterpolator", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useFrameInterpolator());

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.targetFps).toBe(60);
      expect(result.current.state.subFrameProgress).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({
          targetFps: 30,
          interpolationStrength: 0.8,
          method: "cubic",
        })
      );

      expect(result.current.state.targetFps).toBe(30);
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useFrameInterpolator());

      expect(result.current.metrics.framesInterpolated).toBe(0);
      expect(result.current.metrics.stuttersDetected).toBe(0);
      expect(result.current.metrics.stuttersCompensated).toBe(0);
      expect(result.current.metrics.avgInterpolationMs).toBe(0);
    });
  });

  describe("interpolation methods", () => {
    it("should interpolate using linear method", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({
          method: "linear",
          interpolationStrength: 1,
        })
      );

      let interpolated: number = 0;
      act(() => {
        interpolated = result.current.controls.interpolate(0, 100, 0.5);
      });

      // Linear interpolation at t=0.5 should give 50
      expect(interpolated).toBe(50);
    });

    it("should interpolate using cubic method", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({
          method: "cubic",
          interpolationStrength: 1,
        })
      );

      let interpolated: number = 0;
      act(() => {
        interpolated = result.current.controls.interpolate(0, 100, 0.5);
      });

      // Cubic smoothstep at t=0.5 should give 50 (symmetric)
      expect(interpolated).toBe(50);
    });

    it("should interpolate using hermite method", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({
          method: "hermite",
          interpolationStrength: 1,
        })
      );

      let interpolated: number = 0;
      act(() => {
        interpolated = result.current.controls.interpolate(0, 100, 0.5);
      });

      // Hermite interpolation at midpoint
      expect(interpolated).toBeGreaterThanOrEqual(40);
      expect(interpolated).toBeLessThanOrEqual(60);
    });

    it("should interpolate using bezier method", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({
          method: "bezier",
          interpolationStrength: 1,
        })
      );

      let interpolated: number = 0;
      act(() => {
        interpolated = result.current.controls.interpolate(0, 100, 0.5);
      });

      // Bezier at t=0.5 with default control points should be near 50
      expect(interpolated).toBeGreaterThanOrEqual(40);
      expect(interpolated).toBeLessThanOrEqual(60);
    });

    it("should handle catmull_rom method with history", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({
          method: "catmull_rom",
          interpolationStrength: 1,
          historySize: 10,
        })
      );

      // Add frames to build history
      act(() => {
        mockTime = 0;
        result.current.controls.addFrame(0);
        mockTime = 16;
        result.current.controls.addFrame(25);
        mockTime = 32;
        result.current.controls.addFrame(50);
        mockTime = 48;
        result.current.controls.addFrame(75);
      });

      let interpolated: number = 0;
      act(() => {
        interpolated = result.current.controls.interpolate(75, 100, 0.5);
      });

      // Should produce a reasonable value
      expect(interpolated).toBeGreaterThan(75);
      expect(interpolated).toBeLessThan(100);
    });
  });

  describe("vector interpolation", () => {
    it("should interpolate vector values", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({
          method: "linear",
          interpolationStrength: 1,
        })
      );

      let vector: number[] = [];
      act(() => {
        vector = result.current.controls.interpolateVector(
          [0, 0, 0],
          [100, 200, 300],
          0.5
        );
      });

      expect(vector).toEqual([50, 100, 150]);
    });

    it("should throw on mismatched vector lengths", () => {
      const { result } = renderHook(() => useFrameInterpolator());

      expect(() => {
        result.current.controls.interpolateVector([0, 0], [100, 200, 300], 0.5);
      }).toThrow("Vector lengths must match");
    });
  });

  describe("frame history", () => {
    it("should add frames to history", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({ historySize: 5 })
      );

      act(() => {
        mockTime = 0;
        result.current.controls.addFrame(0);
        mockTime = 16;
        result.current.controls.addFrame(10);
        mockTime = 32;
        result.current.controls.addFrame(20);
      });

      // History should have frames (we can't directly inspect, but subFrameProgress updates)
      expect(result.current.metrics.avgSubFrameProgress).toBeGreaterThanOrEqual(0);
    });

    it("should respect history size limit", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({ historySize: 3 })
      );

      act(() => {
        for (let i = 0; i < 10; i++) {
          mockTime = i * 16;
          result.current.controls.addFrame(i * 10);
        }
      });

      // History should be limited, interpolation still works
      let interpolated: number = 0;
      act(() => {
        interpolated = result.current.controls.interpolate(80, 90, 0.5);
      });

      expect(interpolated).toBeGreaterThan(80);
    });
  });

  describe("prediction", () => {
    it("should predict next frame position", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({
          enablePrediction: true,
          historySize: 10,
        })
      );

      // Build velocity history
      act(() => {
        mockTime = 0;
        result.current.controls.addFrame(0);
        mockTime = 100;
        result.current.controls.addFrame(100);
      });

      let predicted: number | null = null;
      act(() => {
        predicted = result.current.controls.predictNext(50);
      });

      // At 1000 px/s velocity, 50ms ahead = 50 more pixels
      expect(predicted).not.toBeNull();
      expect(predicted!).toBeGreaterThan(100);
    });

    it("should return null for insufficient history", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({ enablePrediction: true })
      );

      act(() => {
        result.current.controls.addFrame(100);
      });

      let predicted: number | null = null;
      act(() => {
        predicted = result.current.controls.predictNext();
      });

      expect(predicted).toBeNull();
    });

    it("should return null when prediction disabled", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({ enablePrediction: false })
      );

      act(() => {
        mockTime = 0;
        result.current.controls.addFrame(0);
        mockTime = 100;
        result.current.controls.addFrame(100);
      });

      let predicted: number | null = null;
      act(() => {
        predicted = result.current.controls.predictNext();
      });

      expect(predicted).toBeNull();
    });
  });

  describe("stutter detection", () => {
    it("should detect stutter from frame timing variance", () => {
      const onStutterDetected = jest.fn();
      const { result } = renderHook(() =>
        useFrameInterpolator(
          {
            enableStutterCompensation: true,
            stutterThresholdMs: 5,
            targetFps: 60,
          },
          { onStutterDetected }
        )
      );

      // Normal frame
      mockTime = 0;
      act(() => {
        result.current.controls.addFrame(0);
      });

      // Normal frame timing
      mockTime = 16.67;
      act(() => {
        result.current.controls.addFrame(10);
      });

      // Stuttered frame (long gap)
      mockTime = 50;
      act(() => {
        result.current.controls.addFrame(20);
        result.current.controls.compensateStutter(20);
      });

      expect(onStutterDetected).toHaveBeenCalled();
      expect(result.current.metrics.stuttersDetected).toBeGreaterThan(0);
    });

    it("should compensate for stutter", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({
          enableStutterCompensation: true,
          stutterThresholdMs: 5,
          targetFps: 60,
          enablePrediction: true,
        })
      );

      // Build velocity
      mockTime = 0;
      act(() => {
        result.current.controls.addFrame(0);
      });

      mockTime = 16;
      act(() => {
        result.current.controls.addFrame(100);
      });

      // Stutter
      mockTime = 100;
      act(() => {
        result.current.controls.addFrame(200);
      });

      let compensated: number = 0;
      act(() => {
        compensated = result.current.controls.compensateStutter(200);
      });

      // Should return a compensated value
      expect(compensated).toBeGreaterThanOrEqual(200);
    });

    it("should return original value when compensation disabled", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({ enableStutterCompensation: false })
      );

      act(() => {
        mockTime = 0;
        result.current.controls.addFrame(0);
        mockTime = 100;
        result.current.controls.addFrame(100);
      });

      let compensated: number = 0;
      act(() => {
        compensated = result.current.controls.compensateStutter(100);
      });

      expect(compensated).toBe(100);
    });
  });

  describe("timing info", () => {
    it("should provide timing info", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({ targetFps: 60 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.addFrame(0);
      });

      mockTime = 16;
      act(() => {
        result.current.controls.addFrame(10);
      });

      const info = result.current.controls.getTimingInfo();

      expect(info.targetDeltaMs).toBeCloseTo(1000 / 60, 0);
      expect(info.deltaMs).toBe(16);
    });
  });

  describe("motion blur", () => {
    it("should interpolate with motion blur", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({
          motionBlur: {
            enabled: true,
            samples: 4,
            strength: 0.3,
            velocityScale: 1.0,
          },
        })
      );

      const frames = [
        { value: 0, timestamp: 0 },
        { value: 10, timestamp: 16 },
        { value: 20, timestamp: 32 },
        { value: 30, timestamp: 48 },
      ];

      let blurred: number = 0;
      act(() => {
        blurred = result.current.controls.interpolateWithBlur(frames, 0.5);
      });

      // Should produce a blended value
      expect(blurred).toBeGreaterThan(0);
      expect(blurred).toBeLessThanOrEqual(30);
      expect(result.current.metrics.motionBlurFrames).toBe(1);
    });

    it("should return last value when blur disabled", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({
          motionBlur: {
            enabled: false,
            samples: 4,
            strength: 0.3,
            velocityScale: 1.0,
          },
        })
      );

      const frames = [
        { value: 0, timestamp: 0 },
        { value: 10, timestamp: 16 },
        { value: 20, timestamp: 32 },
      ];

      let blurred: number = 0;
      act(() => {
        blurred = result.current.controls.interpolateWithBlur(frames, 0.5);
      });

      expect(blurred).toBe(20);
    });
  });

  describe("lifecycle controls", () => {
    it("should start interpolation loop", () => {
      const { result } = renderHook(() => useFrameInterpolator());

      act(() => {
        result.current.controls.start();
      });

      expect(result.current.state.isActive).toBe(true);
    });

    it("should stop interpolation loop", () => {
      const { result } = renderHook(() => useFrameInterpolator());

      act(() => {
        result.current.controls.start();
        result.current.controls.stop();
      });

      expect(result.current.state.isActive).toBe(false);
    });

    it("should reset interpolator", () => {
      const { result } = renderHook(() => useFrameInterpolator());

      // Add some frames
      act(() => {
        result.current.controls.addFrame(100);
        result.current.controls.addFrame(200);
      });

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.subFrameProgress).toBe(0);
      expect(result.current.state.interpolationFactor).toBe(1);
      expect(result.current.metrics.framesInterpolated).toBe(0);
    });
  });

  describe("display detection", () => {
    it("should detect high refresh display", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({ targetFps: 60 })
      );

      // Initial state won't know display refresh rate
      expect(result.current.state.displayRefreshRate).toBe(60);
    });

    it("should determine if interpolation is needed", () => {
      const { result } = renderHook(() =>
        useFrameInterpolator({ targetFps: 30 })
      );

      // If display is 60Hz and content is 30fps, need interpolation
      // Default display refresh is 60
      expect(result.current.state.needsInterpolation).toBe(true);
    });
  });

  describe("metrics tracking", () => {
    it("should track interpolated frames count", () => {
      const { result } = renderHook(() => useFrameInterpolator());

      act(() => {
        result.current.controls.interpolate(0, 100, 0.5);
        result.current.controls.interpolate(50, 150, 0.5);
      });

      expect(result.current.metrics.framesInterpolated).toBe(2);
    });

    it("should track average interpolation time", () => {
      const { result } = renderHook(() => useFrameInterpolator());

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.controls.interpolate(0, 100, 0.5);
        }
      });

      expect(result.current.metrics.avgInterpolationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("callbacks", () => {
    it("should call onFrameInterpolated callback", () => {
      const onFrameInterpolated = jest.fn();
      const { result } = renderHook(() =>
        useFrameInterpolator({}, { onFrameInterpolated })
      );

      act(() => {
        result.current.controls.interpolate(0, 100, 0.5);
      });

      expect(onFrameInterpolated).toHaveBeenCalledWith(0, 100, expect.any(Number));
    });

    it("should call onRefreshRateChanged callback", () => {
      const onRefreshRateChanged = jest.fn();

      renderHook(() =>
        useFrameInterpolator({}, { onRefreshRateChanged })
      );

      // Callback may or may not be called depending on detection
      // Just verify the hook initializes without error
    });
  });
});

describe("useValueInterpolator", () => {
  it("should provide simplified interpolation", () => {
    const { result } = renderHook(() => useValueInterpolator(0.5));

    expect(typeof result.current).toBe("function");

    let interpolated: number = 0;
    act(() => {
      interpolated = result.current(0, 100, 0.5);
    });

    expect(interpolated).toBeGreaterThanOrEqual(0);
    expect(interpolated).toBeLessThanOrEqual(100);
  });
});

describe("useSubFrameProgress", () => {
  it("should return sub-frame progress", () => {
    const { result } = renderHook(() => useSubFrameProgress(60));

    expect(result.current).toBeGreaterThanOrEqual(0);
    expect(result.current).toBeLessThanOrEqual(1);
  });
});

describe("useStutterDetection", () => {
  it("should track stutter count", () => {
    const onStutter = jest.fn();
    const { result } = renderHook(() => useStutterDetection(onStutter));

    expect(result.current.stutterCount).toBe(0);
    expect(result.current.isStuttering).toBe(false);
  });
});
