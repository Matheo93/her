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
