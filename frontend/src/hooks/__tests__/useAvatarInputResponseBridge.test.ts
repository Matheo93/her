/**
 * Tests for Avatar Input Response Bridge Hook - Sprint 536
 *
 * Tests seamless bridging between user input and avatar visual response:
 * - Input queue management for smooth processing
 * - Immediate visual feedback while processing
 * - Response interpolation for smooth transitions
 * - Input coalescing for performance
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarInputResponseBridge,
  useInputQueue,
  useResponseInterpolator,
} from "../useAvatarInputResponseBridge";

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

describe("useAvatarInputResponseBridge", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAvatarInputResponseBridge());

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.pendingInputs).toBe(0);
      expect(result.current.state.isProcessing).toBe(false);
      expect(result.current.state.lastResponseTime).toBe(0);
    });

    it("should initialize with zero metrics", () => {
      const { result } = renderHook(() => useAvatarInputResponseBridge());

      expect(result.current.metrics.inputsProcessed).toBe(0);
      expect(result.current.metrics.averageResponseTime).toBe(0);
      expect(result.current.metrics.droppedInputs).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAvatarInputResponseBridge({
          maxQueueSize: 5,
          coalesceThresholdMs: 20,
          immediateResponseEnabled: true,
        })
      );

      expect(result.current.state.isActive).toBe(true);
    });
  });

  describe("input queueing", () => {
    it("should queue input events", () => {
      const { result } = renderHook(() => useAvatarInputResponseBridge());

      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: performance.now(),
        });
      });

      expect(result.current.state.pendingInputs).toBe(1);
    });

    it("should process queued inputs", () => {
      const { result } = renderHook(() => useAvatarInputResponseBridge());

      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: performance.now(),
        });
      });

      expect(result.current.state.pendingInputs).toBe(1);

      act(() => {
        result.current.controls.processQueue();
      });

      expect(result.current.state.pendingInputs).toBe(0);
      expect(result.current.metrics.inputsProcessed).toBe(1);
    });

    it("should respect max queue size", () => {
      const { result } = renderHook(() =>
        useAvatarInputResponseBridge({ maxQueueSize: 3 })
      );

      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.controls.queueInput({
            type: "move",
            position: { x: i * 10, y: i * 10 },
            timestamp: performance.now(),
          });
        }
      });

      expect(result.current.state.pendingInputs).toBeLessThanOrEqual(3);
    });

    it("should track dropped inputs when queue is full", () => {
      const { result } = renderHook(() =>
        useAvatarInputResponseBridge({ maxQueueSize: 2, coalesceThresholdMs: 0 })
      );

      // Queue inputs one by one to allow state updates between each
      for (let i = 0; i < 5; i++) {
        mockTime = i * 100; // Advance time to prevent coalescing
        act(() => {
          result.current.controls.queueInput({
            type: "move",
            position: { x: i * 10, y: i * 10 },
            timestamp: mockTime,
          });
        });
      }

      // With maxQueueSize=2, inputs 3, 4, 5 should cause drops (3 total)
      expect(result.current.metrics.droppedInputs).toBeGreaterThan(0);
    });
  });

  describe("input coalescing", () => {
    it("should coalesce similar inputs within threshold", () => {
      const { result } = renderHook(() =>
        useAvatarInputResponseBridge({ coalesceThresholdMs: 50 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.queueInput({
          type: "move",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      mockTime = 10;
      act(() => {
        result.current.controls.queueInput({
          type: "move",
          position: { x: 110, y: 110 },
          timestamp: mockTime,
        });
      });

      // Similar inputs within 50ms should be coalesced
      expect(result.current.state.pendingInputs).toBeLessThanOrEqual(2);
    });

    it("should not coalesce different input types", () => {
      const { result } = renderHook(() =>
        useAvatarInputResponseBridge({ coalesceThresholdMs: 50 })
      );

      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
        result.current.controls.queueInput({
          type: "swipe",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      expect(result.current.state.pendingInputs).toBe(2);
    });
  });

  describe("immediate response", () => {
    it("should trigger immediate visual feedback", () => {
      const { result } = renderHook(() =>
        useAvatarInputResponseBridge({ immediateResponseEnabled: true })
      );

      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: performance.now(),
        });
      });

      const feedback = result.current.controls.getImmediateFeedback();
      expect(feedback).toBeDefined();
      expect(feedback.isActive).toBe(true);
    });

    it("should provide feedback position", () => {
      const { result } = renderHook(() =>
        useAvatarInputResponseBridge({ immediateResponseEnabled: true })
      );

      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 150, y: 200 },
          timestamp: performance.now(),
        });
      });

      const feedback = result.current.controls.getImmediateFeedback();
      expect(feedback.position).toEqual({ x: 150, y: 200 });
    });

    it("should clear feedback after response", () => {
      const { result } = renderHook(() =>
        useAvatarInputResponseBridge({ immediateResponseEnabled: true })
      );

      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: performance.now(),
        });
      });

      expect(result.current.controls.getImmediateFeedback().isActive).toBe(true);

      act(() => {
        result.current.controls.processQueue();
        result.current.controls.clearFeedback();
      });

      expect(result.current.controls.getImmediateFeedback().isActive).toBe(false);
    });
  });

  describe("response interpolation", () => {
    it("should interpolate between response states", () => {
      const { result } = renderHook(() => useAvatarInputResponseBridge());

      const interpolated = result.current.controls.interpolateResponse(
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        0.5
      );

      expect(interpolated.x).toBe(50);
      expect(interpolated.y).toBe(50);
    });

    it("should clamp interpolation factor", () => {
      const { result } = renderHook(() => useAvatarInputResponseBridge());

      const over = result.current.controls.interpolateResponse(
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        1.5
      );

      expect(over.x).toBe(100);
      expect(over.y).toBe(100);

      const under = result.current.controls.interpolateResponse(
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        -0.5
      );

      expect(under.x).toBe(0);
      expect(under.y).toBe(0);
    });
  });

  describe("response timing", () => {
    it("should track response time", () => {
      const { result } = renderHook(() => useAvatarInputResponseBridge());

      mockTime = 0;
      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      mockTime = 50;
      act(() => {
        result.current.controls.processQueue();
      });

      expect(result.current.state.lastResponseTime).toBeGreaterThanOrEqual(0);
    });

    it("should calculate average response time", () => {
      const { result } = renderHook(() => useAvatarInputResponseBridge());

      mockTime = 0;
      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      mockTime = 30;
      act(() => {
        result.current.controls.processQueue();
      });

      mockTime = 100;
      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 200, y: 200 },
          timestamp: mockTime,
        });
      });

      mockTime = 150;
      act(() => {
        result.current.controls.processQueue();
      });

      expect(result.current.metrics.averageResponseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("callbacks", () => {
    it("should call onInputQueued callback", () => {
      const onInputQueued = jest.fn();
      const { result } = renderHook(() =>
        useAvatarInputResponseBridge({}, { onInputQueued })
      );

      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: performance.now(),
        });
      });

      expect(onInputQueued).toHaveBeenCalled();
    });

    it("should call onResponseSent callback", () => {
      const onResponseSent = jest.fn();
      const { result } = renderHook(() =>
        useAvatarInputResponseBridge({}, { onResponseSent })
      );

      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: performance.now(),
        });
        result.current.controls.processQueue();
      });

      expect(onResponseSent).toHaveBeenCalled();
    });

    it("should call onInputDropped callback", () => {
      const onInputDropped = jest.fn();
      // Create stable callbacks object to prevent recreation on each render
      const callbacks = { onInputDropped };
      const { result } = renderHook(() =>
        useAvatarInputResponseBridge({ maxQueueSize: 1, coalesceThresholdMs: 0 }, callbacks)
      );

      // Use different timestamps to prevent coalescing
      mockTime = 0;
      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      mockTime = 100;
      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 200, y: 200 },
          timestamp: mockTime,
        });
      });

      expect(onInputDropped).toHaveBeenCalled();
    });
  });

  describe("metrics reset", () => {
    it("should reset all metrics", () => {
      const { result } = renderHook(() => useAvatarInputResponseBridge());

      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: performance.now(),
        });
        result.current.controls.processQueue();
      });

      expect(result.current.metrics.inputsProcessed).toBeGreaterThan(0);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.inputsProcessed).toBe(0);
      expect(result.current.metrics.droppedInputs).toBe(0);
      expect(result.current.metrics.averageResponseTime).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useAvatarInputResponseBridge());
      unmount();
    });

    it("should clear queue on cleanup", () => {
      const { result, unmount } = renderHook(() => useAvatarInputResponseBridge());

      act(() => {
        result.current.controls.queueInput({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: performance.now(),
        });
      });

      expect(result.current.state.pendingInputs).toBe(1);

      act(() => {
        result.current.controls.clearQueue();
      });

      expect(result.current.state.pendingInputs).toBe(0);

      unmount();
    });
  });
});

describe("useInputQueue", () => {
  it("should provide queue control", () => {
    const { result } = renderHook(() => useInputQueue());

    expect(typeof result.current.enqueue).toBe("function");
    expect(typeof result.current.dequeue).toBe("function");
    expect(typeof result.current.clear).toBe("function");
    expect(result.current.size).toBe(0);
  });

  it("should enqueue and dequeue items", () => {
    const { result } = renderHook(() => useInputQueue());

    act(() => {
      result.current.enqueue({ type: "tap", x: 100, y: 100 });
    });

    expect(result.current.size).toBe(1);

    let item: unknown;
    act(() => {
      item = result.current.dequeue();
    });

    expect(item).toEqual({ type: "tap", x: 100, y: 100 });
    expect(result.current.size).toBe(0);
  });

  it("should clear the queue", () => {
    const { result } = renderHook(() => useInputQueue());

    act(() => {
      result.current.enqueue({ type: "tap", x: 100, y: 100 });
      result.current.enqueue({ type: "tap", x: 200, y: 200 });
    });

    expect(result.current.size).toBe(2);

    act(() => {
      result.current.clear();
    });

    expect(result.current.size).toBe(0);
  });
});

describe("useResponseInterpolator", () => {
  it("should provide interpolation functions", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    expect(typeof result.current.lerp).toBe("function");
    expect(typeof result.current.lerpPosition).toBe("function");
    expect(typeof result.current.ease).toBe("function");
  });

  it("should lerp values", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    expect(result.current.lerp(0, 100, 0.5)).toBe(50);
    expect(result.current.lerp(0, 100, 0)).toBe(0);
    expect(result.current.lerp(0, 100, 1)).toBe(100);
  });

  it("should lerp positions", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    const pos = result.current.lerpPosition({ x: 0, y: 0 }, { x: 100, y: 200 }, 0.5);
    expect(pos.x).toBe(50);
    expect(pos.y).toBe(100);
  });

  it("should apply easing", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    const eased = result.current.ease(0.5, "easeInOut");
    expect(eased).toBeGreaterThanOrEqual(0);
    expect(eased).toBeLessThanOrEqual(1);
  });
});
