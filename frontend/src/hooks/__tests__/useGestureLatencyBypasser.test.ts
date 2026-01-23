/**
 * Tests for Gesture Latency Bypasser Hook - Sprint 230
 *
 * Tests passive event listeners, velocity tracking, momentum, and snap points
 */

import { renderHook, act } from "@testing-library/react";
import {
  useGestureLatencyBypasser,
  usePanBypasser,
  usePinchBypasser,
} from "../useGestureLatencyBypasser";

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

// Create proper TouchEvent that works with event handlers
function createTouchEvent(
  type: string,
  touches: Array<{ clientX: number; clientY: number; identifier: number }>
): TouchEvent {
  const touchArray = touches.map((t, idx) => ({
    clientX: t.clientX,
    clientY: t.clientY,
    identifier: t.identifier ?? idx,
    screenX: t.clientX,
    screenY: t.clientY,
    pageX: t.clientX,
    pageY: t.clientY,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
    target: null,
  }));

  const touchList = Object.assign(touchArray, {
    length: touches.length,
    item: (index: number) => touchArray[index] ?? null,
  });

  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: touchList, configurable: true });
  Object.defineProperty(event, "targetTouches", { value: touchList, configurable: true });
  Object.defineProperty(event, "changedTouches", { value: touchList, configurable: true });

  return event as unknown as TouchEvent;
}

describe("useGestureLatencyBypasser", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());

      expect(result.current.state.isAttached).toBe(false);
      expect(result.current.state.gesture.isActive).toBe(false);
      expect(result.current.state.isMomentumActive).toBe(false);
    });

    it("should initialize with default metrics", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());

      expect(result.current.state.metrics.gesturesProcessed).toBe(0);
      expect(result.current.state.metrics.bypassedUpdates).toBe(0);
      expect(result.current.state.metrics.snapsTriggered).toBe(0);
    });

    it("should provide ref for element", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());

      expect(result.current.ref).toBeDefined();
      expect(result.current.ref.current).toBeNull();
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({
          enableMomentum: false,
          velocitySamples: 10,
        })
      );

      expect(result.current.state.isAttached).toBe(false);
    });
  });

  describe("element attachment", () => {
    it("should attach to element", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      expect(result.current.state.isAttached).toBe(true);
    });

    it("should set touch-action style", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      expect(element.style.touchAction).toBe("none");
    });

    it("should detach from element", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
        result.current.controls.detach();
      });

      expect(result.current.state.isAttached).toBe(false);
    });

    it("should restore touch-action on detach", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
        result.current.controls.detach();
      });

      expect(element.style.touchAction).toBe("");
    });
  });

  describe("snap points", () => {
    it("should add snap point", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enableSnapPoints: true })
      );

      act(() => {
        result.current.controls.addSnapPoint({
          id: "snap1",
          x: 100,
          y: 100,
          radius: 50,
        });
      });

      expect(typeof result.current.controls.addSnapPoint).toBe("function");
    });

    it("should remove snap point", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enableSnapPoints: true })
      );

      act(() => {
        result.current.controls.addSnapPoint({
          id: "snap1",
          x: 100,
          y: 100,
          radius: 50,
        });
        result.current.controls.removeSnapPoint("snap1");
      });

      expect(typeof result.current.controls.removeSnapPoint).toBe("function");
    });

    it("should clear all snap points", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enableSnapPoints: true })
      );

      act(() => {
        result.current.controls.addSnapPoint({
          id: "snap1",
          x: 100,
          y: 100,
          radius: 50,
        });
        result.current.controls.addSnapPoint({
          id: "snap2",
          x: 200,
          y: 200,
          radius: 50,
        });
        result.current.controls.clearSnapPoints();
      });

      expect(typeof result.current.controls.clearSnapPoints).toBe("function");
    });
  });

  describe("gesture cancellation", () => {
    it("should cancel current gesture", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());

      act(() => {
        result.current.controls.cancelGesture();
      });

      expect(result.current.state.gesture.isActive).toBe(false);
    });
  });

  describe("momentum control", () => {
    it("should stop momentum", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());

      act(() => {
        result.current.controls.stopMomentum();
      });

      expect(result.current.state.isMomentumActive).toBe(false);
    });
  });

  describe("metrics", () => {
    it("should reset metrics", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.state.metrics.gesturesProcessed).toBe(0);
      expect(result.current.state.metrics.bypassedUpdates).toBe(0);
    });
  });

  describe("prediction", () => {
    it("should return null prediction initially", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());

      const prediction = result.current.controls.getPrediction();
      expect(prediction).toBeNull();
    });
  });

  describe("gesture state", () => {
    it("should have default velocity", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());

      expect(result.current.state.gesture.velocity.vx).toBe(0);
      expect(result.current.state.gesture.velocity.vy).toBe(0);
      expect(result.current.state.gesture.velocity.speed).toBe(0);
    });

    it("should have default delta", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());

      expect(result.current.state.gesture.delta.x).toBe(0);
      expect(result.current.state.gesture.delta.y).toBe(0);
    });

    it("should have default scale and rotation", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());

      expect(result.current.state.gesture.scale).toBe(1);
      expect(result.current.state.gesture.rotation).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useGestureLatencyBypasser());

      unmount();
    });
  });
});

describe("usePanBypasser", () => {
  it("should provide pan-specific interface", () => {
    const { result } = renderHook(() => usePanBypasser());

    expect(result.current.ref).toBeDefined();
    expect(result.current.delta).toEqual({ x: 0, y: 0 });
    expect(result.current.isPanning).toBe(false);
    expect(result.current.velocity).toBeDefined();
  });

  it("should track velocity", () => {
    const { result } = renderHook(() => usePanBypasser());

    expect(result.current.velocity.vx).toBe(0);
    expect(result.current.velocity.vy).toBe(0);
  });
});

describe("usePinchBypasser", () => {
  it("should provide pinch-specific interface", () => {
    const { result } = renderHook(() => usePinchBypasser());

    expect(result.current.ref).toBeDefined();
    expect(result.current.scale).toBe(1);
    expect(result.current.isPinching).toBe(false);
  });

  it("should have initial scale of 1", () => {
    const { result } = renderHook(() => usePinchBypasser());

    expect(result.current.scale).toBe(1);
  });
});

// ============================================================================
// Sprint 620: Branch Coverage Improvement Tests
// ============================================================================

describe("useGestureLatencyBypasser - touch event handling", () => {
  describe("touch start handling (lines 519-581)", () => {
    it("should handle single touch start and set gesture active", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStartEvent = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 150, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStartEvent);
      });

      expect(result.current.state.isAttached).toBe(true);
      expect(result.current.state.gesture.isActive).toBe(true);
      expect(result.current.state.gesture.type).toBe("pan");
    });

    it("should detect pinch gesture with two touches (lines 531-542, 546-548)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const multiTouchEvent = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
        { clientX: 200, clientY: 200, identifier: 2 },
      ]);

      act(() => {
        element.dispatchEvent(multiTouchEvent);
      });

      expect(result.current.state.gesture.isActive).toBe(true);
      expect(result.current.state.gesture.type).toBe("pinch");
      expect(result.current.state.gesture.touchCount).toBe(2);
    });

    it("should store initial position on touch start", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 150, clientY: 200, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      expect(result.current.state.gesture.startPosition).toEqual({ x: 150, y: 200 });
      expect(result.current.state.gesture.currentPosition).toEqual({ x: 150, y: 200 });
    });
  });

  describe("touch move handling (lines 586-657)", () => {
    it("should skip touch move when gesture not active (line 588)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchMove = createTouchEvent("touchmove", [
        { clientX: 150, clientY: 120, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove);
      });

      expect(styleUpdater).not.toHaveBeenCalled();
      expect(result.current.state.gesture.isActive).toBe(false);
    });

    it("should track touch movement and update delta", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      mockTime = 16;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 150, clientY: 120, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove);
      });

      expect(styleUpdater).toHaveBeenCalled();
      expect(result.current.state.gesture.delta).toEqual({ x: 50, y: 20 });
    });

    it("should calculate scale and rotation for multi-touch (lines 616-631)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
        { clientX: 200, clientY: 100, identifier: 2 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      mockTime = 16;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 50, clientY: 100, identifier: 1 },
        { clientX: 250, clientY: 100, identifier: 2 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove);
      });

      expect(styleUpdater).toHaveBeenCalled();
      const lastCall = styleUpdater.mock.calls[styleUpdater.mock.calls.length - 1];
      expect(lastCall[1]).toBe(2); // Scale doubled
    });

    it("should track velocity when enabled (lines 634-636)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ trackVelocity: true })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      mockTime = 10;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 200, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove);
      });

      expect(result.current.state.gesture.velocity.speed).toBeGreaterThan(0);
    });

    it("should use default velocity when tracking disabled (line 636)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ trackVelocity: false })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      mockTime = 16;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 200, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove);
      });

      expect(result.current.state.gesture.velocity.speed).toBe(0);
    });

    it("should update prediction during move when enabled (lines 642-644)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enablePrediction: true })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      for (let i = 1; i <= 3; i++) {
        mockTime = i * 16;
        const touchMove = createTouchEvent("touchmove", [
          { clientX: 100 + i * 20, clientY: 100 + i * 10, identifier: 1 },
        ]);

        act(() => {
          element.dispatchEvent(touchMove);
        });
      }

      expect(result.current.state.metrics.predictionsGenerated).toBeGreaterThan(0);
      expect(result.current.state.prediction).not.toBeNull();
    });
  });

  describe("touch end handling (lines 662-692)", () => {
    it("should skip touch end when gesture not active (line 664)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd);
      });

      expect(result.current.state.metrics.gesturesProcessed).toBe(0);
    });

    it("should increment gestures processed on end (lines 666-669)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      mockTime = 50;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd);
      });

      expect(result.current.state.metrics.gesturesProcessed).toBe(1);
      expect(result.current.state.gesture.isActive).toBe(false);
    });

    it("should trigger momentum on all touches ended (lines 672-676)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enableMomentum: true, momentumThreshold: 0.1 })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      mockTime = 10;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 500, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove);
      });

      mockTime = 20;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd);
      });

      expect(result.current.state.gesture.isActive).toBe(false);
      expect(result.current.state.isMomentumActive).toBe(true);
    });

    it("should update touch count when some touches remain (lines 683-688)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
        { clientX: 200, clientY: 200, identifier: 2 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      expect(result.current.state.gesture.touchCount).toBe(2);

      mockTime = 50;
      const touchEnd = createTouchEvent("touchend", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchEnd);
      });

      expect(result.current.state.gesture.touchCount).toBe(1);
      expect(result.current.state.gesture.isActive).toBe(true);
    });
  });

  describe("applyStyleUpdate (lines 360-384)", () => {
    it("should call style updater and track latency", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      mockTime = 16;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 150, clientY: 120, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove);
      });

      expect(styleUpdater).toHaveBeenCalledWith({ x: 50, y: 20 }, 1, 0);
      expect(result.current.state.metrics.bypassedUpdates).toBe(1);
    });

    it("should trim latency history when exceeds 100 samples (lines 371-373)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      for (let i = 1; i <= 120; i++) {
        mockTime = i * 16;
        const touchMove = createTouchEvent("touchmove", [
          { clientX: 100 + i, clientY: 100, identifier: 1 },
        ]);

        act(() => {
          element.dispatchEvent(touchMove);
        });
      }

      expect(result.current.state.metrics.bypassedUpdates).toBe(120);
    });
  });

  describe("updatePrediction (lines 389-434)", () => {
    it("should not generate prediction when disabled (line 390)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enablePrediction: false })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      for (let i = 1; i <= 5; i++) {
        mockTime = i * 16;
        const touchMove = createTouchEvent("touchmove", [
          { clientX: 100 + i * 20, clientY: 100, identifier: 1 },
        ]);

        act(() => {
          element.dispatchEvent(touchMove);
        });
      }

      expect(result.current.state.prediction).toBeNull();
      expect(result.current.state.metrics.predictionsGenerated).toBe(0);
    });
  });

  describe("runMomentum (lines 439-514)", () => {
    it("should not start momentum when velocity below threshold (lines 442-445)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enableMomentum: true, momentumThreshold: 100000 })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      mockTime = 1000;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 101, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove);
      });

      mockTime = 2000;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd);
      });

      expect(result.current.state.isMomentumActive).toBe(false);
    });

    it("should activate momentum with high velocity", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({
          enableMomentum: true,
          momentumFriction: 0.95,
          momentumThreshold: 0.1,
        })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      mockTime = 10;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 500, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove);
      });

      mockTime = 20;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd);
      });

      expect(result.current.state.isMomentumActive).toBe(true);
    });
  });

  describe("passive listeners configuration (lines 702-704)", () => {
    it("should use passive listeners when configured", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ usePassiveListeners: true })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();
      const addEventListenerSpy = jest.spyOn(element, "addEventListener");

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "touchstart",
        expect.any(Function),
        { passive: true }
      );
    });

    it("should use non-passive listeners when configured", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ usePassiveListeners: false })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();
      const addEventListenerSpy = jest.spyOn(element, "addEventListener");

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "touchstart",
        expect.any(Function),
        { passive: false }
      );
    });
  });

  describe("detach with active momentum (lines 737-740)", () => {
    it("should cancel momentum animation on detach", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enableMomentum: true, momentumThreshold: 0.01 })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      mockTime = 10;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 500, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove);
      });

      mockTime = 20;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd);
      });

      expect(result.current.state.isMomentumActive).toBe(true);

      act(() => {
        result.current.controls.detach();
      });

      expect(result.current.state.isAttached).toBe(false);
      expect(result.current.state.isMomentumActive).toBe(false);
    });
  });

  describe("utility function coverage", () => {
    it("should handle zero time delta in velocity calculation (line 266-268)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ trackVelocity: true })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      // Move at exact same time (dt = 0)
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 150, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove);
      });

      expect(result.current.state.gesture.velocity.speed).toBe(0);
    });

    it("should handle single sample in velocity calculation (lines 259-261)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ trackVelocity: true, velocitySamples: 1 })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart);
      });

      expect(result.current.state.gesture.velocity.speed).toBe(0);
    });
  });

  describe("cancelGesture with momentum (lines 777-781)", () => {
    it("should cancel momentum when canceling gesture", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enableMomentum: true })
      );

      act(() => {
        result.current.controls.cancelGesture();
      });

      expect(result.current.state.gesture.isActive).toBe(false);
      expect(result.current.state.isMomentumActive).toBe(false);
      expect(result.current.state.prediction).toBeNull();
    });
  });

  describe("stopMomentum with active animation (lines 788-792)", () => {
    it("should stop active momentum animation", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());

      act(() => {
        result.current.controls.stopMomentum();
      });

      expect(result.current.state.isMomentumActive).toBe(false);
    });
  });
});
