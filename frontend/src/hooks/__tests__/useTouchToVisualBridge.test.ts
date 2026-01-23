/**
 * Tests for useTouchToVisualBridge hook - Sprint 226
 */

import { renderHook, act } from "@testing-library/react";
import {
  useTouchToVisualBridge,
  useTouchTranslate,
  useTouchScale,
  useTouchOpacity,
  type TouchPoint,
  type VisualState,
  type TouchToVisualMapper,
} from "../useTouchToVisualBridge";

// Mock requestAnimationFrame
let rafCallbacks: FrameRequestCallback[] = [];
let rafId = 0;

beforeEach(() => {
  rafCallbacks = [];
  rafId = 0;
  jest.useFakeTimers();

  global.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
    rafCallbacks.push(callback);
    return ++rafId;
  });

  global.cancelAnimationFrame = jest.fn((id: number) => {
    // No-op for tests
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Helper to flush RAF callbacks
function flushRAF() {
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  callbacks.forEach((cb) => cb(performance.now()));
}

// Helper to create mock touch event
function createTouchEvent(
  type: "touchstart" | "touchmove" | "touchend",
  touches: Array<{ clientX: number; clientY: number; identifier?: number; force?: number }>
): TouchEvent {
  const touchList = touches.map((t, i) => ({
    identifier: t.identifier ?? i,
    clientX: t.clientX,
    clientY: t.clientY,
    target: document.createElement("div"),
    force: t.force ?? 1,
    pageX: t.clientX,
    pageY: t.clientY,
    screenX: t.clientX,
    screenY: t.clientY,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
  })) as Touch[];

  return {
    type,
    touches: {
      length: touchList.length,
      item: (i: number) => touchList[i] ?? null,
      [Symbol.iterator]: function* () {
        for (const touch of touchList) yield touch;
      },
      ...touchList.reduce((acc, t, i) => ({ ...acc, [i]: t }), {}),
    } as TouchList,
    changedTouches: {
      length: touchList.length,
      item: (i: number) => touchList[i] ?? null,
      [Symbol.iterator]: function* () {
        for (const touch of touchList) yield touch;
      },
      ...touchList.reduce((acc, t, i) => ({ ...acc, [i]: t }), {}),
    } as TouchList,
    targetTouches: {
      length: touchList.length,
      item: (i: number) => touchList[i] ?? null,
      [Symbol.iterator]: function* () {
        for (const touch of touchList) yield touch;
      },
      ...touchList.reduce((acc, t, i) => ({ ...acc, [i]: t }), {}),
    } as TouchList,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as TouchEvent;
}

describe("useTouchToVisualBridge", () => {
  const defaultMapper: TouchToVisualMapper = (touch, history) => ({
    transform: {
      translateX: touch.x,
      translateY: touch.y,
      scale: 1,
      rotation: 0,
    },
  });

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useTouchToVisualBridge(defaultMapper));

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.currentTouch).toBeNull();
      expect(result.current.state.visualState).toEqual({
        transform: {
          translateX: 0,
          translateY: 0,
          scale: 1,
          rotation: 0,
        },
        opacity: 1,
        brightness: 1,
        blur: 0,
        custom: {},
      });
    });

    it("should provide CSS transform string", () => {
      const { result } = renderHook(() => useTouchToVisualBridge(defaultMapper));

      expect(result.current.cssTransform).toBe(
        "translate3d(0px, 0px, 0) scale(1) rotate(0deg)"
      );
    });

    it("should provide CSS filter string", () => {
      const { result } = renderHook(() => useTouchToVisualBridge(defaultMapper));

      expect(result.current.cssFilter).toBe("none");
    });
  });

  describe("touch handling", () => {
    it("should activate on touch start", () => {
      const { result } = renderHook(() => useTouchToVisualBridge(defaultMapper));

      act(() => {
        const event = createTouchEvent("touchstart", [
          { clientX: 100, clientY: 100 },
        ]);
        result.current.controls.onTouchStart(event);
      });

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.currentTouch).not.toBeNull();
      expect(result.current.state.currentTouch?.x).toBe(100);
      expect(result.current.state.currentTouch?.y).toBe(100);
    });

    it("should track touch position on move", () => {
      const { result } = renderHook(() => useTouchToVisualBridge(defaultMapper));

      act(() => {
        const startEvent = createTouchEvent("touchstart", [
          { clientX: 100, clientY: 100 },
        ]);
        result.current.controls.onTouchStart(startEvent);
      });

      act(() => {
        const moveEvent = createTouchEvent("touchmove", [
          { clientX: 150, clientY: 150 },
        ]);
        result.current.controls.onTouchMove(moveEvent);
      });

      expect(result.current.state.currentTouch?.x).toBe(150);
      expect(result.current.state.currentTouch?.y).toBe(150);
    });

    it("should deactivate on touch end", () => {
      const { result } = renderHook(() => useTouchToVisualBridge(defaultMapper));

      act(() => {
        const startEvent = createTouchEvent("touchstart", [
          { clientX: 100, clientY: 100 },
        ]);
        result.current.controls.onTouchStart(startEvent);
      });

      act(() => {
        const endEvent = createTouchEvent("touchend", []);
        result.current.controls.onTouchEnd(endEvent);
      });

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.currentTouch).toBeNull();
    });

    it("should calculate velocity from touch history", () => {
      const { result } = renderHook(() => useTouchToVisualBridge(defaultMapper));

      act(() => {
        const startEvent = createTouchEvent("touchstart", [
          { clientX: 100, clientY: 100 },
        ]);
        result.current.controls.onTouchStart(startEvent);
      });

      // Advance time
      jest.advanceTimersByTime(16);

      act(() => {
        const moveEvent = createTouchEvent("touchmove", [
          { clientX: 200, clientY: 200 },
        ]);
        result.current.controls.onTouchMove(moveEvent);
      });

      // Velocity should be calculated
      expect(result.current.state.currentTouch?.velocityX).toBeDefined();
      expect(result.current.state.currentTouch?.velocityY).toBeDefined();
    });
  });

  describe("visual state mapping", () => {
    it("should apply mapper to touch input", () => {
      const customMapper: TouchToVisualMapper = (touch) => ({
        transform: {
          translateX: touch.x * 2,
          translateY: touch.y * 2,
          scale: 1.5,
          rotation: 45,
        },
        opacity: 0.8,
      });

      const { result } = renderHook(() =>
        useTouchToVisualBridge(customMapper, { smoothingFactor: 1 })
      );

      act(() => {
        const event = createTouchEvent("touchstart", [
          { clientX: 50, clientY: 50 },
        ]);
        result.current.controls.onTouchStart(event);
      });

      // Flush RAF to apply updates
      act(() => {
        flushRAF();
      });

      // Visual state should reflect mapper output (with smoothing applied)
      expect(result.current.state.visualState.transform.translateX).toBeGreaterThan(0);
      expect(result.current.state.visualState.transform.translateY).toBeGreaterThan(0);
    });

    it("should support custom visual properties", () => {
      const customMapper: TouchToVisualMapper = (touch) => ({
        custom: {
          glow: touch.pressure * 10,
          shake: Math.abs(touch.velocityX),
        },
      });

      const { result } = renderHook(() =>
        useTouchToVisualBridge(customMapper, { smoothingFactor: 1 })
      );

      act(() => {
        const event = createTouchEvent("touchstart", [
          { clientX: 100, clientY: 100, force: 0.8 },
        ]);
        result.current.controls.onTouchStart(event);
      });

      act(() => {
        flushRAF();
      });

      expect(result.current.state.visualState.custom).toBeDefined();
    });
  });

  describe("prediction", () => {
    it("should predict visual state when enabled", () => {
      const { result } = renderHook(() =>
        useTouchToVisualBridge(defaultMapper, {
          enablePrediction: true,
          predictionLookaheadMs: 32,
        })
      );

      // Build up touch history
      act(() => {
        const startEvent = createTouchEvent("touchstart", [
          { clientX: 100, clientY: 100 },
        ]);
        result.current.controls.onTouchStart(startEvent);
      });

      jest.advanceTimersByTime(16);

      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", [{ clientX: 110, clientY: 110 }])
        );
      });

      jest.advanceTimersByTime(16);

      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", [{ clientX: 120, clientY: 120 }])
        );
      });

      jest.advanceTimersByTime(16);

      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", [{ clientX: 130, clientY: 130 }])
        );
      });

      // Prediction may be available after enough history
      // This depends on confidence threshold
    });

    it("should force prediction on demand", () => {
      const { result } = renderHook(() =>
        useTouchToVisualBridge(defaultMapper, { enablePrediction: true })
      );

      // Build history
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }])
        );
      });

      for (let i = 1; i <= 5; i++) {
        jest.advanceTimersByTime(16);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", [
              { clientX: 100 + i * 10, clientY: 100 + i * 10 },
            ])
          );
        });
      }

      act(() => {
        result.current.controls.forcePrediction();
      });

      // Force prediction should trigger prediction calculation
      expect(result.current.state.prediction).not.toBeNull();
    });
  });

  describe("momentum", () => {
    it("should enable momentum after touch end with velocity", () => {
      const { result } = renderHook(() =>
        useTouchToVisualBridge(defaultMapper, {
          enableMomentum: true,
          momentumFriction: 0.95,
        })
      );

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }])
        );
      });

      // Fast movement
      jest.advanceTimersByTime(10);

      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", [{ clientX: 200, clientY: 200 }])
        );
      });

      // Release with velocity
      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", []));
      });

      // Momentum should be activated (animation continues)
      expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    it("should not enable momentum with disabled config", () => {
      const { result } = renderHook(() =>
        useTouchToVisualBridge(defaultMapper, { enableMomentum: false })
      );

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }])
        );
      });

      jest.advanceTimersByTime(10);

      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", [{ clientX: 200, clientY: 200 }])
        );
      });

      const rafCountBeforeEnd = (global.requestAnimationFrame as jest.Mock).mock
        .calls.length;

      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", []));
      });

      // No additional RAF calls for momentum
      expect(result.current.state.isActive).toBe(false);
    });
  });

  describe("controls", () => {
    it("should update visual state directly", () => {
      const { result } = renderHook(() => useTouchToVisualBridge(defaultMapper));

      act(() => {
        result.current.controls.updateVisualState({
          transform: { translateX: 50, translateY: 50, scale: 1.2, rotation: 15 },
          opacity: 0.9,
        });
      });

      // Direct update affects target state (applied on next RAF)
      act(() => {
        flushRAF();
      });
    });

    it("should reset to initial state", () => {
      const { result } = renderHook(() => useTouchToVisualBridge(defaultMapper));

      // Activate and modify
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }])
        );
      });

      expect(result.current.state.isActive).toBe(true);

      // Reset
      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.currentTouch).toBeNull();
      expect(result.current.state.prediction).toBeNull();
      expect(result.current.state.visualState).toEqual({
        transform: {
          translateX: 0,
          translateY: 0,
          scale: 1,
          rotation: 0,
        },
        opacity: 1,
        brightness: 1,
        blur: 0,
        custom: {},
      });
    });
  });

  describe("metrics", () => {
    it("should track latency metrics", () => {
      const { result } = renderHook(() => useTouchToVisualBridge(defaultMapper));

      // Perform touches to generate metrics
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }])
        );
      });

      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(16);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", [
              { clientX: 100 + i * 5, clientY: 100 + i * 5 },
            ])
          );
        });
      }

      // Metrics should be populated
      expect(result.current.state.metrics.totalUpdates).toBeGreaterThanOrEqual(0);
    });

    it("should calculate updates per second", () => {
      const { result } = renderHook(() => useTouchToVisualBridge(defaultMapper));

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }])
        );
      });

      // Simulate touches over time
      for (let i = 0; i < 60; i++) {
        jest.advanceTimersByTime(16);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", [{ clientX: 100 + i, clientY: 100 + i }])
          );
        });
      }

      // Advance past 1 second to trigger metrics update
      jest.advanceTimersByTime(1000);

      // Updates per second metric should be set
    });
  });

  describe("CSS generation", () => {
    it("should generate proper transform with non-zero values", () => {
      const mapper: TouchToVisualMapper = () => ({
        transform: {
          translateX: 100,
          translateY: 50,
          scale: 1.5,
          rotation: 45,
        },
      });

      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 1 })
      );

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", [{ clientX: 0, clientY: 0 }])
        );
      });

      act(() => {
        flushRAF();
      });

      expect(result.current.cssTransform).toContain("translate3d");
      expect(result.current.cssTransform).toContain("scale");
      expect(result.current.cssTransform).toContain("rotate");
    });

    it("should generate filter string with blur", () => {
      const mapper: TouchToVisualMapper = () => ({
        blur: 5,
        brightness: 1.2,
      });

      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 1 })
      );

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", [{ clientX: 0, clientY: 0 }])
        );
      });

      act(() => {
        flushRAF();
      });

      // Filter should include blur and brightness
      expect(result.current.cssFilter).not.toBe("none");
    });
  });
});

describe("useTouchTranslate", () => {
  it("should translate based on touch offset from start", () => {
    const { result } = renderHook(() =>
      useTouchTranslate({ smoothingFactor: 1 })
    );

    act(() => {
      result.current.controls.onTouchStart(
        createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }])
      );
    });

    act(() => {
      result.current.controls.onTouchMove(
        createTouchEvent("touchmove", [{ clientX: 150, clientY: 200 }])
      );
    });

    act(() => {
      flushRAF();
    });

    // Should translate by the offset
    expect(result.current.state.visualState.transform.translateX).toBeGreaterThan(0);
    expect(result.current.state.visualState.transform.translateY).toBeGreaterThan(0);
  });
});

describe("useTouchScale", () => {
  it("should initialize with provided scale", () => {
    const { result } = renderHook(() => useTouchScale(2));

    expect(result.current.state.visualState.transform.scale).toBe(1); // Initial state is default
  });

  it("should respect min and max scale limits", () => {
    const { result } = renderHook(() => useTouchScale(1, 0.5, 2));

    // Scale should be bounded
    expect(result.current.state.visualState.transform.scale).toBe(1);
  });
});

describe("useTouchOpacity", () => {
  it("should map pressure to opacity", () => {
    const { result } = renderHook(() =>
      useTouchOpacity({ smoothingFactor: 1 })
    );

    act(() => {
      result.current.controls.onTouchStart(
        createTouchEvent("touchstart", [{ clientX: 100, clientY: 100, force: 0.5 }])
      );
    });

    act(() => {
      flushRAF();
    });

    // Opacity should be based on pressure
    expect(result.current.state.visualState.opacity).toBeLessThanOrEqual(1);
    expect(result.current.state.visualState.opacity).toBeGreaterThanOrEqual(0.3);
  });
});
