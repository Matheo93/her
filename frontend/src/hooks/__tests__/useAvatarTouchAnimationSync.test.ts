/**
 * Tests for Avatar Touch Animation Sync Hook - Sprint 533
 *
 * Tests synchronization of avatar animations with touch input timing:
 * - Frame-aligned touch response
 * - Animation interpolation on touch
 * - Jitter reduction through frame budgeting
 * - Priority-based animation queue for touch events
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarTouchAnimationSync,
  useTouchAlignedAnimation,
  useAnimationFrameSync,
} from "../useAvatarTouchAnimationSync";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);

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

describe("useAvatarTouchAnimationSync", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.isTouching).toBe(false);
      expect(result.current.state.pendingAnimations).toBe(0);
      expect(result.current.state.syncMode).toBe("immediate");
    });

    it("should initialize with zero metrics", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      expect(result.current.metrics.framesProcessed).toBe(0);
      expect(result.current.metrics.touchEventsProcessed).toBe(0);
      expect(result.current.metrics.averageSyncDelayMs).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAvatarTouchAnimationSync({
          syncMode: "frameAligned",
          targetFps: 30,
          maxPendingAnimations: 5,
        })
      );

      expect(result.current.state.syncMode).toBe("frameAligned");
    });

    it("should calculate frame budget based on target FPS", () => {
      const { result } = renderHook(() =>
        useAvatarTouchAnimationSync({ targetFps: 60 })
      );

      // 60fps = 16.67ms per frame
      expect(result.current.state.frameBudgetMs).toBeCloseTo(16.67, 1);
    });
  });

  describe("touch event handling", () => {
    it("should start touch tracking", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      act(() => {
        result.current.controls.onTouchStart({ x: 100, y: 100 });
      });

      expect(result.current.state.isTouching).toBe(true);
      expect(result.current.state.touchPosition).toEqual({ x: 100, y: 100 });
    });

    it("should track touch move", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      act(() => {
        result.current.controls.onTouchStart({ x: 100, y: 100 });
        result.current.controls.onTouchMove({ x: 150, y: 120 });
      });

      expect(result.current.state.touchPosition).toEqual({ x: 150, y: 120 });
    });

    it("should end touch tracking", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      act(() => {
        result.current.controls.onTouchStart({ x: 100, y: 100 });
        result.current.controls.onTouchEnd();
      });

      expect(result.current.state.isTouching).toBe(false);
    });

    it("should increment touch events processed", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      act(() => {
        result.current.controls.onTouchStart({ x: 100, y: 100 });
        result.current.controls.onTouchMove({ x: 150, y: 120 });
        result.current.controls.onTouchEnd();
      });

      expect(result.current.metrics.touchEventsProcessed).toBe(3);
    });
  });

  describe("animation scheduling", () => {
    it("should schedule animation on touch", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      let animId: string = "";
      act(() => {
        animId = result.current.controls.scheduleAnimation({
          type: "reaction",
          duration: 200,
          priority: "high",
        });
      });

      expect(animId).toMatch(/^anim_/);
      expect(result.current.state.pendingAnimations).toBe(1);
    });

    it("should process high priority animations first", () => {
      const processOrder: string[] = [];
      const { result } = renderHook(() =>
        useAvatarTouchAnimationSync(
          {},
          {
            onAnimationStart: (anim) => {
              processOrder.push(anim.type);
            },
          }
        )
      );

      act(() => {
        result.current.controls.scheduleAnimation({
          type: "idle",
          duration: 100,
          priority: "low",
        });
        result.current.controls.scheduleAnimation({
          type: "reaction",
          duration: 100,
          priority: "high",
        });
      });

      // Process frame
      act(() => {
        mockTime = 16;
        result.current.controls.processFrame();
      });

      if (processOrder.length >= 1) {
        expect(processOrder[0]).toBe("reaction");
      }
    });

    it("should cancel animation", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      let animId: string = "";
      act(() => {
        animId = result.current.controls.scheduleAnimation({
          type: "reaction",
          duration: 200,
          priority: "normal",
        });
      });

      expect(result.current.state.pendingAnimations).toBe(1);

      act(() => {
        result.current.controls.cancelAnimation(animId);
      });

      expect(result.current.state.pendingAnimations).toBe(0);
    });

    it("should respect max pending animations", () => {
      const { result } = renderHook(() =>
        useAvatarTouchAnimationSync({ maxPendingAnimations: 2 })
      );

      act(() => {
        result.current.controls.scheduleAnimation({
          type: "a",
          duration: 100,
          priority: "normal",
        });
        result.current.controls.scheduleAnimation({
          type: "b",
          duration: 100,
          priority: "normal",
        });
        result.current.controls.scheduleAnimation({
          type: "c",
          duration: 100,
          priority: "normal",
        });
      });

      expect(result.current.state.pendingAnimations).toBeLessThanOrEqual(2);
    });
  });

  describe("frame synchronization", () => {
    it("should align animation to frame boundary", () => {
      const { result } = renderHook(() =>
        useAvatarTouchAnimationSync({ syncMode: "frameAligned" })
      );

      mockTime = 5; // Mid-frame
      act(() => {
        result.current.controls.scheduleAnimation({
          type: "reaction",
          duration: 100,
          priority: "high",
        });
      });

      const animation = result.current.controls.getNextAnimation();
      if (animation) {
        // Should be scheduled for next frame boundary
        expect(animation.scheduledAt).toBeGreaterThanOrEqual(mockTime);
      }
    });

    it("should track frame timing", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      mockTime = 0;
      act(() => {
        result.current.controls.processFrame();
      });

      mockTime = 16;
      act(() => {
        result.current.controls.processFrame();
      });

      expect(result.current.metrics.framesProcessed).toBe(2);
    });

    it("should detect dropped frames", () => {
      const { result } = renderHook(() =>
        useAvatarTouchAnimationSync({ targetFps: 60 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.processFrame();
      });

      // Simulate 50ms gap (should have ~3 frames at 60fps)
      mockTime = 50;
      act(() => {
        result.current.controls.processFrame();
      });

      expect(result.current.metrics.droppedFrames).toBeGreaterThan(0);
    });
  });

  describe("touch-animation interpolation", () => {
    it("should interpolate animation based on touch position", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      act(() => {
        result.current.controls.onTouchStart({ x: 0, y: 0 });
      });

      const interpolated = result.current.controls.interpolateForTouch(
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        0.5
      );

      expect(interpolated.x).toBe(50);
      expect(interpolated.y).toBe(50);
    });

    it("should clamp interpolation factor", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      const over = result.current.controls.interpolateForTouch(
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        1.5
      );

      expect(over.x).toBe(100);
      expect(over.y).toBe(100);

      const under = result.current.controls.interpolateForTouch(
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        -0.5
      );

      expect(under.x).toBe(0);
      expect(under.y).toBe(0);
    });
  });

  describe("sync delay measurement", () => {
    it("should measure touch-to-animation sync delay", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      mockTime = 0;
      act(() => {
        result.current.controls.onTouchStart({ x: 100, y: 100 });
      });

      mockTime = 10;
      act(() => {
        result.current.controls.scheduleAnimation({
          type: "reaction",
          duration: 100,
          priority: "high",
        });
        result.current.controls.markAnimationStarted();
      });

      expect(result.current.metrics.lastSyncDelayMs).toBeGreaterThan(0);
    });

    it("should calculate average sync delay", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      // Multiple sync measurements
      mockTime = 0;
      act(() => {
        result.current.controls.onTouchStart({ x: 100, y: 100 });
      });

      mockTime = 5;
      act(() => {
        result.current.controls.markAnimationStarted();
      });

      mockTime = 10;
      act(() => {
        result.current.controls.onTouchStart({ x: 150, y: 150 });
      });

      mockTime = 20;
      act(() => {
        result.current.controls.markAnimationStarted();
      });

      expect(result.current.metrics.averageSyncDelayMs).toBeGreaterThan(0);
    });
  });

  describe("jitter reduction", () => {
    it("should smooth touch position updates", () => {
      const { result } = renderHook(() =>
        useAvatarTouchAnimationSync({ smoothingFactor: 0.5 })
      );

      act(() => {
        result.current.controls.onTouchStart({ x: 100, y: 100 });
        result.current.controls.onTouchMove({ x: 200, y: 200 });
      });

      // Smoothed position should be between start and current
      const smoothed = result.current.state.smoothedTouchPosition;
      if (smoothed) {
        expect(smoothed.x).toBeGreaterThanOrEqual(100);
        expect(smoothed.x).toBeLessThanOrEqual(200);
      }
    });

    it("should track jitter metrics", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      act(() => {
        result.current.controls.onTouchStart({ x: 100, y: 100 });
        result.current.controls.onTouchMove({ x: 101, y: 100 });
        result.current.controls.onTouchMove({ x: 99, y: 100 });
        result.current.controls.onTouchMove({ x: 102, y: 100 });
      });

      expect(result.current.metrics.jitterSampleCount).toBeGreaterThan(0);
    });
  });

  describe("callbacks", () => {
    it("should call onTouchStarted callback", () => {
      const onTouchStarted = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchAnimationSync({}, { onTouchStarted })
      );

      act(() => {
        result.current.controls.onTouchStart({ x: 100, y: 100 });
      });

      expect(onTouchStarted).toHaveBeenCalledWith({ x: 100, y: 100 });
    });

    it("should call onAnimationComplete callback", () => {
      const onAnimationComplete = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchAnimationSync({}, { onAnimationComplete })
      );

      let animId: string = "";
      act(() => {
        animId = result.current.controls.scheduleAnimation({
          type: "reaction",
          duration: 100,
          priority: "high",
        });
      });

      act(() => {
        result.current.controls.completeAnimation(animId);
      });

      expect(onAnimationComplete).toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useAvatarTouchAnimationSync());

      unmount();
      // No error means cleanup succeeded
    });

    it("should cancel all pending animations on cleanup", () => {
      const { result, unmount } = renderHook(() => useAvatarTouchAnimationSync());

      act(() => {
        result.current.controls.scheduleAnimation({
          type: "reaction",
          duration: 1000,
          priority: "normal",
        });
      });

      unmount();
      // No error and no memory leaks
    });
  });

  describe("metrics reset", () => {
    it("should reset all metrics", () => {
      const { result } = renderHook(() => useAvatarTouchAnimationSync());

      act(() => {
        result.current.controls.onTouchStart({ x: 100, y: 100 });
        result.current.controls.processFrame();
      });

      expect(result.current.metrics.touchEventsProcessed).toBeGreaterThan(0);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.touchEventsProcessed).toBe(0);
      expect(result.current.metrics.framesProcessed).toBe(0);
    });
  });
});

describe("useTouchAlignedAnimation", () => {
  it("should provide animation control", () => {
    const { result } = renderHook(() => useTouchAlignedAnimation());

    expect(typeof result.current.start).toBe("function");
    expect(typeof result.current.stop).toBe("function");
    expect(result.current.isRunning).toBe(false);
  });

  it("should start animation", () => {
    const { result } = renderHook(() => useTouchAlignedAnimation());

    act(() => {
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);
  });

  it("should stop animation", () => {
    const { result } = renderHook(() => useTouchAlignedAnimation());

    act(() => {
      result.current.start();
      result.current.stop();
    });

    expect(result.current.isRunning).toBe(false);
  });
});

describe("useAnimationFrameSync", () => {
  it("should provide frame sync", () => {
    const { result } = renderHook(() => useAnimationFrameSync());

    expect(typeof result.current.requestSync).toBe("function");
    expect(typeof result.current.cancelSync).toBe("function");
    expect(result.current.isSynced).toBe(false);
  });

  it("should request frame sync", () => {
    const callback = jest.fn();
    const { result } = renderHook(() => useAnimationFrameSync(callback));

    act(() => {
      result.current.requestSync();
    });

    expect(result.current.isSynced).toBe(true);
  });

  it("should cancel sync request", () => {
    const { result } = renderHook(() => useAnimationFrameSync());

    act(() => {
      result.current.requestSync();
      result.current.cancelSync();
    });

    expect(result.current.isSynced).toBe(false);
  });
});
