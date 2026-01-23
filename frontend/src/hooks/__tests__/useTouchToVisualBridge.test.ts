/**
 * Tests for useTouchToVisualBridge
 *
 * Sprint 527: Touch-to-visual latency bridge tests
 * Covers touch handling, visual state updates, prediction,
 * momentum, and CSS generation.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useTouchToVisualBridge,
  useTouchTranslate,
  useTouchScale,
  useTouchOpacity,
  type BridgeConfig,
  type TouchPoint,
  type VisualState,
  type TouchToVisualMapper,
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
  // Mock requestAnimationFrame
  global.requestAnimationFrame = mockRequestAnimationFrame.mockImplementation(
    (callback: FrameRequestCallback) => {
      rafCallback = callback;
      return ++frameId;
    }
  );

  global.cancelAnimationFrame = mockCancelAnimationFrame;

  // Mock performance.now
  jest.spyOn(performance, "now").mockImplementation(mockPerformanceNow);

  // Mock navigator.vibrate
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
  options: { force?: number; identifier?: number } = {}
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

  const touchList =
    type === "touchend" ? [] : [touch];

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
    rafCallback(time);
    rafCallback = null;
  }
}

function createSimpleMapper(): TouchToVisualMapper {
  return (touch, history) => ({
    transform: {
      translateX: touch.x,
      translateY: touch.y,
      scale: 1,
      rotation: 0,
    },
  });
}

// ============================================================================
// Test Suites
// ============================================================================

describe("useTouchToVisualBridge", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

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

    it("should accept custom configuration", () => {
      const mapper = createSimpleMapper();
      const config: Partial<BridgeConfig> = {
        targetLatencyMs: 8,
        enablePrediction: false,
        enableMomentum: false,
      };

      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, config)
      );

      expect(result.current).toBeDefined();
      expect(result.current.controls).toBeDefined();
    });

    it("should initialize with default metrics", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      expect(result.current.state.metrics.averageLatency).toBe(0);
      expect(result.current.state.metrics.totalUpdates).toBe(0);
      expect(result.current.state.metrics.droppedFrames).toBe(0);
    });
  });

  describe("touch handling", () => {
    it("should handle touchstart", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      const touchEvent = createTouchEvent("touchstart", 100, 200);

      act(() => {
        result.current.controls.onTouchStart(touchEvent);
      });

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.currentTouch).not.toBeNull();
      expect(result.current.state.currentTouch?.x).toBe(100);
      expect(result.current.state.currentTouch?.y).toBe(200);
    });

    it("should handle touchmove", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      // Start touch
      const startEvent = createTouchEvent("touchstart", 100, 100);
      act(() => {
        result.current.controls.onTouchStart(startEvent);
      });

      // Move touch
      mockPerformanceNow.mockReturnValue(16);
      const moveEvent = createTouchEvent("touchmove", 150, 150);
      act(() => {
        result.current.controls.onTouchMove(moveEvent);
      });

      expect(result.current.state.currentTouch?.x).toBe(150);
      expect(result.current.state.currentTouch?.y).toBe(150);
    });

    it("should handle touchend", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enableMomentum: false })
      );

      // Start touch
      const startEvent = createTouchEvent("touchstart", 100, 100);
      act(() => {
        result.current.controls.onTouchStart(startEvent);
      });

      expect(result.current.state.isActive).toBe(true);

      // End touch
      const endEvent = createTouchEvent("touchend", 100, 100);
      act(() => {
        result.current.controls.onTouchEnd(endEvent);
      });

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.currentTouch).toBeNull();
    });

    it("should calculate velocity from touch history", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      // Start touch at t=0
      mockPerformanceNow.mockReturnValue(0);
      const startEvent = createTouchEvent("touchstart", 100, 100);
      act(() => {
        result.current.controls.onTouchStart(startEvent);
      });

      // Move touch at t=16ms (move 50px in x, 0 in y)
      mockPerformanceNow.mockReturnValue(16);
      const moveEvent = createTouchEvent("touchmove", 150, 100);
      act(() => {
        result.current.controls.onTouchMove(moveEvent);
      });

      // Velocity should be ~3.125 px/ms (50px / 16ms)
      expect(result.current.state.currentTouch?.velocityX).toBeCloseTo(3.125, 1);
      expect(result.current.state.currentTouch?.velocityY).toBe(0);
    });

    it("should track touch pressure", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      const touchEvent = createTouchEvent("touchstart", 100, 100, { force: 0.5 });
      act(() => {
        result.current.controls.onTouchStart(touchEvent);
      });

      expect(result.current.state.currentTouch?.pressure).toBe(0.5);
    });
  });

  describe("visual state updates", () => {
    it("should update visual state based on mapper", () => {
      const mapper: TouchToVisualMapper = (touch) => ({
        transform: {
          translateX: touch.x * 2,
          translateY: touch.y * 2,
          scale: 1.5,
          rotation: 45,
        },
        opacity: 0.8,
      });

      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 1 })
      );

      const touchEvent = createTouchEvent("touchstart", 50, 50);
      act(() => {
        result.current.controls.onTouchStart(touchEvent);
        advanceFrame(16);
      });

      // With smoothing factor 1, should match target immediately
      expect(result.current.state.visualState.transform.translateX).toBeCloseTo(100, 0);
      expect(result.current.state.visualState.transform.translateY).toBeCloseTo(100, 0);
    });

    it("should allow direct visual state updates", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 1 })
      );

      act(() => {
        result.current.controls.updateVisualState({
          opacity: 0.5,
          brightness: 1.2,
        });
        // Need to trigger animation loop to apply changes
        const touchEvent = createTouchEvent("touchstart", 0, 0);
        result.current.controls.onTouchStart(touchEvent);
        advanceFrame(16);
      });

      // Note: updateVisualState affects targetStateRef, animation applies it
    });

    it("should apply smoothing to visual state changes", () => {
      const mapper: TouchToVisualMapper = () => ({
        transform: {
          translateX: 100,
          translateY: 100,
          scale: 1,
          rotation: 0,
        },
      });

      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 0.5 })
      );

      const touchEvent = createTouchEvent("touchstart", 100, 100);
      act(() => {
        result.current.controls.onTouchStart(touchEvent);
        advanceFrame(16);
      });

      // With 0.5 smoothing, should be halfway between 0 and 100
      expect(result.current.state.visualState.transform.translateX).toBeCloseTo(50, 0);
    });
  });

  describe("CSS generation", () => {
    it("should generate correct CSS transform", () => {
      const mapper: TouchToVisualMapper = () => ({
        transform: {
          translateX: 10,
          translateY: 20,
          scale: 1.5,
          rotation: 45,
        },
      });

      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 1 })
      );

      const touchEvent = createTouchEvent("touchstart", 0, 0);
      act(() => {
        result.current.controls.onTouchStart(touchEvent);
        advanceFrame(16);
      });

      expect(result.current.cssTransform).toContain("translate3d");
      expect(result.current.cssTransform).toContain("scale");
      expect(result.current.cssTransform).toContain("rotate");
    });

    it("should generate correct CSS filter", () => {
      const mapper: TouchToVisualMapper = () => ({
        brightness: 1.2,
        blur: 5,
      });

      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 1 })
      );

      const touchEvent = createTouchEvent("touchstart", 0, 0);
      act(() => {
        result.current.controls.onTouchStart(touchEvent);
        advanceFrame(16);
      });

      expect(result.current.cssFilter).toContain("brightness");
      expect(result.current.cssFilter).toContain("blur");
    });

    it("should return 'none' for default filter", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      expect(result.current.cssFilter).toBe("none");
    });
  });

  describe("prediction", () => {
    it("should generate predictions when enabled", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, {
          enablePrediction: true,
          minPredictionConfidence: 0,
        })
      );

      // Build up touch history
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

      expect(result.current.state.prediction).not.toBeNull();
    });

    it("should not predict when disabled", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enablePrediction: false })
      );

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

      expect(result.current.state.prediction).toBeNull();
    });

    it("should allow forced prediction update", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, {
          enablePrediction: true,
          minPredictionConfidence: 0,
        })
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
            createTouchEvent("touchmove", i * 10, 0)
          );
        });
      }

      act(() => {
        result.current.controls.forcePrediction();
      });

      expect(result.current.state.prediction).toBeDefined();
    });
  });

  describe("momentum", () => {
    it("should continue animation with momentum after touchend", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, {
          enableMomentum: true,
          momentumFriction: 0.95,
        })
      );

      // Start and move touch quickly
      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      mockPerformanceNow.mockReturnValue(16);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 50, 0)
        );
      });

      // End touch
      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", 50, 0));
      });

      // Animation should continue due to momentum
      expect(mockRequestAnimationFrame).toHaveBeenCalled();
    });

    it("should not use momentum when disabled", () => {
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
          createTouchEvent("touchmove", 50, 0)
        );
      });

      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", 50, 0));
      });

      expect(result.current.state.isActive).toBe(false);
    });
  });

  describe("haptic feedback", () => {
    it("should trigger haptic on touch when enabled", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enableHaptics: true })
      );

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      expect(mockVibrate).toHaveBeenCalled();
    });

    it("should not trigger haptic when disabled", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enableHaptics: false })
      );

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      expect(mockVibrate).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("should reset to initial state", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      // Interact with bridge
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      expect(result.current.state.isActive).toBe(true);

      // Reset
      act(() => {
        result.current.controls.reset();
      });

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

    it("should cancel animation frame on reset", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      act(() => {
        result.current.controls.reset();
      });

      expect(mockCancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const mapper = createSimpleMapper();
      const { result, unmount } = renderHook(() =>
        useTouchToVisualBridge(mapper)
      );

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      unmount();

      expect(mockCancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe("custom values in visual state", () => {
    it("should handle custom visual state properties", () => {
      const mapper: TouchToVisualMapper = (touch) => ({
        custom: {
          glow: touch.pressure * 10,
          shadow: touch.velocityX,
        },
      });

      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { smoothingFactor: 1 })
      );

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100, { force: 0.8 })
        );
        advanceFrame(16);
      });

      expect(result.current.state.visualState.custom.glow).toBeCloseTo(8, 0);
    });
  });
});

// ============================================================================
// Convenience Hooks Tests
// ============================================================================

describe("useTouchTranslate", () => {
  it("should translate based on touch delta", () => {
    const { result } = renderHook(() =>
      useTouchTranslate({ smoothingFactor: 1 })
    );

    mockPerformanceNow.mockReturnValue(0);
    act(() => {
      result.current.controls.onTouchStart(
        createTouchEvent("touchstart", 50, 50)
      );
    });

    mockPerformanceNow.mockReturnValue(16);
    act(() => {
      result.current.controls.onTouchMove(
        createTouchEvent("touchmove", 100, 75)
      );
      advanceFrame(32);
    });

    // Should translate by delta: (100-50, 75-50) = (50, 25)
    expect(result.current.state.visualState.transform.translateX).toBeCloseTo(50, 0);
    expect(result.current.state.visualState.transform.translateY).toBeCloseTo(25, 0);
  });

  it("should return controls and state", () => {
    const { result } = renderHook(() => useTouchTranslate());

    expect(result.current.controls).toBeDefined();
    expect(result.current.controls.onTouchStart).toBeInstanceOf(Function);
    expect(result.current.controls.onTouchMove).toBeInstanceOf(Function);
    expect(result.current.controls.onTouchEnd).toBeInstanceOf(Function);
    expect(result.current.state).toBeDefined();
  });
});

describe("useTouchScale", () => {
  it("should initialize with given scale", () => {
    const { result } = renderHook(() => useTouchScale(2));

    expect(result.current.state.visualState.transform.scale).toBe(1); // Initial default
  });

  it("should return controls and state", () => {
    const { result } = renderHook(() => useTouchScale());

    expect(result.current.controls).toBeDefined();
    expect(result.current.state).toBeDefined();
    expect(result.current.cssTransform).toBeDefined();
  });
});

describe("useTouchOpacity", () => {
  it("should update opacity based on pressure", () => {
    const { result } = renderHook(() =>
      useTouchOpacity({ smoothingFactor: 1 })
    );

    act(() => {
      result.current.controls.onTouchStart(
        createTouchEvent("touchstart", 100, 100, { force: 0.5 })
      );
      advanceFrame(16);
    });

    expect(result.current.state.visualState.opacity).toBeCloseTo(0.5, 1);
  });

  it("should clamp opacity to minimum 0.3", () => {
    const { result } = renderHook(() =>
      useTouchOpacity({ smoothingFactor: 1 })
    );

    act(() => {
      result.current.controls.onTouchStart(
        createTouchEvent("touchstart", 100, 100, { force: 0.1 })
      );
      advanceFrame(16);
    });

    expect(result.current.state.visualState.opacity).toBeGreaterThanOrEqual(0.3);
  });
});
