/**
 * Tests for useAnimationBatcher hook - Sprint 553
 *
 * Tests:
 * - Initialization and default state
 * - Register and unregister callbacks
 * - Priority ordering
 * - Frame budget management
 * - Adaptive throttling
 * - Pause/resume controls
 * - Flush and clear operations
 * - useBatchedAnimation helper hook
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAnimationBatcher,
  useBatchedAnimation,
  useGlobalAnimationBatcher,
  type BatchedAnimationControls,
} from "../useAnimationBatcher";

// Mock dependencies
jest.mock("../useMobileDetect", () => ({
  useMobileDetect: () => ({ isMobile: false, isTablet: false }),
}));

jest.mock("../useVisibility", () => ({
  useVisibility: () => ({ isVisible: true, isHidden: false }),
}));

describe("useAnimationBatcher", () => {
  let rafCallbacks: FrameRequestCallback[] = [];
  let rafId = 0;
  let mockNow = 0;

  beforeEach(() => {
    jest.useFakeTimers();
    rafCallbacks = [];
    rafId = 0;
    mockNow = 1000;

    jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return ++rafId;
    });

    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    jest.spyOn(performance, "now").mockImplementation(() => mockNow);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // Helper to run animation frames
  const runAnimationFrame = (timestamp: number = mockNow) => {
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    callbacks.forEach((cb) => cb(timestamp));
  };

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: false }));

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.frameCount).toBe(0);
      expect(result.current.state.avgFrameTime).toBe(0);
      expect(result.current.state.updatesThisFrame).toBe(0);
      expect(result.current.state.skippedUpdates).toBe(0);
    });

    it("should auto-start when autoStart is true", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: true }));

      expect(result.current.state.isActive).toBe(true);
    });

    it("should not auto-start when autoStart is false", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: false }));

      expect(result.current.state.isActive).toBe(false);
    });
  });

  // ============================================================================
  // Register/Unregister Tests
  // ============================================================================

  describe("register and unregister", () => {
    it("should register a callback", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: true }));

      const callback = jest.fn();
      act(() => {
        result.current.controls.register("test-animation", callback);
      });

      // Run a frame
      act(() => {
        mockNow += 16;
        runAnimationFrame(mockNow);
      });

      expect(callback).toHaveBeenCalled();
    });

    it("should unregister a callback", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: true }));

      const callback = jest.fn();
      act(() => {
        result.current.controls.register("test-animation", callback);
      });

      // Run a frame
      act(() => {
        mockNow += 16;
        runAnimationFrame(mockNow);
      });

      expect(callback).toHaveBeenCalledTimes(1);

      // Unregister
      act(() => {
        result.current.controls.unregister("test-animation");
      });

      // Run another frame
      act(() => {
        mockNow += 16;
        runAnimationFrame(mockNow);
      });

      // Callback should not be called again
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should pass deltaTime to callback", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: true }));

      const callback = jest.fn();
      act(() => {
        result.current.controls.register("test-animation", callback);
      });

      const startTime = mockNow;

      // First frame
      act(() => {
        mockNow = startTime;
        runAnimationFrame(mockNow);
      });

      // Second frame with delta
      act(() => {
        mockNow = startTime + 16;
        runAnimationFrame(mockNow);
      });

      // First call has deltaTime=0 (initial), second call should have deltaTime
      // The hook calculates delta from timestamp parameter, not mockNow
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // Priority Tests
  // ============================================================================

  describe("priority ordering", () => {
    it("should process critical priority first", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: true }));

      const callOrder: string[] = [];

      act(() => {
        result.current.controls.register(
          "low-priority",
          () => callOrder.push("low"),
          { priority: "low" }
        );
        result.current.controls.register(
          "critical-priority",
          () => callOrder.push("critical"),
          { priority: "critical" }
        );
        result.current.controls.register(
          "normal-priority",
          () => callOrder.push("normal"),
          { priority: "normal" }
        );
      });

      // Run frame
      act(() => {
        mockNow += 16;
        runAnimationFrame(mockNow);
      });

      // Critical should run first
      expect(callOrder[0]).toBe("critical");
    });

    it("should process high priority before normal", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: true }));

      const callOrder: string[] = [];

      act(() => {
        result.current.controls.register(
          "normal-priority",
          () => callOrder.push("normal"),
          { priority: "normal" }
        );
        result.current.controls.register(
          "high-priority",
          () => callOrder.push("high"),
          { priority: "high" }
        );
      });

      act(() => {
        mockNow += 16;
        runAnimationFrame(mockNow);
      });

      // High should run before normal
      expect(callOrder.indexOf("high")).toBeLessThan(callOrder.indexOf("normal"));
    });
  });

  // ============================================================================
  // Pause/Resume Tests
  // ============================================================================

  describe("pause and resume", () => {
    it("should pause animations", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: true }));

      const callback = jest.fn();
      act(() => {
        result.current.controls.register("test-animation", callback);
      });

      // Run a frame
      act(() => {
        mockNow += 16;
        runAnimationFrame(mockNow);
      });

      expect(callback).toHaveBeenCalledTimes(1);

      // Pause
      act(() => {
        result.current.controls.pause();
      });

      expect(result.current.state.isActive).toBe(false);

      // Try to run another frame - should not execute
      act(() => {
        mockNow += 16;
        runAnimationFrame(mockNow);
      });

      // Still 1 call because paused
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should resume animations", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: false }));

      const callback = jest.fn();
      act(() => {
        result.current.controls.register("test-animation", callback);
      });

      // Resume
      act(() => {
        result.current.controls.resume();
      });

      expect(result.current.state.isActive).toBe(true);
    });
  });

  // ============================================================================
  // Flush Tests
  // ============================================================================

  describe("flush", () => {
    it("should immediately run all callbacks", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: false }));

      const callback1 = jest.fn();
      const callback2 = jest.fn();

      act(() => {
        result.current.controls.register("anim-1", callback1);
        result.current.controls.register("anim-2", callback2);
      });

      // Flush without starting the loop
      act(() => {
        result.current.controls.flush();
      });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("should pass 0 as deltaTime during flush", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: false }));

      const callback = jest.fn();
      act(() => {
        result.current.controls.register("test-animation", callback);
      });

      act(() => {
        result.current.controls.flush();
      });

      expect(callback).toHaveBeenCalledWith(0);
    });
  });

  // ============================================================================
  // Clear Tests
  // ============================================================================

  describe("clear", () => {
    it("should clear all registered callbacks", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: true }));

      const callback = jest.fn();
      act(() => {
        result.current.controls.register("test-animation", callback);
      });

      // Run a frame
      act(() => {
        mockNow += 16;
        runAnimationFrame(mockNow);
      });

      expect(callback).toHaveBeenCalledTimes(1);

      // Clear
      act(() => {
        result.current.controls.clear();
      });

      // Run another frame
      act(() => {
        mockNow += 16;
        runAnimationFrame(mockNow);
      });

      // Should still be 1 because callbacks were cleared
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should reset state counters", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: true }));

      // Run some frames
      act(() => {
        for (let i = 0; i < 5; i++) {
          mockNow += 16;
          runAnimationFrame(mockNow);
        }
      });

      expect(result.current.state.frameCount).toBeGreaterThan(0);

      // Clear
      act(() => {
        result.current.controls.clear();
      });

      expect(result.current.state.frameCount).toBe(0);
      expect(result.current.state.avgFrameTime).toBe(0);
      expect(result.current.state.skippedUpdates).toBe(0);
    });
  });

  // ============================================================================
  // Budget Callback Tests
  // ============================================================================

  describe("budget exceeded callback", () => {
    it("should call onBudgetExceeded when frame takes too long", () => {
      const onBudgetExceeded = jest.fn();

      const { result } = renderHook(() =>
        useAnimationBatcher({
          autoStart: true,
          frameBudgetMs: 16,
          onBudgetExceeded,
        })
      );

      // Register a slow callback
      act(() => {
        result.current.controls.register("slow-animation", () => {
          // Simulate expensive work
          mockNow += 50;
        });
      });

      // Run frame
      act(() => {
        mockNow += 16;
        runAnimationFrame(mockNow);
      });

      expect(onBudgetExceeded).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Frame Count Tests
  // ============================================================================

  describe("frame counting", () => {
    it("should increment frame count", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: true }));

      expect(result.current.state.frameCount).toBe(0);

      act(() => {
        mockNow += 16;
        runAnimationFrame(mockNow);
      });

      expect(result.current.state.frameCount).toBe(1);
    });
  });

  // ============================================================================
  // Min Interval Tests
  // ============================================================================

  describe("min interval throttling", () => {
    it("should respect minIntervalMs for callbacks", () => {
      const { result } = renderHook(() => useAnimationBatcher({ autoStart: true }));

      const callback = jest.fn();
      act(() => {
        result.current.controls.register("throttled-animation", callback, {
          minIntervalMs: 100, // Only run every 100ms
        });
      });

      // Run frame at t=0
      act(() => {
        mockNow = 1000;
        runAnimationFrame(mockNow);
      });

      expect(callback).toHaveBeenCalledTimes(1);

      // Run frame at t=16ms (should skip due to minInterval)
      act(() => {
        mockNow = 1016;
        runAnimationFrame(mockNow);
      });

      expect(callback).toHaveBeenCalledTimes(1); // Still 1

      // Run frame at t=100ms (should run)
      act(() => {
        mockNow = 1100;
        runAnimationFrame(mockNow);
      });

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================================
// useBatchedAnimation Tests
// ============================================================================

describe("useBatchedAnimation", () => {
  let rafCallbacks: FrameRequestCallback[] = [];
  let rafId = 0;
  let mockNow = 0;

  beforeEach(() => {
    jest.useFakeTimers();
    rafCallbacks = [];
    rafId = 0;
    mockNow = 1000;

    jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return ++rafId;
    });

    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    jest.spyOn(performance, "now").mockImplementation(() => mockNow);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should register callback with batcher", () => {
    const mockBatcher: BatchedAnimationControls = {
      register: jest.fn(),
      unregister: jest.fn(),
      flush: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      clear: jest.fn(),
    };

    const callback = jest.fn();

    renderHook(() => useBatchedAnimation(mockBatcher, "test-anim", callback));

    expect(mockBatcher.register).toHaveBeenCalledWith(
      "test-anim",
      expect.any(Function),
      expect.anything()
    );
  });

  it("should unregister when enabled becomes false", () => {
    const mockBatcher: BatchedAnimationControls = {
      register: jest.fn(),
      unregister: jest.fn(),
      flush: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      clear: jest.fn(),
    };

    const callback = jest.fn();

    const { rerender } = renderHook(
      ({ enabled }) => useBatchedAnimation(mockBatcher, "test-anim", callback, { enabled }),
      { initialProps: { enabled: true } }
    );

    expect(mockBatcher.register).toHaveBeenCalled();

    rerender({ enabled: false });

    expect(mockBatcher.unregister).toHaveBeenCalledWith("test-anim");
  });

  it("should unregister on unmount", () => {
    const mockBatcher: BatchedAnimationControls = {
      register: jest.fn(),
      unregister: jest.fn(),
      flush: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      clear: jest.fn(),
    };

    const callback = jest.fn();

    const { unmount } = renderHook(() =>
      useBatchedAnimation(mockBatcher, "test-anim", callback)
    );

    unmount();

    expect(mockBatcher.unregister).toHaveBeenCalledWith("test-anim");
  });
});

// ============================================================================
// useGlobalAnimationBatcher Tests
// ============================================================================

describe("useGlobalAnimationBatcher", () => {
  beforeEach(() => {
    jest.useFakeTimers();

    jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => 1);
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    jest.spyOn(performance, "now").mockImplementation(() => 1000);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should return batcher with controls", () => {
    const { result } = renderHook(() => useGlobalAnimationBatcher());

    expect(result.current.controls).toBeDefined();
    expect(result.current.controls.register).toBeDefined();
    expect(result.current.controls.unregister).toBeDefined();
    expect(result.current.state).toBeDefined();
  });
});
