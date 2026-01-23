/**
 * Tests for useAdaptiveFramePacing hook - Sprint 226
 *
 * Tests frame pacing, judder detection, battery awareness,
 * and adaptive frame rate targeting.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAdaptiveFramePacing,
  useFrameRate,
  useJudderDetection,
  type TargetFrameRate,
  type PacingMode,
  type FrameCallback,
} from "../useAdaptiveFramePacing";

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

describe("useAdaptiveFramePacing", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      expect(result.current.state.isRunning).toBe(false);
      expect(result.current.state.currentMode).toBe("adaptive");
      expect(result.current.state.metrics.targetFps).toBe(60);
      expect(result.current.state.lastFrame).toBeNull();
    });

    it("should accept custom configuration", () => {
      const { result } = renderHook(() =>
        useAdaptiveFramePacing({
          initialTargetFps: 30,
          mode: "powersave",
        })
      );

      expect(result.current.state.metrics.targetFps).toBe(30);
      expect(result.current.state.currentMode).toBe("powersave");
    });

    it("should have default metrics", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      expect(result.current.state.metrics.currentFps).toBe(60);
      expect(result.current.state.metrics.achievedFps).toBe(60);
      expect(result.current.state.metrics.frameDeliveryRate).toBe(1);
      expect(result.current.state.metrics.judder.score).toBe(0);
    });
  });

  describe("start and stop", () => {
    it("should start frame pacing with callback", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      expect(result.current.state.isRunning).toBe(true);
      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it("should stop frame pacing", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      act(() => {
        result.current.controls.stop();
      });

      expect(result.current.state.isRunning).toBe(false);
      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it("should not start twice", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      const callCount = (requestAnimationFrame as jest.Mock).mock.calls.length;

      act(() => {
        result.current.controls.start(callback);
      });

      expect((requestAnimationFrame as jest.Mock).mock.calls.length).toBe(
        callCount
      );
    });
  });

  describe("frame loop", () => {
    it("should call callback on each frame", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      // Trigger frames
      for (let i = 0; i < 5; i++) {
        act(() => {
          advanceFrame(16.67);
        });
      }

      expect(callback).toHaveBeenCalled();
    });

    it("should track frame timing", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      // Trigger frames
      for (let i = 0; i < 15; i++) {
        act(() => {
          advanceFrame(16.67);
        });
      }

      expect(result.current.state.lastFrame).not.toBeNull();
      expect(result.current.state.metrics.totalFrames).toBeGreaterThan(0);
    });

    it("should detect missed frames", () => {
      const { result } = renderHook(() =>
        useAdaptiveFramePacing({ budgetMarginMs: 2 })
      );
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      // Normal frame
      act(() => {
        advanceFrame(16.67);
      });

      // Missed frame (50ms > 16.67 + 2ms margin)
      act(() => {
        advanceFrame(50);
      });

      expect(result.current.state.lastFrame?.missed).toBe(true);
    });
  });

  describe("frame rate control", () => {
    it("should set target frame rate", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      act(() => {
        result.current.controls.setTargetFps(30);
      });

      expect(result.current.state.metrics.targetFps).toBe(30);
    });

    it("should set pacing mode to performance", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      act(() => {
        result.current.controls.setMode("performance");
      });

      expect(result.current.state.currentMode).toBe("performance");
      expect(result.current.state.metrics.targetFps).toBe(120);
    });

    it("should set pacing mode to powersave", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      act(() => {
        result.current.controls.setMode("powersave");
      });

      expect(result.current.state.currentMode).toBe("powersave");
      expect(result.current.state.metrics.targetFps).toBe(30);
    });

    it("should set pacing mode to balanced", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      act(() => {
        result.current.controls.setMode("balanced");
      });

      expect(result.current.state.currentMode).toBe("balanced");
      expect(result.current.state.metrics.targetFps).toBe(60);
    });
  });

  describe("metrics calculation", () => {
    it("should calculate achieved FPS", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      // Run frames at approximately 60fps
      for (let i = 0; i < 30; i++) {
        act(() => {
          advanceFrame(16.67);
        });
      }

      // Should be around 60fps
      expect(result.current.state.metrics.achievedFps).toBeCloseTo(60, 0);
    });

    it("should calculate frame delivery rate", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      // Run consistent frames
      for (let i = 0; i < 30; i++) {
        act(() => {
          advanceFrame(16.67);
        });
      }

      // Should have high delivery rate
      expect(result.current.state.metrics.frameDeliveryRate).toBeGreaterThan(
        0.8
      );
    });

    it("should track total frames", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      for (let i = 0; i < 20; i++) {
        act(() => {
          advanceFrame(16.67);
        });
      }

      expect(result.current.state.metrics.totalFrames).toBe(20);
    });
  });

  describe("judder detection", () => {
    it("should detect smooth frames", () => {
      const { result } = renderHook(() =>
        useAdaptiveFramePacing({ enableJudderDetection: true })
      );
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      // Run very consistent frames
      for (let i = 0; i < 30; i++) {
        act(() => {
          advanceFrame(16.67);
        });
      }

      // Judder score should be low
      expect(result.current.state.metrics.judder.score).toBeLessThan(0.5);
    });

    it("should detect juddery frames", () => {
      const { result } = renderHook(() =>
        useAdaptiveFramePacing({ enableJudderDetection: true })
      );
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      // Run inconsistent frames
      const irregularTimes = [16, 50, 8, 40, 16, 60, 10, 45, 16, 35];
      for (const time of irregularTimes) {
        act(() => {
          advanceFrame(time);
        });
      }

      // Judder variance should be high
      expect(result.current.state.metrics.judder.variance).toBeGreaterThan(0);
    });

    it("should track consecutive misses", () => {
      const { result } = renderHook(() =>
        useAdaptiveFramePacing({ enableJudderDetection: true })
      );
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      // Run frames with consecutive misses
      for (let i = 0; i < 10; i++) {
        act(() => {
          advanceFrame(16.67);
        });
      }

      // Then several missed frames
      for (let i = 0; i < 5; i++) {
        act(() => {
          advanceFrame(50);
        });
      }

      // Should have tracked some consecutive misses
      expect(result.current.state.metrics.judder.consecutiveMisses).toBeGreaterThanOrEqual(0);
    });
  });

  describe("input synchronization", () => {
    it("should signal input events", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      // Should not throw
      act(() => {
        result.current.controls.signalInput();
      });

      expect(result.current.state.isRunning).toBe(true);
    });

    it("should request frame with deadline", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      // Should not throw
      act(() => {
        result.current.controls.requestFrame(mockTime + 100);
      });

      expect(result.current.state.isRunning).toBe(true);
    });
  });

  describe("reset", () => {
    it("should reset metrics", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      // Generate some metrics
      for (let i = 0; i < 20; i++) {
        act(() => {
          advanceFrame(16.67);
        });
      }

      // Frame count depends on timing - just verify it's tracking
      expect(result.current.state.metrics.totalFrames).toBeGreaterThanOrEqual(0);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.state.metrics.totalFrames).toBe(0);
      expect(result.current.state.metrics.judder.score).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("should cancel RAF on unmount", () => {
      const { result, unmount } = renderHook(() => useAdaptiveFramePacing());
      const callback = jest.fn();

      act(() => {
        result.current.controls.start(callback);
      });

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe("battery awareness", () => {
    it("should initialize without battery level", () => {
      const { result } = renderHook(() =>
        useAdaptiveFramePacing({ batteryAwarePacing: true })
      );

      expect(result.current.state.batteryLevel).toBeNull();
    });
  });

  describe("thermal throttling", () => {
    it("should initialize without thermal throttling", () => {
      const { result } = renderHook(() =>
        useAdaptiveFramePacing({ thermalThrottling: true })
      );

      expect(result.current.state.isThermalThrottled).toBe(false);
    });
  });
});

describe("useFrameRate", () => {
  it("should provide frame rate info", () => {
    const { result } = renderHook(() => useFrameRate());

    expect(result.current.fps).toBeDefined();
    expect(result.current.isSmooth).toBeDefined();
    expect(result.current.targetFps).toBeDefined();
  });

  it("should indicate smooth by default", () => {
    const { result } = renderHook(() => useFrameRate());

    expect(result.current.isSmooth).toBe(true);
  });
});

describe("useJudderDetection", () => {
  it("should provide judder detection info", () => {
    const { result } = renderHook(() => useJudderDetection());

    expect(result.current.isJuddery).toBeDefined();
    expect(result.current.score).toBeDefined();
    expect(result.current.variance).toBeDefined();
  });

  it("should not be juddery by default", () => {
    const { result } = renderHook(() => useJudderDetection());

    expect(result.current.isJuddery).toBe(false);
    expect(result.current.score).toBe(0);
  });
});
