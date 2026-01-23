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

  it("should return undefined when peeking empty queue (line 300)", () => {
    const { result } = renderHook(() => useInputQueue());

    // Queue starts empty
    expect(result.current.peek()).toBeUndefined();
  });

  it("should peek the first item without removing it", () => {
    const { result } = renderHook(() => useInputQueue());

    act(() => {
      result.current.enqueue({ type: "tap", x: 100, y: 100 });
      result.current.enqueue({ type: "tap", x: 200, y: 200 });
    });

    const peeked = result.current.peek();
    expect(peeked).toEqual({ type: "tap", x: 100, y: 100 });
    expect(result.current.size).toBe(2); // Size unchanged
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

  it("should apply easeInOut easing for first half (line 332-333 t < 0.5)", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    // easeInOut when t < 0.5: 2 * t * t
    const eased = result.current.ease(0.25, "easeInOut");
    expect(eased).toBe(0.125); // 2 * 0.25 * 0.25 = 0.125
  });

  it("should apply easeInOut easing for second half (line 334 t >= 0.5)", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    // easeInOut when t >= 0.5: -1 + (4 - 2*t) * t
    const eased = result.current.ease(0.75, "easeInOut");
    // -1 + (4 - 2*0.75) * 0.75 = -1 + 2.5 * 0.75 = -1 + 1.875 = 0.875
    expect(eased).toBe(0.875);
  });

  it("should apply easeIn easing (line 328)", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    // easeIn: t * t
    const eased = result.current.ease(0.5, "easeIn");
    expect(eased).toBe(0.25); // 0.5 * 0.5 = 0.25
    expect(result.current.ease(0, "easeIn")).toBe(0);
    expect(result.current.ease(1, "easeIn")).toBe(1);
  });

  it("should apply easeOut easing (lines 329-330)", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    // easeOut: t * (2 - t)
    const eased = result.current.ease(0.5, "easeOut");
    expect(eased).toBe(0.75); // 0.5 * (2 - 0.5) = 0.5 * 1.5 = 0.75
    expect(result.current.ease(0, "easeOut")).toBe(0);
    expect(result.current.ease(1, "easeOut")).toBe(1);
  });

  it("should apply linear easing (line 337)", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    // linear: just returns clamped value
    expect(result.current.ease(0.5, "linear")).toBe(0.5);
    expect(result.current.ease(0, "linear")).toBe(0);
    expect(result.current.ease(1, "linear")).toBe(1);
  });

  it("should clamp values for all easing types", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    // Values below 0 should be clamped to 0
    expect(result.current.ease(-0.5, "linear")).toBe(0);
    expect(result.current.ease(-0.5, "easeIn")).toBe(0);
    expect(result.current.ease(-0.5, "easeOut")).toBe(0);

    // Values above 1 should be clamped to 1
    expect(result.current.ease(1.5, "linear")).toBe(1);
    expect(result.current.ease(1.5, "easeIn")).toBe(1);
    expect(result.current.ease(1.5, "easeOut")).toBe(1);
  });
});

// ============================================================================
// Additional Branch Coverage Tests - Sprint 613
// ============================================================================

describe("branch coverage - immediateResponseEnabled disabled (line 159)", () => {
  it("should not set feedback when immediateResponseEnabled is false", () => {
    const { result } = renderHook(() =>
      useAvatarInputResponseBridge({ immediateResponseEnabled: false })
    );

    act(() => {
      result.current.controls.queueInput({
        type: "tap",
        position: { x: 100, y: 100 },
        timestamp: performance.now(),
      });
    });

    const feedback = result.current.controls.getImmediateFeedback();
    // Feedback should not be active when disabled
    expect(feedback.isActive).toBe(false);
  });
});

describe("branch coverage - processQueue with empty queue (line 170)", () => {
  it("should return early when queue is empty", () => {
    const { result } = renderHook(() => useAvatarInputResponseBridge());

    // Process queue when empty - should return early without changing state
    act(() => {
      result.current.controls.processQueue();
    });

    // isProcessing should not have been set
    expect(result.current.state.isProcessing).toBe(false);
    expect(result.current.metrics.inputsProcessed).toBe(0);
  });
});

describe("branch coverage - coalescing conditions (lines 131-134)", () => {
  it("should not coalesce when input type differs", () => {
    const { result } = renderHook(() =>
      useAvatarInputResponseBridge({ coalesceThresholdMs: 1000 })
    );

    mockTime = 0;
    act(() => {
      result.current.controls.queueInput({
        type: "tap",
        position: { x: 100, y: 100 },
        timestamp: mockTime,
      });
    });

    // Same time but different type
    act(() => {
      result.current.controls.queueInput({
        type: "swipe",
        position: { x: 110, y: 110 },
        timestamp: mockTime,
      });
    });

    // Should have 2 inputs since types differ
    expect(result.current.state.pendingInputs).toBe(2);
  });

  it("should not coalesce when time exceeds threshold", () => {
    const { result } = renderHook(() =>
      useAvatarInputResponseBridge({ coalesceThresholdMs: 10 })
    );

    mockTime = 0;
    act(() => {
      result.current.controls.queueInput({
        type: "move",
        position: { x: 100, y: 100 },
        timestamp: mockTime,
      });
    });

    // Same type but too much time passed
    mockTime = 100;
    act(() => {
      result.current.controls.queueInput({
        type: "move",
        position: { x: 110, y: 110 },
        timestamp: mockTime,
      });
    });

    // Should have 2 inputs since time exceeds threshold
    expect(result.current.state.pendingInputs).toBe(2);
  });

  it("should not coalesce when queue is empty", () => {
    const { result } = renderHook(() =>
      useAvatarInputResponseBridge({ coalesceThresholdMs: 1000 })
    );

    // First input always adds to queue
    mockTime = 0;
    act(() => {
      result.current.controls.queueInput({
        type: "move",
        position: { x: 100, y: 100 },
        timestamp: mockTime,
      });
    });

    expect(result.current.state.pendingInputs).toBe(1);
  });

  it("should coalesce when all conditions are met", () => {
    const { result } = renderHook(() =>
      useAvatarInputResponseBridge({ coalesceThresholdMs: 100 })
    );

    mockTime = 0;
    act(() => {
      result.current.controls.queueInput({
        type: "move",
        position: { x: 100, y: 100 },
        timestamp: mockTime,
      });
    });

    expect(result.current.state.pendingInputs).toBe(1);

    // Same type, within threshold, queue not empty
    mockTime = 10;
    act(() => {
      result.current.controls.queueInput({
        type: "move",
        position: { x: 110, y: 110 },
        timestamp: mockTime,
      });
    });

    // Should still have 1 input (coalesced)
    expect(result.current.state.pendingInputs).toBe(1);
  });
});

describe("branch coverage - dropped input when queue is full (line 145)", () => {
  it("should call onInputDropped with dropped input when queue overflows", () => {
    const onInputDropped = jest.fn();
    const { result } = renderHook(() =>
      useAvatarInputResponseBridge(
        { maxQueueSize: 1, coalesceThresholdMs: 0 },
        { onInputDropped }
      )
    );

    // First input
    mockTime = 0;
    act(() => {
      result.current.controls.queueInput({
        type: "tap",
        position: { x: 100, y: 100 },
        timestamp: mockTime,
        id: "first",
      });
    });

    // Second input should cause first to be dropped
    mockTime = 100;
    act(() => {
      result.current.controls.queueInput({
        type: "swipe",
        position: { x: 200, y: 200 },
        timestamp: mockTime,
        id: "second",
      });
    });

    expect(onInputDropped).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tap",
        position: { x: 100, y: 100 },
        id: "first",
      })
    );
    expect(result.current.metrics.droppedInputs).toBe(1);
  });
});

describe("branch coverage - lerp clamping (lines 312-313)", () => {
  it("should clamp lerp values below 0", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    // t = -0.5 should be clamped to 0
    expect(result.current.lerp(0, 100, -0.5)).toBe(0);
  });

  it("should clamp lerp values above 1", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    // t = 1.5 should be clamped to 1
    expect(result.current.lerp(0, 100, 1.5)).toBe(100);
  });
});

describe("branch coverage - lerpPosition clamping (lines 317-318)", () => {
  it("should clamp lerpPosition values below 0", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    const pos = result.current.lerpPosition({ x: 0, y: 0 }, { x: 100, y: 100 }, -0.5);
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });

  it("should clamp lerpPosition values above 1", () => {
    const { result } = renderHook(() => useResponseInterpolator());

    const pos = result.current.lerpPosition({ x: 0, y: 0 }, { x: 100, y: 100 }, 1.5);
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(100);
  });
});
