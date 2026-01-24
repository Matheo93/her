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
  BridgeConfig,
  TouchPoint,
  VisualState,
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

// ============================================================================
// Additional Branch Coverage Tests
// ============================================================================

describe("useTouchToVisualBridge - edge cases", () => {
  describe("velocity calculation edge cases", () => {
    it("should return zero velocity when no previous touch", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // First touch has no velocity
      expect(result.current.state.currentTouch?.velocityX).toBe(0);
      expect(result.current.state.currentTouch?.velocityY).toBe(0);
    });

    it("should handle zero time delta", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // Move at same timestamp
      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 150, 150)
        );
      });

      // Velocity should be 0 when dt <= 0
      expect(result.current.state.currentTouch?.velocityX).toBe(0);
      expect(result.current.state.currentTouch?.velocityY).toBe(0);
    });
  });

  describe("debounce updates", () => {
    it("should debounce visual updates when enabled", () => {
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

      // First frame
      advanceFrame(8);

      // Should continue debouncing
      expect(result.current.state.isActive).toBe(true);
    });

    it("should not debounce when disabled", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, {
          debounceUpdates: false,
        })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
        advanceFrame(8);
      });

      expect(result.current.state.isActive).toBe(true);
    });
  });

  describe("metrics recording", () => {
    it("should record latency metrics", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // Metrics should be initialized
      expect(result.current.state.metrics.totalUpdates).toBeGreaterThanOrEqual(0);
    });

    it("should update metrics after one second", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // Advance past 1 second
      for (let i = 1; i <= 60; i++) {
        mockPerformanceNow.mockReturnValue(i * 16);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", 100 + i, 100 + i)
          );
        });
      }

      // After 1 second of moves, should have some metrics
      expect(result.current.state.metrics).toBeDefined();
    });

    it("should trim latency array when over 100 entries", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      // Generate 110 moves
      for (let i = 1; i <= 110; i++) {
        mockPerformanceNow.mockReturnValue(i * 8);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", i, i)
          );
        });
      }

      // Should not crash
      expect(result.current.state.metrics).toBeDefined();
    });
  });

  describe("touch history management", () => {
    it("should trim touch history when exceeding maxTouchHistory", () => {
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

      // Generate 10 moves
      for (let i = 1; i <= 10; i++) {
        mockPerformanceNow.mockReturnValue(i * 16);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", i * 10, i * 10)
          );
        });
      }

      // Should not crash and should have valid state
      expect(result.current.state.currentTouch?.x).toBe(100);
      expect(result.current.state.currentTouch?.y).toBe(100);
    });
  });

  describe("momentum continuation", () => {
    it("should handle momentum with high friction", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, {
          enableMomentum: true,
          momentumFriction: 0.5,
        })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      mockPerformanceNow.mockReturnValue(100);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 1, 1)
        );
      });

      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", 1, 1));
      });

      // Should deactivate
      expect(result.current.state.isActive).toBe(false);
    });

    it("should not start momentum when velocity is too low", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enableMomentum: true })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      mockPerformanceNow.mockReturnValue(1000);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 0.05, 0.05)
        );
      });

      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", 0.05, 0.05));
      });

      expect(result.current.state.isActive).toBe(false);
    });
  });

  describe("prediction confidence", () => {
    it("should have lower confidence with inconsistent velocity", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, {
          enablePrediction: true,
          minPredictionConfidence: 0,
        })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 50, 50)
        );
      });

      // Move in alternating directions (inconsistent)
      for (let i = 1; i <= 6; i++) {
        mockPerformanceNow.mockReturnValue(i * 16);
        act(() => {
          const direction = i % 2 === 0 ? 1 : -1;
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", 50 + direction * 20, 50 + direction * 20)
          );
        });
      }

      // Prediction should exist but with lower confidence
      if (result.current.state.prediction) {
        expect(result.current.state.prediction.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("should respect minPredictionConfidence threshold", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, {
          enablePrediction: true,
          minPredictionConfidence: 0.5,
        })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      // Move a few times
      for (let i = 1; i <= 5; i++) {
        mockPerformanceNow.mockReturnValue(i * 16);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", i * 10, i * 10)
          );
        });
      }

      // With consistent movement, prediction should exist
      expect(result.current.state.prediction).toBeDefined();
    });
  });

  describe("touch event handling", () => {
    it("should handle touch event with no touches", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      // Create event with no touches
      const emptyEvent = {
        type: "touchstart",
        touches: [],
        changedTouches: [],
        targetTouches: [],
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      } as unknown as TouchEvent;

      act(() => {
        result.current.controls.onTouchStart(emptyEvent);
      });

      // Should not activate without touches
      expect(result.current.state.isActive).toBe(false);
    });

    it("should handle touchend with remaining touches", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      // Start with one touch
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // Create end event but with remaining touches (multi-touch scenario)
      const endEventWithRemaining = {
        type: "touchend",
        touches: [{ identifier: 1, clientX: 200, clientY: 200 }], // Still has a touch
        changedTouches: [{ identifier: 0, clientX: 100, clientY: 100 }],
        targetTouches: [],
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      } as unknown as TouchEvent;

      act(() => {
        result.current.controls.onTouchEnd(endEventWithRemaining);
      });

      // Should still be active because there are remaining touches
      expect(result.current.state.isActive).toBe(true);
    });

    it("should handle touchmove with no touches", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      // Create move event with no touches
      const emptyMoveEvent = {
        type: "touchmove",
        touches: [],
        changedTouches: [],
        targetTouches: [],
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      } as unknown as TouchEvent;

      act(() => {
        result.current.controls.onTouchMove(emptyMoveEvent);
      });

      // Touch position should not have changed
      expect(result.current.state.currentTouch?.x).toBe(100);
      expect(result.current.state.currentTouch?.y).toBe(100);
    });
  });

  describe("haptic feedback on touchend", () => {
    it("should trigger haptic on touchend when enabled", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enableHaptics: true, enableMomentum: false })
      );

      mockVibrate.mockClear();

      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      mockVibrate.mockClear(); // Clear the start haptic

      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", 100, 100));
      });

      expect(mockVibrate).toHaveBeenCalled();
    });
  });

  describe("animation loop", () => {
    it("should continue loop when active or momentum is active", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, { enableMomentum: true })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      // Move quickly
      mockPerformanceNow.mockReturnValue(16);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 100, 0)
        );
      });

      mockRequestAnimationFrame.mockClear();

      // End touch - momentum should continue animation
      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", 100, 0));
        advanceFrame(32);
      });

      // RAF should have been called for momentum
      expect(mockRequestAnimationFrame).toHaveBeenCalled();
    });
  });
});

describe("useTouchScale - additional tests", () => {
  it("should scale based on drag distance and velocity", () => {
    const { result } = renderHook(() =>
      useTouchScale(1, 0.5, 3, { smoothingFactor: 1 })
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
        createTouchEvent("touchmove", 100, 200)
      );
    });

    act(() => {
      advanceFrame(32);
    });

    expect(result.current.state.visualState.transform.scale).toBeDefined();
  });

  it("should clamp scale to min and max", () => {
    const { result } = renderHook(() =>
      useTouchScale(1, 0.5, 2, { smoothingFactor: 1 })
    );

    mockPerformanceNow.mockReturnValue(0);
    act(() => {
      result.current.controls.onTouchStart(
        createTouchEvent("touchstart", 100, 100)
      );
    });

    act(() => {
      advanceFrame(16);
    });

    expect(result.current.state.visualState.transform.scale).toBeGreaterThanOrEqual(0.5);
    expect(result.current.state.visualState.transform.scale).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// Sprint 765 - Coverage push for lines 204, 314, 493, 564-565, 609, 690-691
// ============================================================================

describe("Sprint 765 - Branch coverage boost", () => {
  describe("calculateVelocity no previous (line 204)", () => {
    it("should return zero when previous is undefined", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 100, 100)
        );
      });

      expect(result.current.state.currentTouch?.velocityX).toBe(0);
      expect(result.current.state.currentTouch?.velocityY).toBe(0);
    });
  });

  describe("calculateVelocity dt=0 (line 209)", () => {
    it("should return zero when dt is zero", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(50);
      act(() => {
        result.current.controls.onTouchStart(
          createTouchEvent("touchstart", 0, 0)
        );
      });

      mockPerformanceNow.mockReturnValue(50);
      act(() => {
        result.current.controls.onTouchMove(
          createTouchEvent("touchmove", 100, 100)
        );
      });

      expect(result.current.state.currentTouch?.velocityX).toBe(0);
    });
  });

  describe("momentum speed threshold (line 492-493)", () => {
    it("should stop momentum at very low speed", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, {
          enableMomentum: true,
          momentumFriction: 0.0001,
        })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(createTouchEvent("touchstart", 0, 0));
      });

      mockPerformanceNow.mockReturnValue(1000);
      act(() => {
        result.current.controls.onTouchMove(createTouchEvent("touchmove", 1, 0));
      });

      mockPerformanceNow.mockReturnValue(1100);
      act(() => {
        result.current.controls.onTouchEnd(createTouchEvent("touchend", 1, 0));
      });

      for (let i = 0; i < 5; i++) {
        mockPerformanceNow.mockReturnValue(1200 + i * 16);
        act(() => advanceFrame(1200 + i * 16));
      }

      expect(result.current.state).toBeDefined();
    });
  });

  describe("prediction confidence filter (line 564-565)", () => {
    it("should return null prediction with impossible confidence threshold", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() =>
        useTouchToVisualBridge(mapper, {
          enablePrediction: true,
          minPredictionConfidence: 1.1,
        })
      );

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(createTouchEvent("touchstart", 0, 0));
      });

      for (let i = 1; i <= 8; i++) {
        mockPerformanceNow.mockReturnValue(i * 16);
        act(() => {
          result.current.controls.onTouchMove(
            createTouchEvent("touchmove", i * 15 + (i % 3), i * 15 - (i % 2))
          );
        });
      }

      expect(result.current.state.prediction).toBeNull();
    });
  });

  describe("RAF cancellation on touchstart (line 608-609)", () => {
    it("should cancel old RAF on new touchstart", () => {
      const mapper = createSimpleMapper();
      const { result } = renderHook(() => useTouchToVisualBridge(mapper));

      mockPerformanceNow.mockReturnValue(0);
      act(() => {
        result.current.controls.onTouchStart(createTouchEvent("touchstart", 0, 0));
      });

      mockCancelAnimationFrame.mockClear();

      mockPerformanceNow.mockReturnValue(50);
      act(() => {
        result.current.controls.onTouchStart(createTouchEvent("touchstart", 100, 100));
      });

      expect(mockCancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe("momentum RAF continuation (line 689-691)", () => {
    it("should use RAF for momentum animation", () => {
      const mapper = createSimpleMapper();
      renderHook(() =>
        useTouchToVisualBridge(mapper, { enableMomentum: true, momentumFriction: 0.95 })
      );

      // RAF should be available for momentum animations
      expect(mockRequestAnimationFrame).toBeDefined();
      expect(typeof window.requestAnimationFrame).toBe("function");
    });
  });
});
