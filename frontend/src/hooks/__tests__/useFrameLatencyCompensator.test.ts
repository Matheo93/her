/**
 * Tests for useFrameLatencyCompensator hook - Sprint 227
 */

import { renderHook, act } from "@testing-library/react";
import {
  useFrameLatencyCompensator,
  useFrameTiming,
  type CompensatorConfig,
  type CompensatedTransform,
  type FrameTiming,
} from "../useFrameLatencyCompensator";

// Mock requestAnimationFrame
let rafCallbacks: FrameRequestCallback[] = [];
let rafId = 0;
let mockTime = 0;

beforeEach(() => {
  rafCallbacks = [];
  rafId = 0;
  mockTime = 0;

  jest.spyOn(performance, "now").mockImplementation(() => mockTime);

  global.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
    rafCallbacks.push(callback);
    return ++rafId;
  });

  global.cancelAnimationFrame = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Helper to advance time and trigger RAF
function advanceFrame(deltaMs: number = 16.67) {
  mockTime += deltaMs;
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  callbacks.forEach((cb) => cb(mockTime));
}

describe("useFrameLatencyCompensator", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useFrameLatencyCompensator());

      expect(result.current.state.isRunning).toBe(false);
      expect(result.current.state.lastFrameTiming).toBeNull();
      expect(result.current.state.compensation.predictedLatency).toBe(16.67);
      expect(result.current.state.metrics.totalFrames).toBe(0);
    });

    it("should accept custom configuration", () => {
      const config: Partial<CompensatorConfig> = {
        targetFrameTimeMs: 8.33,
        smoothingFactor: 0.5,
        maxCompensationMs: 100,
      };

      const { result } = renderHook(() => useFrameLatencyCompensator(config));

      expect(result.current.state).toBeDefined();
      expect(result.current.controls).toBeDefined();
    });
  });

  describe("start/stop", () => {
    it("should start the compensator", () => {
      const { result } = renderHook(() => useFrameLatencyCompensator());

      act(() => {
        result.current.controls.start();
      });

      expect(result.current.state.isRunning).toBe(true);
      expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    it("should stop the compensator", () => {
      const { result } = renderHook(() => useFrameLatencyCompensator());

      act(() => {
        result.current.controls.start();
      });

      act(() => {
        result.current.controls.stop();
      });

      expect(result.current.state.isRunning).toBe(false);
      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("should not start twice", () => {
      const { result } = renderHook(() => useFrameLatencyCompensator());

      act(() => {
        result.current.controls.start();
      });

      const callCount = (global.requestAnimationFrame as jest.Mock).mock.calls
        .length;

      act(() => {
        result.current.controls.start();
      });

      // Should not add more RAF calls
      expect(
        (global.requestAnimationFrame as jest.Mock).mock.calls.length
      ).toBe(callCount);
    });
  });

  describe("frame timing measurement", () => {
    it("should measure frame latency", () => {
      const { result } = renderHook(() => useFrameLatencyCompensator());

      act(() => {
        result.current.controls.start();
      });

      // Simulate multiple frames
      for (let i = 0; i < 5; i++) {
        act(() => {
          advanceFrame(16.67);
        });
      }

      expect(result.current.state.metrics.totalFrames).toBeGreaterThan(0);
    });

    it("should detect dropped frames", () => {
      const { result } = renderHook(() =>
        useFrameLatencyCompensator({
          frameDropThreshold: 1.5,
          targetFrameTimeMs: 16.67,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Normal frame
      act(() => {
        advanceFrame(16.67);
      });

      // Dropped frame (>1.5x target)
      act(() => {
        advanceFrame(50);
      });

      expect(result.current.state.lastFrameTiming?.dropped).toBe(true);
    });

    it("should calculate average FPS", () => {
      const { result } = renderHook(() => useFrameLatencyCompensator());

      act(() => {
        result.current.controls.start();
      });

      // Simulate frames at 60fps
      for (let i = 0; i < 30; i++) {
        act(() => {
          advanceFrame(16.67);
        });
      }

      // FPS should be around 60
      expect(result.current.state.compensation.estimatedFps).toBeCloseTo(60, 0);
    });
  });

  describe("manual frame recording", () => {
    it("should record frame timing manually", () => {
      const { result } = renderHook(() => useFrameLatencyCompensator());

      act(() => {
        result.current.controls.recordFrame({
          duration: 16,
          latency: 20,
          dropped: false,
        });
      });

      expect(result.current.state.lastFrameTiming).not.toBeNull();
      expect(result.current.state.metrics.totalFrames).toBe(1);
    });

    it("should update metrics from manual recordings", () => {
      const { result } = renderHook(() => useFrameLatencyCompensator());

      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.controls.recordFrame({
            duration: 16,
            latency: 15 + i,
          });
        });
      }

      expect(result.current.state.metrics.totalFrames).toBe(10);
      expect(result.current.state.metrics.averageLatency).toBeGreaterThan(0);
    });
  });

  describe("compensation", () => {
    it("should compensate transform based on velocity", () => {
      const { result } = renderHook(() =>
        useFrameLatencyCompensator({ minFramesForCompensation: 5 })
      );

      // Build up frame history
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.controls.recordFrame({
            duration: 16,
            latency: 20,
          });
        });
      }

      const transform: CompensatedTransform = {
        x: 100,
        y: 100,
        velocityX: 100, // 100 px/s
        velocityY: 50, // 50 px/s
        scale: 1,
        rotation: 0,
      };

      let compensated: CompensatedTransform;
      act(() => {
        compensated = result.current.controls.compensate(transform);
      });

      // Should have applied compensation
      expect(compensated!.x).toBeGreaterThan(transform.x);
      expect(compensated!.y).toBeGreaterThan(transform.y);
    });

    it("should not compensate before minimum frames", () => {
      const { result } = renderHook(() =>
        useFrameLatencyCompensator({ minFramesForCompensation: 10 })
      );

      // Only record 5 frames
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.recordFrame({
            duration: 16,
            latency: 20,
          });
        });
      }

      const transform: CompensatedTransform = {
        x: 100,
        y: 100,
        velocityX: 100,
        velocityY: 50,
        scale: 1,
        rotation: 0,
      };

      let compensated: CompensatedTransform;
      act(() => {
        compensated = result.current.controls.compensate(transform);
      });

      // Should return original transform
      expect(compensated!.x).toBe(transform.x);
      expect(compensated!.y).toBe(transform.y);
    });

    it("should cap compensation at maximum", () => {
      const { result } = renderHook(() =>
        useFrameLatencyCompensator({
          minFramesForCompensation: 5,
          maxCompensationMs: 20,
        })
      );

      // Record frames with high latency
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.controls.recordFrame({
            duration: 50,
            latency: 100,
          });
        });
      }

      // Compensation should be capped
      expect(result.current.state.compensation.offsetMs).toBeLessThanOrEqual(20);
    });
  });

  describe("getCompensatedPosition", () => {
    it("should return compensated position for velocity", () => {
      const { result } = renderHook(() =>
        useFrameLatencyCompensator({ minFramesForCompensation: 5 })
      );

      // Build frame history
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.controls.recordFrame({
            duration: 16,
            latency: 20,
          });
        });
      }

      let position: { x: number; y: number };
      act(() => {
        position = result.current.controls.getCompensatedPosition(
          100,
          100,
          200,
          100
        );
      });

      expect(position!.x).toBeGreaterThan(100);
      expect(position!.y).toBeGreaterThan(100);
    });
  });

  describe("VSync detection", () => {
    it("should detect VSync at 60Hz", () => {
      const { result } = renderHook(() =>
        useFrameLatencyCompensator({ enableVsyncDetection: true })
      );

      act(() => {
        result.current.controls.start();
      });

      // Simulate consistent 60fps frames
      for (let i = 0; i < 30; i++) {
        act(() => {
          advanceFrame(16.67);
        });
      }

      expect(result.current.state.compensation.vsyncDetected).toBe(true);
      expect(result.current.state.compensation.vsyncIntervalMs).toBeCloseTo(
        16.67,
        0
      );
    });
  });

  describe("jitter calculation", () => {
    it("should calculate jitter from frame variance", () => {
      const { result } = renderHook(() => useFrameLatencyCompensator());

      // Record frames with varying duration
      const durations = [16, 18, 14, 20, 12, 16, 19, 13, 17, 15];

      for (const duration of durations) {
        act(() => {
          result.current.controls.recordFrame({
            duration,
            latency: duration,
          });
        });
      }

      // Should have calculated jitter
      expect(result.current.state.compensation.jitterMs).toBeGreaterThan(0);
    });
  });

  describe("reset", () => {
    it("should reset all state and metrics", () => {
      const { result } = renderHook(() => useFrameLatencyCompensator());

      // Record some frames
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.controls.recordFrame({
            duration: 16,
            latency: 20,
          });
        });
      }

      expect(result.current.state.metrics.totalFrames).toBe(10);

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.metrics.totalFrames).toBe(0);
      expect(result.current.state.lastFrameTiming).toBeNull();
      expect(result.current.state.compensation.predictedLatency).toBe(16.67);
    });
  });

  describe("metrics tracking", () => {
    it("should track drop rate", () => {
      const { result } = renderHook(() =>
        useFrameLatencyCompensator({
          frameDropThreshold: 1.5,
          targetFrameTimeMs: 16.67,
        })
      );

      // Mix of normal and dropped frames
      const frames = [16, 50, 16, 16, 50, 16, 16, 16, 50, 16];

      for (const duration of frames) {
        act(() => {
          result.current.controls.recordFrame({
            duration,
            latency: duration,
            dropped: duration > 25,
          });
        });
      }

      expect(result.current.state.metrics.droppedFrames).toBe(3);
      expect(result.current.state.metrics.dropRate).toBeCloseTo(0.3, 1);
    });

    it("should track min and max latency", () => {
      const { result } = renderHook(() => useFrameLatencyCompensator());

      const latencies = [10, 20, 15, 30, 5, 25];

      for (const latency of latencies) {
        act(() => {
          result.current.controls.recordFrame({
            duration: 16,
            latency,
          });
        });
      }

      expect(result.current.state.metrics.minLatency).toBe(5);
      expect(result.current.state.metrics.maxLatency).toBe(30);
    });
  });

  describe("cleanup", () => {
    it("should cancel RAF on unmount", () => {
      const { result, unmount } = renderHook(() =>
        useFrameLatencyCompensator()
      );

      act(() => {
        result.current.controls.start();
      });

      unmount();

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});

describe("useFrameTiming", () => {
  it("should provide frame timing information", () => {
    const { result } = renderHook(() => useFrameTiming());

    expect(result.current.fps).toBeDefined();
    expect(result.current.frameTime).toBeDefined();
    expect(result.current.jitter).toBeDefined();
  });
});
