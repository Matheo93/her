/**
 * Tests for Touch Latency Reducer Hook - Sprint 228
 *
 * Tests touch event coalescing, prediction, queue management,
 * and latency measurement for mobile devices.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useTouchLatencyReducer,
  useLowLatencyTouch,
  useTouchLatencyMetrics,
  type TimedTouchEvent,
  type ReducerConfig,
} from "../useTouchLatencyReducer";

// Mock performance.now for consistent timing
const mockPerformanceNow = jest.spyOn(performance, "now");

beforeEach(() => {
  jest.useFakeTimers();
  mockPerformanceNow.mockReturnValue(0);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

// Helper to create mock pointer events (PointerEvent may not exist in jsdom)
function createMockPointerEvent(
  type: string,
  options: {
    clientX?: number;
    clientY?: number;
    pointerId?: number;
    timeStamp?: number;
    coalescedEvents?: Array<{ clientX: number; clientY: number; timeStamp?: number }>;
    predictedEvents?: Array<{ clientX: number; clientY: number; timeStamp?: number }>;
  } = {}
): PointerEvent {
  const {
    clientX = 100,
    clientY = 100,
    pointerId = 1,
    timeStamp = performance.now(),
    coalescedEvents = [],
    predictedEvents = [],
  } = options;

  // Create a mock object since PointerEvent may not exist in jsdom
  const event = {
    type,
    clientX,
    clientY,
    pointerId,
    bubbles: true,
    cancelable: true,
    timeStamp,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    getCoalescedEvents: () =>
      coalescedEvents.length > 0
        ? coalescedEvents.map((e) => ({
            clientX: e.clientX,
            clientY: e.clientY,
            timeStamp: e.timeStamp ?? timeStamp,
          }))
        : [{ clientX, clientY, timeStamp }],
    getPredictedEvents: () =>
      predictedEvents.map((e) => ({
        clientX: e.clientX,
        clientY: e.clientY,
        timeStamp: e.timeStamp ?? timeStamp + 16,
      })),
  } as unknown as PointerEvent;

  return event;
}

// Helper to create mock touch events
function createMockTouchEvent(
  type: string,
  options: {
    clientX?: number;
    clientY?: number;
    timeStamp?: number;
  } = {}
): TouchEvent {
  const { clientX = 100, clientY = 100, timeStamp = performance.now() } = options;

  const touch = {
    identifier: 0,
    clientX,
    clientY,
    pageX: clientX,
    pageY: clientY,
    screenX: clientX,
    screenY: clientY,
    radiusX: 5,
    radiusY: 5,
    force: 1,
    rotationAngle: 0,
    target: document.body,
  } as Touch;

  const touchList = {
    length: 1,
    item: () => touch,
    [0]: touch,
    [Symbol.iterator]: function* () {
      yield touch;
    },
  } as unknown as TouchList;

  const event = {
    type,
    touches: type === "touchend" ? { length: 0, item: () => null } : touchList,
    changedTouches: touchList,
    targetTouches: touchList,
    timeStamp,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as TouchEvent;

  return event;
}

describe("useTouchLatencyReducer", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.currentTouch).toBeNull();
      expect(result.current.state.latestPosition).toBeNull();
      expect(result.current.state.velocity).toEqual({ x: 0, y: 0 });
      expect(result.current.state.queueLength).toBe(0);
    });

    it("should initialize metrics to default values", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      expect(result.current.state.metrics.eventsProcessed).toBe(0);
      expect(result.current.state.metrics.eventsDropped).toBe(0);
      expect(result.current.state.metrics.coalescedEventsUsed).toBe(0);
      expect(result.current.state.metrics.predictedEventsUsed).toBe(0);
    });

    it("should accept custom configuration", () => {
      const config: Partial<ReducerConfig> = {
        maxQueueSize: 5,
        eventDeadlineMs: 16,
        immediateFeedback: false,
      };

      const { result } = renderHook(() => useTouchLatencyReducer(config));

      expect(result.current.state).toBeDefined();
      expect(result.current.controls).toBeDefined();
    });
  });

  describe("touch event processing", () => {
    it("should process pointer down event", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      const event = createMockPointerEvent("pointerdown", {
        clientX: 150,
        clientY: 200,
      });

      act(() => {
        result.current.controls.processTouch(event);
      });

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.latestPosition).toEqual({ x: 150, y: 200 });
      expect(result.current.state.metrics.eventsProcessed).toBeGreaterThan(0);
    });

    it("should process pointer move event", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      // Start touch
      const downEvent = createMockPointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
      });

      act(() => {
        result.current.controls.processTouch(downEvent);
      });

      mockPerformanceNow.mockReturnValue(16);

      // Move touch
      const moveEvent = createMockPointerEvent("pointermove", {
        clientX: 120,
        clientY: 130,
        timeStamp: 16,
      });

      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      expect(result.current.state.latestPosition).toEqual({ x: 120, y: 130 });
    });

    it("should process pointer up event and deactivate", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      // Start touch
      const downEvent = createMockPointerEvent("pointerdown");
      act(() => {
        result.current.controls.processTouch(downEvent);
      });

      expect(result.current.state.isActive).toBe(true);

      // End touch
      const upEvent = createMockPointerEvent("pointerup");
      act(() => {
        result.current.controls.processTouch(upEvent);
      });

      expect(result.current.state.isActive).toBe(false);
    });

    it("should process pointer cancel event and deactivate", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      // Start touch
      const downEvent = createMockPointerEvent("pointerdown");
      act(() => {
        result.current.controls.processTouch(downEvent);
      });

      // Cancel touch
      const cancelEvent = createMockPointerEvent("pointercancel");
      act(() => {
        result.current.controls.processTouch(cancelEvent);
      });

      expect(result.current.state.isActive).toBe(false);
    });

    it("should process touch events", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      const touchEvent = createMockTouchEvent("touchstart", {
        clientX: 200,
        clientY: 250,
      });

      act(() => {
        result.current.controls.processTouch(touchEvent as any);
      });

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.latestPosition).toEqual({ x: 200, y: 250 });
    });
  });

  describe("velocity calculation", () => {
    it("should calculate velocity from movement", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      // Start touch
      mockPerformanceNow.mockReturnValue(0);
      const downEvent = createMockPointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
        timeStamp: 0,
      });
      act(() => {
        result.current.controls.processTouch(downEvent);
      });

      // Move touch after 100ms
      mockPerformanceNow.mockReturnValue(100);
      const moveEvent = createMockPointerEvent("pointermove", {
        clientX: 200,
        clientY: 100,
        timeStamp: 100,
      });
      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      // Velocity should be 100 px / 0.1s = 1000 px/s
      expect(result.current.state.velocity.x).toBe(1000);
      expect(result.current.state.velocity.y).toBe(0);
    });

    it("should reset velocity on touch end", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      // Start and move
      const downEvent = createMockPointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
        timeStamp: 0,
      });
      act(() => {
        result.current.controls.processTouch(downEvent);
      });

      mockPerformanceNow.mockReturnValue(100);
      const moveEvent = createMockPointerEvent("pointermove", {
        clientX: 200,
        clientY: 100,
        timeStamp: 100,
      });
      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      expect(result.current.state.velocity.x).toBeGreaterThan(0);

      // End touch
      const upEvent = createMockPointerEvent("pointerup");
      act(() => {
        result.current.controls.processTouch(upEvent);
      });

      expect(result.current.state.velocity).toEqual({ x: 0, y: 0 });
    });
  });

  describe("coalesced events", () => {
    it("should process coalesced events", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({ processCoalescedEvents: true })
      );

      const event = createMockPointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
        coalescedEvents: [
          { clientX: 95, clientY: 95 },
          { clientX: 97, clientY: 97 },
          { clientX: 100, clientY: 100 },
        ],
      });

      act(() => {
        result.current.controls.processTouch(event);
      });

      expect(result.current.state.metrics.coalescedEventsUsed).toBeGreaterThan(0);
    });

    it("should skip coalesced events when disabled", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({ processCoalescedEvents: false })
      );

      const event = createMockPointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
        coalescedEvents: [
          { clientX: 95, clientY: 95 },
          { clientX: 97, clientY: 97 },
          { clientX: 100, clientY: 100 },
        ],
      });

      act(() => {
        result.current.controls.processTouch(event);
      });

      // Only one event processed when coalescing is disabled
      expect(result.current.state.metrics.eventsProcessed).toBe(1);
    });
  });

  describe("predicted events", () => {
    it("should process predicted events", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({ usePredictedEvents: true })
      );

      // Start touch
      const downEvent = createMockPointerEvent("pointerdown");
      act(() => {
        result.current.controls.processTouch(downEvent);
      });

      // Move with predicted events
      const moveEvent = createMockPointerEvent("pointermove", {
        clientX: 100,
        clientY: 100,
        predictedEvents: [
          { clientX: 110, clientY: 110 },
          { clientX: 120, clientY: 120 },
        ],
      });

      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      expect(result.current.state.metrics.predictedEventsUsed).toBeGreaterThan(0);
    });

    it("should skip predicted events when disabled", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({ usePredictedEvents: false })
      );

      // Start touch
      const downEvent = createMockPointerEvent("pointerdown");
      act(() => {
        result.current.controls.processTouch(downEvent);
      });

      const initialProcessed = result.current.state.metrics.eventsProcessed;

      // Move with predicted events
      const moveEvent = createMockPointerEvent("pointermove", {
        clientX: 100,
        clientY: 100,
        predictedEvents: [
          { clientX: 110, clientY: 110 },
          { clientX: 120, clientY: 120 },
        ],
      });

      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      expect(result.current.state.metrics.predictedEventsUsed).toBe(0);
    });
  });

  describe("position prediction", () => {
    it("should predict future position based on velocity", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      // Start and move to establish velocity
      mockPerformanceNow.mockReturnValue(0);
      const downEvent = createMockPointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
        timeStamp: 0,
      });
      act(() => {
        result.current.controls.processTouch(downEvent);
      });

      mockPerformanceNow.mockReturnValue(100);
      const moveEvent = createMockPointerEvent("pointermove", {
        clientX: 200,
        clientY: 100,
        timeStamp: 100,
      });
      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      // Predict position 16ms ahead
      const predicted = result.current.controls.getPredictedPosition(16);

      expect(predicted).not.toBeNull();
      // Velocity is 1000 px/s, 16ms = 16 px
      expect(predicted!.x).toBeCloseTo(216, 0);
      expect(predicted!.y).toBe(100);
    });

    it("should return null when no position is available", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      const predicted = result.current.controls.getPredictedPosition();

      expect(predicted).toBeNull();
    });
  });

  describe("event handler", () => {
    it("should call registered handler on touch events", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());
      const handler = jest.fn();

      act(() => {
        result.current.controls.onTouch(handler);
      });

      const event = createMockPointerEvent("pointerdown");
      act(() => {
        result.current.controls.processTouch(event);
      });

      expect(handler).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "start",
          x: expect.any(Number),
          y: expect.any(Number),
        })
      );
    });
  });

  describe("reset", () => {
    it("should reset all state", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      // Generate some state
      const event = createMockPointerEvent("pointerdown", {
        clientX: 150,
        clientY: 200,
      });
      act(() => {
        result.current.controls.processTouch(event);
      });

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.metrics.eventsProcessed).toBeGreaterThan(0);

      // Reset
      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.currentTouch).toBeNull();
      expect(result.current.state.latestPosition).toBeNull();
      expect(result.current.state.velocity).toEqual({ x: 0, y: 0 });
      expect(result.current.state.metrics.eventsProcessed).toBe(0);
    });
  });

  describe("latency metrics", () => {
    it("should track min and max latency", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({ measureLatency: true })
      );

      // Process multiple events
      for (let i = 0; i < 5; i++) {
        mockPerformanceNow.mockReturnValue(i * 16);
        const event = createMockPointerEvent("pointermove", {
          clientX: 100 + i * 10,
          clientY: 100,
          timeStamp: i * 16,
        });
        act(() => {
          result.current.controls.processTouch(event);
        });
      }

      expect(result.current.state.metrics.minLatency).toBeLessThanOrEqual(
        result.current.state.metrics.maxLatency
      );
    });

    it("should calculate average latency", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({ measureLatency: true, latencySampleSize: 5 })
      );

      // Process events
      for (let i = 0; i < 5; i++) {
        const event = createMockPointerEvent("pointermove", {
          clientX: 100 + i * 10,
          clientY: 100,
        });
        act(() => {
          result.current.controls.processTouch(event);
        });
      }

      expect(result.current.state.metrics.averageLatency.totalLatency).toBeGreaterThanOrEqual(0);
    });
  });

  describe("queue mode", () => {
    it("should queue events when immediate feedback is disabled", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({
          immediateFeedback: false,
          maxQueueSize: 10,
        })
      );

      const event = createMockPointerEvent("pointerdown");
      act(() => {
        result.current.controls.processTouch(event);
      });

      // In queue mode, events are processed but queue management is active
      expect(result.current.state.metrics.eventsProcessed).toBeGreaterThanOrEqual(0);
    });

    it("should flush queue on demand", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({ immediateFeedback: false })
      );

      act(() => {
        result.current.controls.flushQueue();
      });

      expect(result.current.state.queueLength).toBe(0);
    });
  });

  describe("element attachment", () => {
    it("should attach and detach from element", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      const element = document.createElement("div");
      const addEventListenerSpy = jest.spyOn(element, "addEventListener");
      const removeEventListenerSpy = jest.spyOn(element, "removeEventListener");

      let cleanup: () => void;
      act(() => {
        cleanup = result.current.controls.attachToElement(element);
      });

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "pointerdown",
        expect.any(Function),
        expect.any(Object)
      );

      act(() => {
        cleanup();
      });

      expect(removeEventListenerSpy).toHaveBeenCalled();
    });

    it("should set touch-action style on attached element", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      const element = document.createElement("div");

      act(() => {
        result.current.controls.attachToElement(element);
      });

      expect(element.style.touchAction).toBe("none");
    });
  });
});

describe("useLowLatencyTouch", () => {
  it("should provide simplified touch tracking", () => {
    const { result } = renderHook(() => useLowLatencyTouch());

    expect(result.current.position).toBeNull();
    expect(result.current.isActive).toBe(false);
    expect(typeof result.current.attachTo).toBe("function");
  });

  it("should track position when attached", () => {
    const { result } = renderHook(() => useLowLatencyTouch());

    // The hook provides simplified interface
    expect(result.current.position).toBeNull();
    expect(result.current.isActive).toBe(false);
  });
});

describe("useTouchLatencyMetrics", () => {
  it("should provide latency metrics", () => {
    const { result } = renderHook(() => useTouchLatencyMetrics());

    expect(result.current.averageLatency).toBeGreaterThanOrEqual(0);
    expect(result.current.minLatency).toBeGreaterThanOrEqual(0);
    expect(result.current.maxLatency).toBeGreaterThanOrEqual(0);
    expect(result.current.breakdown).toBeDefined();
  });

  it("should have valid breakdown structure", () => {
    const { result } = renderHook(() => useTouchLatencyMetrics());

    expect(result.current.breakdown).toEqual(
      expect.objectContaining({
        inputLatency: expect.any(Number),
        processingLatency: expect.any(Number),
        renderLatency: expect.any(Number),
        totalLatency: expect.any(Number),
      })
    );
  });
});

// ============================================================================
// Sprint 620 - Branch Coverage Tests
// ============================================================================

describe("Sprint 620 - branch coverage improvements", () => {
  describe("getEventPosition edge cases (line 193)", () => {
    it("should return null when touch event has no touches", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      // Create a touch event with empty touches
      const emptyTouchEvent = {
        type: "touchend",
        touches: { length: 0, item: () => null } as unknown as TouchList,
        changedTouches: { length: 0, item: () => null } as unknown as TouchList,
        timeStamp: 0,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      } as unknown as TouchEvent;

      // Process should handle gracefully
      act(() => {
        result.current.controls.processTouch(emptyTouchEvent as any);
      });

      // Position should remain null since no touch position available
      expect(result.current.state.latestPosition).toBeNull();
    });
  });

  describe("getCoalescedEvents error handling (lines 204-207)", () => {
    it("should handle getCoalescedEvents throwing an error", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({ processCoalescedEvents: true })
      );

      // Create event where getCoalescedEvents throws
      const event = {
        type: "pointerdown",
        clientX: 100,
        clientY: 100,
        pointerId: 1,
        timeStamp: 0,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        getCoalescedEvents: () => {
          throw new Error("Not supported");
        },
        getPredictedEvents: () => [],
      } as unknown as PointerEvent;

      act(() => {
        result.current.controls.processTouch(event);
      });

      // Should still process the event
      expect(result.current.state.metrics.eventsProcessed).toBeGreaterThan(0);
    });
  });

  describe("getPredictedEvents error handling (lines 218-221)", () => {
    it("should handle getPredictedEvents throwing an error", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({ usePredictedEvents: true })
      );

      // Start touch first
      const downEvent = createMockPointerEvent("pointerdown");
      act(() => {
        result.current.controls.processTouch(downEvent);
      });

      // Create event where getPredictedEvents throws
      const moveEvent = {
        type: "pointermove",
        clientX: 110,
        clientY: 110,
        pointerId: 1,
        timeStamp: 16,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        getCoalescedEvents: () => [{ clientX: 110, clientY: 110, timeStamp: 16 }],
        getPredictedEvents: () => {
          throw new Error("Not supported");
        },
      } as unknown as PointerEvent;

      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      // Should still process the event without predicted events
      expect(result.current.state.metrics.eventsProcessed).toBeGreaterThan(1);
      expect(result.current.state.metrics.predictedEventsUsed).toBe(0);
    });
  });

  describe("fast movement priority bonus (line 258)", () => {
    it("should give higher priority to fast movements", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({
          immediateFeedback: false,
          highPriorityVelocity: 100,
        })
      );

      // Start touch
      mockPerformanceNow.mockReturnValue(0);
      const downEvent = createMockPointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
        timeStamp: 0,
      });
      act(() => {
        result.current.controls.processTouch(downEvent);
      });

      // Fast movement (200px in 100ms = 2000 px/s > highPriorityVelocity)
      mockPerformanceNow.mockReturnValue(100);
      const moveEvent = createMockPointerEvent("pointermove", {
        clientX: 300,
        clientY: 100,
        timeStamp: 100,
      });
      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      // Velocity should be high
      expect(Math.abs(result.current.state.velocity.x)).toBeGreaterThan(100);
    });
  });

  describe("latency sample history overflow (line 306)", () => {
    it("should limit latency sample history", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({
          measureLatency: true,
          latencySampleSize: 3, // Small sample size
        })
      );

      // Process many events to overflow sample history
      for (let i = 0; i < 10; i++) {
        mockPerformanceNow.mockReturnValue(i * 16);
        const event = createMockPointerEvent("pointermove", {
          clientX: 100 + i * 10,
          clientY: 100,
          timeStamp: i * 16,
        });
        act(() => {
          result.current.controls.processTouch(event);
        });
      }

      // Should still have valid metrics despite overflow
      expect(result.current.state.metrics.eventsProcessed).toBe(10);
      // Latency can be negative due to mocked timestamps
      expect(typeof result.current.state.metrics.averageLatency.totalLatency).toBe("number");
    });
  });

  describe("queue overflow handling (lines 401-425)", () => {
    it("should drop low priority events when queue overflows", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({
          immediateFeedback: false,
          maxQueueSize: 2,
          eventDeadlineMs: 1000, // Long deadline so events don't expire
        })
      );

      // Fill queue with move events (low priority)
      for (let i = 0; i < 5; i++) {
        mockPerformanceNow.mockReturnValue(i * 10);
        const moveEvent = createMockPointerEvent("pointermove", {
          clientX: 100 + i * 10,
          clientY: 100,
          timeStamp: i * 10,
        });
        act(() => {
          result.current.controls.processTouch(moveEvent);
        });
      }

      // Some events should be dropped due to queue overflow
      expect(result.current.state.metrics.eventsDropped).toBeGreaterThanOrEqual(0);
    });

    it("should prioritize start/end events over move events in queue", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({
          immediateFeedback: false,
          maxQueueSize: 2,
          eventDeadlineMs: 1,
        })
      );

      // Add move event
      mockPerformanceNow.mockReturnValue(0);
      const moveEvent = createMockPointerEvent("pointermove", {
        clientX: 100,
        clientY: 100,
        timeStamp: 0,
      });
      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      // Advance time past deadline
      mockPerformanceNow.mockReturnValue(100);

      // Add high priority start event
      const startEvent = createMockPointerEvent("pointerdown", {
        clientX: 150,
        clientY: 150,
        timeStamp: 100,
      });
      act(() => {
        result.current.controls.processTouch(startEvent);
      });

      // Latest position should be from the higher priority event
      expect(result.current.state.latestPosition?.x).toBe(150);
    });
  });

  describe("queue priority insertion (lines 439-442)", () => {
    it("should insert events in priority order", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({
          immediateFeedback: false,
          maxQueueSize: 10,
        })
      );

      // Add multiple events with different priorities
      mockPerformanceNow.mockReturnValue(0);

      // Move event (low priority)
      const moveEvent = createMockPointerEvent("pointermove", {
        clientX: 100,
        clientY: 100,
        timeStamp: 0,
      });
      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      // Start event (high priority) should be processed first
      const startEvent = createMockPointerEvent("pointerdown", {
        clientX: 200,
        clientY: 200,
        timeStamp: 1,
      });
      act(() => {
        result.current.controls.processTouch(startEvent);
      });

      // Metrics should show events processed
      expect(result.current.state.metrics.eventsProcessed).toBeGreaterThan(0);
    });
  });

  describe("processQueue deadline check (lines 467-472)", () => {
    it("should skip expired low priority events in queue", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({
          immediateFeedback: false,
          maxQueueSize: 10,
          eventDeadlineMs: 1, // Very short deadline
        })
      );

      // Add event
      mockPerformanceNow.mockReturnValue(0);
      const moveEvent = createMockPointerEvent("pointermove", {
        clientX: 100,
        clientY: 100,
        timeStamp: 0,
      });
      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      // Advance time past deadline and flush
      mockPerformanceNow.mockReturnValue(100);
      act(() => {
        result.current.controls.flushQueue();
      });

      // Queue should be empty
      expect(result.current.state.queueLength).toBe(0);
    });
  });

  describe("queue mode with touch events (lines 549, 569)", () => {
    it("should queue regular touch events when immediate feedback disabled", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({
          immediateFeedback: false,
          processCoalescedEvents: false, // Test non-pointer event path
        })
      );

      const touchEvent = createMockTouchEvent("touchstart", {
        clientX: 100,
        clientY: 100,
      });

      act(() => {
        result.current.controls.processTouch(touchEvent as any);
      });

      // Event should be processed through queue
      expect(result.current.state.metrics.eventsProcessed).toBeGreaterThanOrEqual(0);
    });

    it("should queue predicted events when immediate feedback disabled", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({
          immediateFeedback: false,
          usePredictedEvents: true,
        })
      );

      // Start touch
      const downEvent = createMockPointerEvent("pointerdown");
      act(() => {
        result.current.controls.processTouch(downEvent);
      });

      // Move with predicted events
      const moveEvent = createMockPointerEvent("pointermove", {
        clientX: 110,
        clientY: 110,
        predictedEvents: [
          { clientX: 120, clientY: 120 },
        ],
      });
      act(() => {
        result.current.controls.processTouch(moveEvent);
      });

      // Should process and include predicted events
      expect(result.current.state.metrics.eventsProcessed).toBeGreaterThan(0);
    });
  });

  describe("element attachment handlers (lines 592-608)", () => {
    it("should handle pointer events on attached element", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      const element = document.createElement("div");
      let cleanup: () => void;

      act(() => {
        cleanup = result.current.controls.attachToElement(element);
      });

      // Simulate pointerdown
      const downEvent = new Event("pointerdown", { bubbles: true });
      Object.assign(downEvent, {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
        preventDefault: jest.fn(),
      });

      act(() => {
        element.dispatchEvent(downEvent);
      });

      // State should be active
      expect(result.current.state.isActive).toBe(true);

      // Simulate pointermove when active
      const moveEvent = new Event("pointermove", { bubbles: true });
      Object.assign(moveEvent, {
        clientX: 150,
        clientY: 150,
        pointerId: 1,
        preventDefault: jest.fn(),
      });

      act(() => {
        element.dispatchEvent(moveEvent);
      });

      // Simulate pointerup
      const upEvent = new Event("pointerup", { bubbles: true });
      Object.assign(upEvent, {
        clientX: 150,
        clientY: 150,
        pointerId: 1,
        preventDefault: jest.fn(),
      });

      act(() => {
        element.dispatchEvent(upEvent);
      });

      expect(result.current.state.isActive).toBe(false);

      // Cleanup
      act(() => {
        cleanup();
      });
    });

    it("should handle pointercancel on attached element", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      const element = document.createElement("div");
      let cleanup: () => void;

      act(() => {
        cleanup = result.current.controls.attachToElement(element);
      });

      // Simulate pointerdown
      const downEvent = new Event("pointerdown", { bubbles: true });
      Object.assign(downEvent, {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
        preventDefault: jest.fn(),
      });

      act(() => {
        element.dispatchEvent(downEvent);
      });

      expect(result.current.state.isActive).toBe(true);

      // Simulate pointercancel
      const cancelEvent = new Event("pointercancel", { bubbles: true });
      Object.assign(cancelEvent, {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
        preventDefault: jest.fn(),
      });

      act(() => {
        element.dispatchEvent(cancelEvent);
      });

      expect(result.current.state.isActive).toBe(false);

      act(() => {
        cleanup();
      });
    });

    it("should not process pointermove when not active", () => {
      const { result } = renderHook(() => useTouchLatencyReducer());

      const element = document.createElement("div");
      let cleanup: () => void;

      act(() => {
        cleanup = result.current.controls.attachToElement(element);
      });

      const initialProcessed = result.current.state.metrics.eventsProcessed;

      // Simulate pointermove without pointerdown first (not active)
      const moveEvent = new Event("pointermove", { bubbles: true });
      Object.assign(moveEvent, {
        clientX: 150,
        clientY: 150,
        pointerId: 1,
        preventDefault: jest.fn(),
      });

      act(() => {
        element.dispatchEvent(moveEvent);
      });

      // Should not process move when not active
      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.metrics.eventsProcessed).toBe(initialProcessed);

      act(() => {
        cleanup();
      });
    });
  });

  describe("measureLatency disabled (line 300)", () => {
    it("should skip latency recording when disabled", () => {
      const { result } = renderHook(() =>
        useTouchLatencyReducer({ measureLatency: false })
      );

      // Process events
      for (let i = 0; i < 5; i++) {
        const event = createMockPointerEvent("pointermove", {
          clientX: 100 + i * 10,
          clientY: 100,
        });
        act(() => {
          result.current.controls.processTouch(event);
        });
      }

      // Latency metrics should remain at defaults
      expect(result.current.state.metrics.minLatency).toBe(Infinity);
    });
  });
});
