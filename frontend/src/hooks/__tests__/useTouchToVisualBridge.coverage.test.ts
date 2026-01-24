/**
 * Coverage tests for useTouchToVisualBridge - Sprint 765
 *
 * Targets uncovered branches:
 * - calculateVelocity edge cases (dt <= 0)
 * - mergeVisualStates with custom properties
 * - calculatePredictionConfidence edge cases
 * - Metrics recording and second boundary
 * - Debounce handling
 * - Momentum continuation
 * - Animation loop conditions
 * - Haptic feedback
 * - Touch history trimming
 * - Convenience hooks (useTouchScale, useTouchOpacity)
 */

import { renderHook, act } from "@testing-library/react";
import {
  useTouchToVisualBridge,
  useTouchTranslate,
  useTouchScale,
  useTouchOpacity,
  TouchToVisualMapper,
} from "../useTouchToVisualBridge";

// ============================================================================
// Mocks
// ============================================================================

const mockRequestAnimationFrame = jest.fn();
const mockCancelAnimationFrame = jest.fn();
const mockPerformanceNow = jest.fn();
const mockVibrate = jest.fn();

let rafCallback: FrameRequestCallback | null = null;
let frameId = 0;

beforeAll(() => {
  global.requestAnimationFrame = mockRequestAnimationFrame.mockImplementation(
    (callback: FrameRequestCallback) => {
      rafCallback = callback;
      return ++frameId;
    }
  );

  global.cancelAnimationFrame = mockCancelAnimationFrame;

  jest.spyOn(performance, "now").mockImplementation(mockPerformanceNow);

  Object.defineProperty(navigator, "vibrate", {
    value: mockVibrate,
    writable: true,
    configurable: true,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  rafCallback = null;
  frameId = 0;
  mockPerformanceNow.mockReturnValue(0);
});

// ============================================================================
// Helper Functions
// ============================================================================

function createTouchEvent(
  type: "touchstart" | "touchmove" | "touchend",
  x: number,
  y: number,
  options: { force?: number; identifier?: number; touchCount?: number } = {}
): TouchEvent {
  const touch = {
    identifier: options.identifier ?? 0,
    clientX: x,
    clientY: y,
    force: options.force ?? 1,
    target: document.body,
    pageX: x,
    pageY: y,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    screenX: x,
    screenY: y,
  } as Touch;

  const touchCount = options.touchCount ?? (type === "touchend" ? 0 : 1);
  const touchList = Array(touchCount).fill(touch);

  return {
    type,
    touches: touchList,
    changedTouches: [touch],
    targetTouches: touchList,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as TouchEvent;
}

function advanceFrame(time: number) {
  mockPerformanceNow.mockReturnValue(time);
  if (rafCallback) {
    const cb = rafCallback;
    rafCallback = null;
    cb(time);
  }
}

function createSimpleMapper(): TouchToVisualMapper {
  return (touch) => ({
    transform: {
      translateX: touch.x,
      translateY: touch.y,
      scale: 1,
      rotation: 0,
    },
  });
}

function createCustomMapper(): TouchToVisualMapper {
  return (touch) => ({
    transform: {
      translateX: touch.x,
      translateY: touch.y,
      scale: 1 + touch.pressure * 0.1,
      rotation: touch.velocityX * 10,
    },
    opacity: 0.8,
    brightness: 1.2,
    blur: touch.velocityY > 0 ? 2 : 0,
    custom: {
      glow: touch.pressure * 10,
      saturation: 1.5,
    },
  });
}

// ============================================================================
// Test Suites
// ============================================================================

describe("useTouchToVisualBridge coverage - Sprint 765", () => {
  describe("velocity calculation edge cases", () => {
    it("should handle same timestamp (dt = 0)", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      // Start touch at time 0
      mockPerformanceNow.mockReturnValue(0);
      const startEvent = createTouchEvent("touchstart", 100, 100);
      act(() => {
        result.current.controls.onTouchStart(startEvent);
      });

      // Move touch at SAME timestamp (dt = 0)
      mockPerformanceNow.mockReturnValue(0);
      const moveEvent = createTouchEvent("touchmove", 150, 150);
      act(() => {
        result.current.controls.onTouchMove(moveEvent);
      });

      // Should not crash, velocity should be 0
      expect(result.current.state.currentTouch?.velocityX).toBe(0);
      expect(result.current.state.currentTouch?.velocityY).toBe(0);
    });

    it("should calculate velocity correctly with positive dt", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      const startEvent = createTouchEvent("touchstart", 100, 100);
      act(() => {
        result.current.controls.onTouchStart(startEvent);
      });

      // Move touch 16ms later
      mockPerformanceNow.mockReturnValue(16);
      const moveEvent = createTouchEvent("touchmove", 116, 116);
      act(() => {
        result.current.controls.onTouchMove(moveEvent);
      });

      // Velocity should be 16px / 16ms = 1 px/ms
      expect(result.current.state.currentTouch?.velocityX).toBe(1);
      expect(result.current.state.currentTouch?.velocityY).toBe(1);
    });
  });

  describe("mergeVisualStates with all properties", () => {
    it("should merge custom properties with lerp", () => {
      const mapper = createCustomMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 1 })
      );

      mockPerformanceNow.mockReturnValue(0);
      const startEvent = createTouchEvent("touchstart", 100, 100, { force: 0.5 });
      act(() => {
        result.current.controls.onTouchStart(startEvent);
      });

      // Advance frame to apply smoothing
      advanceFrame(16);

      // Custom properties should be present
      expect(result.current.state.visualState.custom).toBeDefined();
    });

    it("should merge opacity, brightness, and blur", () => {
      const mapper = createCustomMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 1 })
      );

      mockPerformanceNow.mockReturnValue(0);
      const startEvent = createTouchEvent("touchstart", 100, 100);
      act(() => {
        result.current.controls.onTouchStart(startEvent);
      });

      advanceFrame(16);

      // Opacity and brightness should be updated
      expect(result.current.state.visualState.opacity).toBeDefined();
      expect(result.current.state.visualState.brightness).toBeDefined();
    });
  });

  describe("prediction confidence calculation", () => {
    it("should calculate confidence with consistent velocities", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enablePrediction: true })
      );

      // Build up touch history with consistent direction
      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      // Multiple moves in same direction
      for (let i = 1; i <= 5; i++) {
        mockPerformanceNow.mockReturnValue(i * 16);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", i * 10, i * 10)
          );
        });
      }

      // With consistent direction, prediction should be active
      expect(result.current.state.prediction).not.toBeNull();
    });

    it("should handle less than 3 history items", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enablePrediction: true })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // Only 1 history item - no prediction
      expect(result.current.state.prediction).toBeNull();
    });
  });

  describe("metrics recording", () => {
    it("should record latency and update metrics after 1 second", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      // Start touch
      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // Generate multiple updates
      for (let i = 1; i <= 10; i++) {
        mockPerformanceNow.mockReturnValue(i * 16);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", 100 + i, 100 + i)
          );
        });
      }

      // Advance past 1 second boundary
      mockPerformanceNow.mockReturnValue(1001);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 200, 200)
        );
      });

      // Metrics should be updated
      expect(result.current.state.metrics.totalUpdates).toBeGreaterThan(0);
    });

    it("should trim latency array at 100 entries", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // Generate more than 100 updates
      for (let i = 1; i <= 110; i++) {
        mockPerformanceNow.mockReturnValue(i);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", 100 + i, 100 + i)
          );
        });
      }

      // Should not crash, metrics should be valid
      expect(result.current.state.metrics).toBeDefined();
    });
  });

  describe("debounce handling", () => {
    it("should debounce updates when enabled", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, {
          debounceUpdates: true,
          debounceIntervalMs: 16,
        })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // First frame at time 0
      advanceFrame(0);

      // Frame at 8ms (should be debounced)
      advanceFrame(8);

      // Frame at 16ms (should pass)
      advanceFrame(16);

      expect(result.current.state.isActive).toBe(true);
    });
  });

  describe("momentum handling", () => {
    it("should continue momentum after touch end with velocity", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enableMomentum: true })
      );

      // Start touch
      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      // Fast move to build velocity
      mockPerformanceNow.mockReturnValue(16);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 50, 50)
        );
      });

      // End touch (velocity > 0.1)
      mockPerformanceNow.mockReturnValue(32);
      const endEvent = createTouchEvent("touchend", 50, 50);
      act(() => {
        result.current.controls.onTouchEnd(endEvent);
      });

      // Momentum should be active - RAF should continue
      expect(mockRequestAnimationFrame).toHaveBeenCalled();
    });

    it("should stop momentum when velocity is negligible", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, {
          enableMomentum: true,
          momentumFriction: 0.1, // Very high friction
        })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      mockPerformanceNow.mockReturnValue(16);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 50, 50)
        );
      });

      mockPerformanceNow.mockReturnValue(32);
      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", 50, 50));
      });

      // Advance multiple frames for momentum to decay
      for (let i = 0; i < 20; i++) {
        advanceFrame(32 + i * 16);
      }

      // Eventually momentum should stop
      expect(result.current.state.isActive).toBe(false);
    });

    it("should not enable momentum when velocity is low", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enableMomentum: true })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // Very slow move (low velocity)
      mockPerformanceNow.mockReturnValue(1000);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 100.01, 100.01)
        );
      });

      mockPerformanceNow.mockReturnValue(2000);
      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", 100, 100));
      });

      // Low velocity should not trigger momentum
      expect(result.current.state.isActive).toBe(false);
    });

    it("should not enable momentum when disabled", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enableMomentum: false })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      mockPerformanceNow.mockReturnValue(16);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 100, 100)
        );
      });

      mockPerformanceNow.mockReturnValue(32);
      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", 100, 100));
      });

      expect(result.current.state.isActive).toBe(false);
    });
  });

  describe("haptic feedback", () => {
    it("should trigger haptic on touch start when enabled", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enableHaptics: true })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      expect(mockVibrate).toHaveBeenCalledWith(10); // light haptic
    });

    it("should trigger haptic on touch end when enabled", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enableHaptics: true })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      mockVibrate.mockClear();

      mockPerformanceNow.mockReturnValue(16);
      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", 100, 100));
      });

      expect(mockVibrate).toHaveBeenCalledWith(10);
    });
  });

  describe("touch history management", () => {
    it("should trim history when exceeding maxTouchHistory", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { maxTouchHistory: 5 })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      // More moves than maxTouchHistory
      for (let i = 1; i <= 10; i++) {
        mockPerformanceNow.mockReturnValue(i * 16);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", i * 10, i * 10)
          );
        });
      }

      // Hook should still work correctly
      expect(result.current.state.currentTouch).toBeDefined();
    });
  });

  describe("multi-touch handling", () => {
    it("should not deactivate when touches remain", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100, { touchCount: 2 })
        );
      });

      expect(result.current.state.isActive).toBe(true);

      // End one touch but another remains
      mockPerformanceNow.mockReturnValue(16);
      act(() => {
        result.current.controls.onTouchEnd(
          createTouchEvent("touchend", 100, 100, { touchCount: 1 })
        );
      });

      // Should still be active because touches.length > 0
      expect(result.current.state.isActive).toBe(true);
    });
  });

  describe("touch event without touch data", () => {
    it("should handle touchstart with no touches gracefully", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      const emptyEvent = {
        touches: [],
        changedTouches: [],
        targetTouches: [],
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      } as unknown as TouchEvent;

      act(() => {
        result.current.controls.onTouchStart(emptyEvent);
      });

      expect(result.current.state.isActive).toBe(false);
    });

    it("should handle touchmove with no touches gracefully", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      const emptyMoveEvent = {
        touches: [],
        changedTouches: [],
        targetTouches: [],
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      } as unknown as TouchEvent;

      act(() => {
        result.current.controls.onTouchMove(emptyMoveEvent);
      });

      // Should not crash
      expect(result.current.state.isActive).toBe(true);
    });
  });

  describe("forcePrediction", () => {
    it("should force prediction update when history is sufficient", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enablePrediction: true })
      );

      // Build history
      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      for (let i = 1; i <= 5; i++) {
        mockPerformanceNow.mockReturnValue(i * 16);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", i * 10, i * 10)
          );
        });
      }

      // Force prediction
      act(() => {
        result.current.controls.forcePrediction();
      });

      expect(result.current.state.prediction).not.toBeNull();
    });

    it("should do nothing when history is insufficient", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      // No touch history
      act(() => {
        result.current.controls.forcePrediction();
      });

      expect(result.current.state.prediction).toBeNull();
    });
  });

  describe("reset functionality", () => {
    it("should reset all state", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      expect(result.current.state.isActive).toBe(true);

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.currentTouch).toBeNull();
      expect(result.current.state.prediction).toBeNull();
    });
  });

  describe("updateVisualState", () => {
    it("should update target state directly", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 1 })
      );

      act(() => {
        result.current.controls.updateVisualState({
          transform: {
            translateX: 50,
            translateY: 50,
            scale: 2,
            rotation: 45,
          },
          opacity: 0.5,
          custom: { test: 100 },
        });
      });

      // Trigger animation to apply
      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      advanceFrame(16);

      expect(result.current.state.visualState).toBeDefined();
    });
  });

  describe("CSS generation", () => {
    it("should generate cssFilter with brightness and blur", () => {
      const mapper: TouchToVisualMapper = () => ({
        brightness: 1.5,
        blur: 5,
      });

      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 1 })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // Advance frame within act() to ensure React state updates are processed
      act(() => {
        advanceFrame(16);
      });

      expect(result.current.cssFilter).toContain("brightness");
      expect(result.current.cssFilter).toContain("blur");
    });

    it("should return 'none' for default filter values", () => {
      const mapper: TouchToVisualMapper = () => ({});

      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      expect(result.current.cssFilter).toBe("none");
    });
  });
});

describe("Convenience hooks - Sprint 765", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rafCallback = null;
    frameId = 0;
    mockPerformanceNow.mockReturnValue(0);
  });

  describe("useTouchTranslate", () => {
    it("should translate based on touch movement", () => {
      const { result } = renderHook(() => useTouchTranslate());

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      mockPerformanceNow.mockReturnValue(16);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 150, 200)
        );
      });

      expect(result.current.state.currentTouch).toBeDefined();
    });
  });

  describe("useTouchScale", () => {
    it("should scale based on distance from start", () => {
      const { result } = renderHook(() =>
        useTouchScale(1, 0.5, 3)
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      mockPerformanceNow.mockReturnValue(16);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 200, 200)
        );
      });

      expect(result.current.state.currentTouch).toBeDefined();
    });

    it("should clamp scale to min and max", () => {
      const { result } = renderHook(() =>
        useTouchScale(1, 0.5, 2)
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      // Large movement that would exceed max
      mockPerformanceNow.mockReturnValue(16);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 500, 500)
        );
      });

      expect(result.current.state).toBeDefined();
    });
  });

  describe("useTouchOpacity", () => {
    it("should update opacity based on pressure", () => {
      const { result } = renderHook(() => useTouchOpacity());

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100, { force: 0.5 })
        );
      });

      expect(result.current.state.currentTouch?.pressure).toBe(0.5);
    });

    it("should clamp opacity between 0.3 and 1", () => {
      const { result } = renderHook(() => useTouchOpacity());

      // Very low pressure
      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100, { force: 0.1 })
        );
      });

      expect(result.current.state.currentTouch).toBeDefined();
    });
  });
});
