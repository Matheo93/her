/**
 * Tests for Touch Response Optimizer Hook - Sprint 521
 *
 * Tests touch event optimization, prediction, and coalescing
 */

import { renderHook, act } from "@testing-library/react";
import {
  useTouchResponseOptimizer,
  useOptimizedTouchHandler,
  useTouchFeedbackPosition,
  useTouchVelocity,
  TouchPriority,
  TrackedTouch,
} from "../useTouchResponseOptimizer";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Helper to create mock touch events
function createMockTouchEvent(
  type: string,
  touches: { identifier: number; clientX: number; clientY: number; force?: number }[]
): TouchEvent {
  const touchList = touches.map((t) => ({
    identifier: t.identifier,
    clientX: t.clientX,
    clientY: t.clientY,
    force: t.force ?? 0.5,
    target: document.body,
    pageX: t.clientX,
    pageY: t.clientY,
    screenX: t.clientX,
    screenY: t.clientY,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    altitudeAngle: 0,
    azimuthAngle: 0,
    touchType: "direct" as TouchType,
  }));

  const mockTouchList = {
    length: touchList.length,
    item: (index: number) => touchList[index] || null,
    [Symbol.iterator]: () => touchList[Symbol.iterator](),
  };

  // Make array-like access work
  touchList.forEach((t, i) => {
    (mockTouchList as any)[i] = t;
  });

  return {
    type,
    touches: mockTouchList as unknown as TouchList,
    changedTouches: mockTouchList as unknown as TouchList,
    targetTouches: mockTouchList as unknown as TouchList,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as TouchEvent;
}

// Helper to create mock pointer events
function createMockPointerEvent(
  type: string,
  { pointerId = 1, clientX = 0, clientY = 0, pressure = 0.5 } = {}
): PointerEvent {
  return {
    type,
    pointerId,
    clientX,
    clientY,
    pressure,
    getCoalescedEvents: jest.fn().mockReturnValue([]),
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as PointerEvent;
}

describe("useTouchResponseOptimizer", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      expect(result.current.state.activeTouches).toHaveLength(0);
      expect(result.current.state.currentPriority).toBe("normal");
      expect(result.current.state.isProcessing).toBe(false);
      expect(result.current.state.queueSize).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useTouchResponseOptimizer({
          targetResponseMs: 8,
          enablePrediction: false,
          enableCoalescing: false,
        })
      );

      // Config is applied internally - verify through behavior
      expect(result.current.state.currentPriority).toBe("normal");
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      expect(result.current.metrics.totalTouches).toBe(0);
      expect(result.current.metrics.coalescedEvents).toBe(0);
      expect(result.current.metrics.predictedEvents).toBe(0);
      expect(result.current.metrics.averageResponseMs).toBe(0);
    });
  });

  describe("touch processing", () => {
    it("should process touch start", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const touchEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 200 },
      ]);

      act(() => {
        result.current.controls.processTouchStart(touchEvent);
      });

      expect(result.current.state.activeTouches).toHaveLength(1);
      expect(result.current.state.activeTouches[0].x).toBe(100);
      expect(result.current.state.activeTouches[0].y).toBe(200);
      expect(result.current.metrics.totalTouches).toBe(1);
    });

    it("should process touch move with velocity", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      // Initial touch
      mockTime = 0;
      const startEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 100 },
      ]);

      act(() => {
        result.current.controls.processTouchStart(startEvent);
      });

      // Move touch
      mockTime = 100; // 100ms later
      const moveEvent = createMockTouchEvent("touchmove", [
        { identifier: 1, clientX: 200, clientY: 200 },
      ]);

      act(() => {
        result.current.controls.processTouchMove(moveEvent);
      });

      const touch = result.current.state.activeTouches[0];
      expect(touch.x).toBe(200);
      expect(touch.y).toBe(200);
      // Velocity should be calculated (pixels/second)
      expect(touch.velocityX).toBeGreaterThan(0);
      expect(touch.velocityY).toBeGreaterThan(0);
    });

    it("should process touch end", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      // Start touch
      const startEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 100 },
      ]);

      act(() => {
        result.current.controls.processTouchStart(startEvent);
      });

      expect(result.current.state.activeTouches).toHaveLength(1);

      // End touch
      const endEvent = createMockTouchEvent("touchend", [
        { identifier: 1, clientX: 100, clientY: 100 },
      ]);

      act(() => {
        result.current.controls.processTouchEnd(endEvent);
      });

      expect(result.current.state.activeTouches).toHaveLength(0);
    });

    it("should handle multiple simultaneous touches", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const touchEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 100 },
        { identifier: 2, clientX: 200, clientY: 200 },
      ]);

      act(() => {
        result.current.controls.processTouchStart(touchEvent);
      });

      expect(result.current.state.activeTouches).toHaveLength(2);
      expect(result.current.metrics.totalTouches).toBe(2);
    });
  });

  describe("pointer event handling", () => {
    it("should process pointer down", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const pointerEvent = createMockPointerEvent("pointerdown", {
        pointerId: 1,
        clientX: 150,
        clientY: 250,
      });

      act(() => {
        result.current.controls.processTouchStart(pointerEvent);
      });

      expect(result.current.state.activeTouches).toHaveLength(1);
      expect(result.current.state.activeTouches[0].x).toBe(150);
      expect(result.current.state.activeTouches[0].y).toBe(250);
    });
  });

  describe("position prediction", () => {
    it("should predict touch position", () => {
      const { result } = renderHook(() =>
        useTouchResponseOptimizer({ enablePrediction: true })
      );

      // Initial touch
      mockTime = 0;
      const startEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 0, clientY: 0 },
      ]);

      act(() => {
        result.current.controls.processTouchStart(startEvent);
      });

      // Move touch to establish velocity
      mockTime = 100;
      const moveEvent = createMockTouchEvent("touchmove", [
        { identifier: 1, clientX: 100, clientY: 0 },
      ]);

      act(() => {
        result.current.controls.processTouchMove(moveEvent);
      });

      // Get prediction
      let predicted: ReturnType<typeof result.current.controls.getPredictedPosition> = null;
      act(() => {
        predicted = result.current.controls.getPredictedPosition(1, 50);
      });

      expect(predicted).not.toBeNull();
      // Should predict ahead based on velocity
      expect(predicted!.x).toBeGreaterThan(100);
    });

    it("should return null for unknown touch", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const predicted = result.current.controls.getPredictedPosition(999, 50);

      expect(predicted).toBeNull();
    });

    it("should return current position when prediction disabled", () => {
      const { result } = renderHook(() =>
        useTouchResponseOptimizer({ enablePrediction: false })
      );

      mockTime = 0;
      const touchEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 100 },
      ]);

      act(() => {
        result.current.controls.processTouchStart(touchEvent);
      });

      const predicted = result.current.controls.getPredictedPosition(1, 50);

      expect(predicted).toEqual({ x: 100, y: 100 });
    });

    it("should increment prediction metrics", () => {
      const { result } = renderHook(() =>
        useTouchResponseOptimizer({ enablePrediction: true })
      );

      const touchEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 100 },
      ]);

      act(() => {
        result.current.controls.processTouchStart(touchEvent);
        result.current.controls.getPredictedPosition(1, 50);
      });

      expect(result.current.metrics.predictedEvents).toBe(1);
    });
  });

  describe("immediate feedback", () => {
    it("should provide immediate feedback position", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const touchEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 200, force: 0.8 },
      ]);

      act(() => {
        result.current.controls.processTouchStart(touchEvent);
      });

      let feedback: ReturnType<typeof result.current.controls.getImmediateFeedbackPosition> = null;
      act(() => {
        feedback = result.current.controls.getImmediateFeedbackPosition(touchEvent);
      });

      expect(feedback).not.toBeNull();
      expect(feedback!.touchId).toBe(1);
      expect(feedback!.isVisible).toBe(true);
      // Scale should be affected by pressure
      expect(feedback!.scale).toBeGreaterThan(0.9);
    });

    it("should return null for invalid event", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const emptyEvent = createMockTouchEvent("touchstart", []);

      const feedback = result.current.controls.getImmediateFeedbackPosition(emptyEvent);

      expect(feedback).toBeNull();
    });
  });

  describe("wrapped touch handler", () => {
    it("should wrap handler with optimization", () => {
      const handler = jest.fn();
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const wrappedHandler = result.current.controls.wrapTouchHandler(handler);

      const touchEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 100 },
      ]);

      act(() => {
        wrappedHandler(touchEvent);
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          originalEvent: touchEvent,
          touches: expect.any(Array),
          priority: "normal",
        })
      );
    });

    it("should measure handler response time", () => {
      const handler = jest.fn();
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const wrappedHandler = result.current.controls.wrapTouchHandler(handler);

      const touchEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 100 },
      ]);

      mockTime = 0;
      act(() => {
        wrappedHandler(touchEvent);
      });

      expect(result.current.state.lastResponseMs).toBeGreaterThanOrEqual(0);
      expect(result.current.metrics.timings).toHaveLength(1);
    });

    it("should handle different event types", () => {
      const handler = jest.fn();
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const wrappedHandler = result.current.controls.wrapTouchHandler(handler);

      // Touch start
      act(() => {
        wrappedHandler(
          createMockTouchEvent("touchstart", [{ identifier: 1, clientX: 100, clientY: 100 }])
        );
      });

      expect(result.current.state.activeTouches).toHaveLength(1);

      // Touch move
      act(() => {
        wrappedHandler(
          createMockTouchEvent("touchmove", [{ identifier: 1, clientX: 150, clientY: 150 }])
        );
      });

      expect(result.current.state.activeTouches[0].x).toBe(150);

      // Touch end
      act(() => {
        wrappedHandler(
          createMockTouchEvent("touchend", [{ identifier: 1, clientX: 150, clientY: 150 }])
        );
      });

      expect(result.current.state.activeTouches).toHaveLength(0);
    });

    it("should respect priority setting", () => {
      const handler = jest.fn();
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const wrappedHandler = result.current.controls.wrapTouchHandler(handler, "critical");

      const touchEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 100 },
      ]);

      act(() => {
        wrappedHandler(touchEvent);
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: "critical",
        })
      );
    });

    it("should call onSlowResponse callback", () => {
      const onSlowResponse = jest.fn();
      const { result } = renderHook(() =>
        useTouchResponseOptimizer({ targetResponseMs: 8 }, { onSlowResponse })
      );

      // Create slow handler
      const slowHandler = jest.fn(() => {
        mockTime += 50; // Simulate slow execution (> 16ms target * 2)
      });

      const wrappedHandler = result.current.controls.wrapTouchHandler(slowHandler);

      const touchEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 100 },
      ]);

      mockTime = 0;
      act(() => {
        wrappedHandler(touchEvent);
      });

      expect(onSlowResponse).toHaveBeenCalled();
    });
  });

  describe("priority management", () => {
    it("should update current priority", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      act(() => {
        result.current.controls.setPriority("high");
      });

      expect(result.current.state.currentPriority).toBe("high");
    });

    it("should drop low priority events when enabled", () => {
      const handler = jest.fn();
      const { result } = renderHook(() =>
        useTouchResponseOptimizer({
          enablePrioritization: true,
          dropLowPriority: true,
        })
      );

      // Set high priority mode
      act(() => {
        result.current.controls.setPriority("critical");
      });

      // Try to handle deferred priority event
      const wrappedHandler = result.current.controls.wrapTouchHandler(handler, "deferred");

      const touchEvent = createMockTouchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 100 },
      ]);

      act(() => {
        wrappedHandler(touchEvent);
      });

      // Handler should not be called due to priority drop
      expect(handler).not.toHaveBeenCalled();
      expect(result.current.metrics.droppedLowPriority).toBe(1);
    });
  });

  describe("touch utilities", () => {
    it("should clear all touches", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      // Add touches
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", [
            { identifier: 1, clientX: 100, clientY: 100 },
            { identifier: 2, clientX: 200, clientY: 200 },
          ])
        );
      });

      expect(result.current.state.activeTouches).toHaveLength(2);

      // Clear
      act(() => {
        result.current.controls.clearTouches();
      });

      expect(result.current.state.activeTouches).toHaveLength(0);
    });

    it("should get touch by ID", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", [
            { identifier: 42, clientX: 100, clientY: 200 },
          ])
        );
      });

      const touch = result.current.controls.getTouch(42);

      expect(touch).not.toBeNull();
      expect(touch!.id).toBe(42);
      expect(touch!.x).toBe(100);
      expect(touch!.y).toBe(200);
    });

    it("should return null for unknown touch ID", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const touch = result.current.controls.getTouch(999);

      expect(touch).toBeNull();
    });
  });

  describe("metrics", () => {
    it("should reset metrics", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      // Generate some metrics
      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", [
            { identifier: 1, clientX: 100, clientY: 100 },
          ])
        );
      });

      expect(result.current.metrics.totalTouches).toBe(1);

      // Reset
      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.totalTouches).toBe(0);
      expect(result.current.metrics.coalescedEvents).toBe(0);
      expect(result.current.metrics.averageResponseMs).toBe(0);
      expect(result.current.metrics.timings).toHaveLength(0);
    });

    it("should calculate percentile metrics", () => {
      const handler = jest.fn();
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const wrappedHandler = result.current.controls.wrapTouchHandler(handler);

      // Generate multiple measurements
      for (let i = 0; i < 10; i++) {
        mockTime = i * 10;
        act(() => {
          wrappedHandler(
            createMockTouchEvent("touchstart", [
              { identifier: i, clientX: i * 10, clientY: i * 10 },
            ])
          );
        });
      }

      expect(result.current.metrics.timings.length).toBe(10);
      // Percentiles should be calculated
      expect(result.current.metrics.p50ResponseMs).toBeGreaterThanOrEqual(0);
      expect(result.current.metrics.p95ResponseMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("callbacks", () => {
    it("should call onTouchStart callback", () => {
      const onTouchStart = jest.fn();
      const { result } = renderHook(() =>
        useTouchResponseOptimizer({}, { onTouchStart })
      );

      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", [
            { identifier: 1, clientX: 100, clientY: 100 },
          ])
        );
      });

      expect(onTouchStart).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 1 })])
      );
    });

    it("should call onTouchMove callback", () => {
      const onTouchMove = jest.fn();
      const { result } = renderHook(() =>
        useTouchResponseOptimizer({}, { onTouchMove })
      );

      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", [
            { identifier: 1, clientX: 100, clientY: 100 },
          ])
        );
        result.current.controls.processTouchMove(
          createMockTouchEvent("touchmove", [
            { identifier: 1, clientX: 150, clientY: 150 },
          ])
        );
      });

      expect(onTouchMove).toHaveBeenCalled();
    });

    it("should call onTouchEnd callback", () => {
      const onTouchEnd = jest.fn();
      const { result } = renderHook(() =>
        useTouchResponseOptimizer({}, { onTouchEnd })
      );

      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", [
            { identifier: 1, clientX: 100, clientY: 100 },
          ])
        );
        result.current.controls.processTouchEnd(
          createMockTouchEvent("touchend", [
            { identifier: 1, clientX: 100, clientY: 100 },
          ])
        );
      });

      expect(onTouchEnd).toHaveBeenCalled();
    });
  });
});

describe("useOptimizedTouchHandler", () => {
  it("should return wrapped handler function", () => {
    const handler = jest.fn();
    const { result } = renderHook(() => useOptimizedTouchHandler(handler));

    expect(typeof result.current).toBe("function");
  });

  it("should call handler with optimized event", () => {
    const handler = jest.fn();
    const { result } = renderHook(() => useOptimizedTouchHandler(handler, "high"));

    const touchEvent = createMockTouchEvent("touchstart", [
      { identifier: 1, clientX: 100, clientY: 100 },
    ]);

    act(() => {
      result.current(touchEvent);
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        originalEvent: touchEvent,
        priority: "high",
      })
    );
  });
});

describe("useTouchFeedbackPosition", () => {
  it("should provide feedback function and active touches", () => {
    const { result } = renderHook(() => useTouchFeedbackPosition());

    expect(typeof result.current.getFeedback).toBe("function");
    expect(result.current.activeTouches).toHaveLength(0);
  });
});

describe("useTouchVelocity", () => {
  it("should return null for unknown touch", () => {
    const { result } = renderHook(() => useTouchVelocity(999));

    expect(result.current).toBeNull();
  });
});

// ============================================================================
// Sprint 621: Branch coverage improvements
// ============================================================================

describe("useTouchResponseOptimizer - branch coverage", () => {
  describe("pointer event handling branches", () => {
    it("should process pointer up event (line 473)", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const pointerStart = createMockPointerEvent("pointerdown", {
        pointerId: 42,
        clientX: 100,
        clientY: 100,
      });

      act(() => {
        result.current.controls.processTouchStart(pointerStart);
      });

      expect(result.current.state.activeTouches).toHaveLength(1);

      const pointerEnd = createMockPointerEvent("pointerup", {
        pointerId: 42,
        clientX: 100,
        clientY: 100,
      });

      act(() => {
        result.current.controls.processTouchEnd(pointerEnd);
      });

      expect(result.current.state.activeTouches).toHaveLength(0);
    });

    it("should handle pointer cancel event", () => {
      const handler = jest.fn();
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const wrappedHandler = result.current.controls.wrapTouchHandler(handler);

      const pointerStart = createMockPointerEvent("pointerdown", {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      act(() => {
        wrappedHandler(pointerStart);
      });

      const pointerCancel = createMockPointerEvent("pointercancel", {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });

      act(() => {
        wrappedHandler(pointerCancel);
      });

      expect(result.current.state.activeTouches).toHaveLength(0);
    });

    it("should handle touch cancel event", () => {
      const handler = jest.fn();
      const { result } = renderHook(() => useTouchResponseOptimizer());

      const wrappedHandler = result.current.controls.wrapTouchHandler(handler);

      act(() => {
        wrappedHandler(
          createMockTouchEvent("touchstart", [{ identifier: 1, clientX: 100, clientY: 100 }])
        );
      });

      act(() => {
        wrappedHandler(
          createMockTouchEvent("touchcancel", [{ identifier: 1, clientX: 100, clientY: 100 }])
        );
      });

      expect(result.current.state.activeTouches).toHaveLength(0);
    });
  });

  describe("coalesced events handling", () => {
    it("should handle coalesced events with multiple items (lines 596-599)", () => {
      const handler = jest.fn();
      const { result } = renderHook(() =>
        useTouchResponseOptimizer({ enableCoalescing: true })
      );

      const wrappedHandler = result.current.controls.wrapTouchHandler(handler);

      const coalescedEvents = [
        { clientX: 100, clientY: 100 },
        { clientX: 110, clientY: 110 },
        { clientX: 120, clientY: 120 },
      ];

      const pointerEvent = {
        type: "pointermove",
        pointerId: 1,
        clientX: 120,
        clientY: 120,
        pressure: 0.5,
        getCoalescedEvents: jest.fn().mockReturnValue(coalescedEvents),
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      } as unknown as PointerEvent;

      act(() => {
        wrappedHandler(
          createMockPointerEvent("pointerdown", {
            pointerId: 1,
            clientX: 100,
            clientY: 100,
          })
        );
      });

      const initialCoalesced = result.current.metrics.coalescedEvents;

      act(() => {
        wrappedHandler(pointerEvent);
      });

      expect(result.current.metrics.coalescedEvents).toBeGreaterThan(initialCoalesced);
    });
  });

  describe("velocity calculation edge cases", () => {
    it("should handle zero time delta in velocity calculation", () => {
      const { result } = renderHook(() => useTouchResponseOptimizer());

      mockTime = 100;

      act(() => {
        result.current.controls.processTouchStart(
          createMockTouchEvent("touchstart", [{ identifier: 1, clientX: 100, clientY: 100 }])
        );
      });

      act(() => {
        result.current.controls.processTouchMove(
          createMockTouchEvent("touchmove", [{ identifier: 1, clientX: 200, clientY: 200 }])
        );
      });

      const touch = result.current.state.activeTouches[0];
      expect(touch.velocityX).toBe(0);
      expect(touch.velocityY).toBe(0);
    });
  });

  describe("prioritization disabled path", () => {
    it("should not drop events when prioritization is disabled", () => {
      const handler = jest.fn();
      const { result } = renderHook(() =>
        useTouchResponseOptimizer({
          enablePrioritization: false,
          dropLowPriority: true,
        })
      );

      act(() => {
        result.current.controls.setPriority("critical");
      });

      const wrappedHandler = result.current.controls.wrapTouchHandler(handler, "deferred");

      act(() => {
        wrappedHandler(
          createMockTouchEvent("touchstart", [{ identifier: 1, clientX: 100, clientY: 100 }])
        );
      });

      expect(handler).toHaveBeenCalled();
      expect(result.current.metrics.droppedLowPriority).toBe(0);
    });
  });
});
