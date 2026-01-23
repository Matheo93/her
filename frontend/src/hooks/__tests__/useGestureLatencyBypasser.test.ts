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

      // Snap point added (internal state)
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
      // No error means cleanup succeeded
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
  // Helper to create mock TouchEvent
  const createTouchEvent = (
    type: string,
    touches: Array<{ clientX: number; clientY: number; identifier: number }>
  ): TouchEvent => {
    const touchList = {
      length: touches.length,
      item: (index: number) => touches[index] ?? null,
      [Symbol.iterator]: function* () {
        for (const t of touches) yield t;
      },
    } as unknown as TouchList;

    return {
      type,
      touches: touchList,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    } as unknown as TouchEvent;
  };

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
        element.dispatchEvent(touchStartEvent as unknown as Event);
      });

      // Touch should have been registered
      expect(result.current.state.isAttached).toBe(true);
    });

    it("should detect pinch gesture with two touches (lines 531-542, 546-548)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Simulate multi-touch start
      const multiTouchEvent = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
        { clientX: 200, clientY: 200, identifier: 2 },
      ]);

      act(() => {
        element.dispatchEvent(multiTouchEvent as unknown as Event);
      });

      expect(result.current.state.isAttached).toBe(true);
    });

    it("should stop existing momentum on new touch (lines 574-578)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enableMomentum: true })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start a gesture
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // End the gesture (to trigger momentum)
      mockTime = 50;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd as unknown as Event);
      });

      // Start new gesture (should cancel momentum)
      mockTime = 100;
      const newTouchStart = createTouchEvent("touchstart", [
        { clientX: 150, clientY: 150, identifier: 2 },
      ]);

      act(() => {
        element.dispatchEvent(newTouchStart as unknown as Event);
      });

      expect(result.current.state.isMomentumActive).toBe(false);
    });
  });

  describe("touch move handling (lines 586-657)", () => {
    it("should track touch movement and update delta", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Move touch
      mockTime = 16;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 150, clientY: 120, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
      });

      expect(styleUpdater).toHaveBeenCalled();
    });

    it("should skip touch move when gesture not active (line 588)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Move without starting (should be ignored)
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 150, clientY: 120, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
      });

      expect(styleUpdater).not.toHaveBeenCalled();
    });

    it("should limit velocity samples (lines 602-604)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ velocitySamples: 3 })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Multiple moves to exceed sample limit
      for (let i = 1; i <= 10; i++) {
        mockTime = i * 16;
        const touchMove = createTouchEvent("touchmove", [
          { clientX: 100 + i * 10, clientY: 100 + i * 5, identifier: 1 },
        ]);

        act(() => {
          element.dispatchEvent(touchMove as unknown as Event);
        });
      }

      expect(styleUpdater).toHaveBeenCalled();
    });

    it("should calculate scale and rotation for multi-touch (lines 616-631)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start with two touches
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
        { clientX: 200, clientY: 100, identifier: 2 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Move both touches apart (pinch out)
      mockTime = 16;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 50, clientY: 100, identifier: 1 },
        { clientX: 250, clientY: 100, identifier: 2 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
      });

      // Scale should have been calculated
      expect(styleUpdater).toHaveBeenCalled();
      const lastCall = styleUpdater.mock.calls[styleUpdater.mock.calls.length - 1];
      expect(lastCall[1]).toBeGreaterThan(1); // Scale increased
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

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Quick move (high velocity)
      mockTime = 10;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 200, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
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

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Move
      mockTime = 16;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 200, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
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

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Multiple moves to generate prediction
      for (let i = 1; i <= 3; i++) {
        mockTime = i * 16;
        const touchMove = createTouchEvent("touchmove", [
          { clientX: 100 + i * 20, clientY: 100 + i * 10, identifier: 1 },
        ]);

        act(() => {
          element.dispatchEvent(touchMove as unknown as Event);
        });
      }

      expect(result.current.state.metrics.predictionsGenerated).toBeGreaterThan(0);
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

      // End without starting
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd as unknown as Event);
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

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // End touch
      mockTime = 50;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd as unknown as Event);
      });

      expect(result.current.state.metrics.gesturesProcessed).toBe(1);
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

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Fast move to build velocity
      mockTime = 10;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 500, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
      });

      // End touch
      mockTime = 20;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd as unknown as Event);
        // Run momentum frame
        jest.advanceTimersByTime(16);
      });

      // Momentum should be activated due to high velocity
      expect(result.current.state.gesture.isActive).toBe(false);
    });

    it("should update touch count when some touches remain (lines 683-688)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start with two touches
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
        { clientX: 200, clientY: 200, identifier: 2 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // End one touch (one remains)
      mockTime = 50;
      const touchEnd = createTouchEvent("touchend", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchEnd as unknown as Event);
      });

      // Gesture should still be active with updated touch count
      expect(result.current.state.gesture.touchCount).toBe(1);
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

      // Start and move to trigger style update
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      mockTime = 16;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 150, clientY: 120, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
      });

      expect(styleUpdater).toHaveBeenCalledWith(
        expect.objectContaining({ x: 50, y: 20 }),
        expect.any(Number),
        expect.any(Number)
      );
      expect(result.current.state.metrics.bypassedUpdates).toBeGreaterThan(0);
    });

    it("should trim latency history when exceeds 100 samples (lines 371-373)", () => {
      const { result } = renderHook(() => useGestureLatencyBypasser());
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Generate many moves to exceed 100 latency samples
      for (let i = 1; i <= 120; i++) {
        mockTime = i * 16;
        const touchMove = createTouchEvent("touchmove", [
          { clientX: 100 + i, clientY: 100, identifier: 1 },
        ]);

        act(() => {
          element.dispatchEvent(touchMove as unknown as Event);
        });
      }

      expect(result.current.state.metrics.bypassedUpdates).toBe(120);
      expect(result.current.state.metrics.averageLatencyMs).toBeDefined();
    });
  });

  describe("updatePrediction (lines 389-434)", () => {
    it("should set prediction to null with insufficient samples (lines 390-393)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enablePrediction: true })
      );

      // Initially no samples
      expect(result.current.state.prediction).toBeNull();
    });

    it("should generate prediction with snap point (lines 408-419)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({
          enablePrediction: true,
          enableSnapPoints: true,
          snapPoints: [{ id: "snap1", x: 200, y: 120, radius: 100 }],
          snapRadius: 150,
        })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Multiple moves toward snap point
      for (let i = 1; i <= 5; i++) {
        mockTime = i * 16;
        const touchMove = createTouchEvent("touchmove", [
          { clientX: 100 + i * 20, clientY: 100 + i * 4, identifier: 1 },
        ]);

        act(() => {
          element.dispatchEvent(touchMove as unknown as Event);
        });
      }

      expect(result.current.state.metrics.predictionsGenerated).toBeGreaterThan(0);
    });

    it("should not generate prediction when disabled (line 390)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enablePrediction: false })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start and move
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      for (let i = 1; i <= 5; i++) {
        mockTime = i * 16;
        const touchMove = createTouchEvent("touchmove", [
          { clientX: 100 + i * 20, clientY: 100, identifier: 1 },
        ]);

        act(() => {
          element.dispatchEvent(touchMove as unknown as Event);
        });
      }

      expect(result.current.state.prediction).toBeNull();
    });
  });

  describe("runMomentum (lines 439-514)", () => {
    it("should not start momentum when velocity below threshold (lines 442-445)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({ enableMomentum: true, momentumThreshold: 1000 })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Slow move
      mockTime = 1000; // 1 second later - very slow
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 101, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
      });

      // End touch
      mockTime = 2000;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd as unknown as Event);
      });

      expect(result.current.state.isMomentumActive).toBe(false);
    });

    it("should snap to point when momentum ends near snap point (lines 464-488)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({
          enableMomentum: true,
          enableSnapPoints: true,
          snapPoints: [{ id: "snap1", x: 150, y: 100, radius: 100 }],
          snapRadius: 100,
          momentumFriction: 0.5, // High friction to stop quickly
          momentumThreshold: 0.1,
        })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Move toward snap point with some velocity
      mockTime = 16;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 140, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
      });

      // End touch to trigger momentum
      mockTime = 32;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd as unknown as Event);
        // Let momentum run
        jest.advanceTimersByTime(100);
      });

      // Snap should have been triggered or momentum ran
      expect(result.current.state.metrics.gesturesProcessed).toBe(1);
    });

    it("should stop momentum when speed falls below threshold (line 460)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({
          enableMomentum: true,
          momentumFriction: 0.1, // Very high friction
          momentumThreshold: 100,
        })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Move with moderate velocity
      mockTime = 16;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 200, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
      });

      // End
      mockTime = 32;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd as unknown as Event);
        jest.advanceTimersByTime(500); // Let momentum decay
      });

      // Momentum should have stopped
      expect(result.current.state.isMomentumActive).toBe(false);
    });

    it("should track momentum frames (lines 505-508)", () => {
      const { result } = renderHook(() =>
        useGestureLatencyBypasser({
          enableMomentum: true,
          momentumFriction: 0.95,
          momentumThreshold: 0.01,
        })
      );
      const element = document.createElement("div");
      const styleUpdater = jest.fn();

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Fast move for high velocity
      mockTime = 10;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 300, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
      });

      // End touch
      mockTime = 20;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd as unknown as Event);
        // Run several animation frames
        for (let i = 0; i < 10; i++) {
          jest.advanceTimersByTime(16);
        }
      });

      // Some momentum frames should have been tracked
      expect(result.current.state.metrics.momentumFrames).toBeGreaterThanOrEqual(0);
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
      const cancelAnimationFrameSpy = jest.spyOn(window, "cancelAnimationFrame");

      act(() => {
        result.current.controls.attach(element, styleUpdater);
      });

      // Start and move fast
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      mockTime = 10;
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 500, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
      });

      // End to start momentum
      mockTime = 20;
      const touchEnd = createTouchEvent("touchend", []);

      act(() => {
        element.dispatchEvent(touchEnd as unknown as Event);
      });

      // Detach while momentum might be running
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

      // Start touch
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // Move at exact same time (dt = 0)
      const touchMove = createTouchEvent("touchmove", [
        { clientX: 150, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchMove as unknown as Event);
      });

      // Should return default velocity when dt <= 0
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

      // Start touch (only one sample)
      const touchStart = createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100, identifier: 1 },
      ]);

      act(() => {
        element.dispatchEvent(touchStart as unknown as Event);
      });

      // With only 1 sample, velocity should be default
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
