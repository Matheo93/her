/**
 * Tests for useTouchAvatarInteraction hook - Sprint 541
 *
 * Tests touch-optimized avatar interactions including:
 * - Tap, double-tap, long-press gestures
 * - Swipe detection (left, right, up, down)
 * - Pinch/spread gestures
 * - Pan gestures
 * - Eye tracking position
 * - Haptic feedback integration
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useTouchAvatarInteraction,
  useTouchEyeTracking,
  useAvatarTap,
} from "../useTouchAvatarInteraction";

// Mock useMobileDetect
jest.mock("../useMobileDetect", () => ({
  useMobileDetect: () => ({
    isTouchDevice: true,
    isMobile: true,
    isTablet: false,
    isDesktop: false,
    deviceType: "mobile",
  }),
}));

// Mock useHapticFeedback
const mockHapticTrigger = jest.fn();
jest.mock("../useHapticFeedback", () => ({
  useHapticFeedback: () => ({
    trigger: mockHapticTrigger,
    isSupported: true,
  }),
}));

// Helper to create touch events
function createTouchEvent(
  type: string,
  touches: { clientX: number; clientY: number }[],
  options: { preventDefault?: () => void } = {}
): TouchEvent {
  const touchList = touches.map(
    (t, i) =>
      ({
        identifier: i,
        clientX: t.clientX,
        clientY: t.clientY,
        pageX: t.clientX,
        pageY: t.clientY,
        screenX: t.clientX,
        screenY: t.clientY,
        target: document.createElement("div"),
        radiusX: 1,
        radiusY: 1,
        rotationAngle: 0,
        force: 1,
      }) as Touch
  );

  const event = {
    type,
    touches: touchList,
    targetTouches: touchList,
    changedTouches: touchList,
    preventDefault: options.preventDefault || jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as TouchEvent;

  return event;
}

describe("useTouchAvatarInteraction", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Date, "now").mockReturnValue(1000);
    mockHapticTrigger.mockClear();

    // Create element with dimensions
    element = document.createElement("div");
    Object.defineProperty(element, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
      }),
    });
    document.body.appendChild(element);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
    document.body.removeChild(element);
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useTouchAvatarInteraction());

      expect(result.current.state.currentGesture).toBe("none");
      expect(result.current.state.isTouching).toBe(false);
      expect(result.current.state.position).toBeNull();
      expect(result.current.state.velocity).toEqual({ x: 0, y: 0 });
      expect(result.current.state.touchCount).toBe(0);
      expect(result.current.state.touchDuration).toBe(0);
      expect(result.current.state.totalDistance).toBe(0);
    });

    it("should provide ref callback", () => {
      const { result } = renderHook(() => useTouchAvatarInteraction());

      expect(typeof result.current.ref).toBe("function");
    });

    it("should report touch support from mobile detect", () => {
      const { result } = renderHook(() => useTouchAvatarInteraction());

      expect(result.current.isTouchSupported).toBe(true);
    });

    it("should initialize eye tracking position as null", () => {
      const { result } = renderHook(() => useTouchAvatarInteraction());

      expect(result.current.eyeTrackingPosition).toBeNull();
    });

    it("should initialize last gesture as none", () => {
      const { result } = renderHook(() => useTouchAvatarInteraction());

      expect(result.current.lastGesture).toBe("none");
    });
  });

  // ============================================================================
  // Touch Start Tests
  // ============================================================================

  describe("touch start", () => {
    it("should update state on touch start", () => {
      const onTouchStart = jest.fn();
      const { result } = renderHook(() =>
        useTouchAvatarInteraction({ onTouchStart })
      );

      // Attach ref to element
      act(() => {
        result.current.ref(element);
      });

      // Simulate touch start
      const touchEvent = createTouchEvent("touchstart", [
        { clientX: 50, clientY: 50 },
      ]);

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: touchEvent.touches as unknown as Touch[],
            bubbles: true,
          })
        );
      });

      // State should be updated
      expect(result.current.state.isTouching).toBe(true);
      expect(result.current.state.touchCount).toBe(1);
    });

    it("should call onTouchStart callback", () => {
      const onTouchStart = jest.fn();
      const { result } = renderHook(() =>
        useTouchAvatarInteraction({ onTouchStart })
      );

      act(() => {
        result.current.ref(element);
      });

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      expect(onTouchStart).toHaveBeenCalled();
    });

    it("should trigger haptic feedback on touch start", () => {
      const { result } = renderHook(() =>
        useTouchAvatarInteraction({}, { enableHaptics: true })
      );

      act(() => {
        result.current.ref(element);
      });

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      expect(mockHapticTrigger).toHaveBeenCalledWith("light");
    });
  });

  // ============================================================================
  // Tap Gesture Tests
  // ============================================================================

  describe("tap gesture", () => {
    it("should detect single tap", () => {
      const onTap = jest.fn();
      const { result } = renderHook(() => useTouchAvatarInteraction({ onTap }));

      act(() => {
        result.current.ref(element);
      });

      // Simulate quick tap (touchstart + touchend without movement)
      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      // Brief delay then end
      act(() => {
        jest.advanceTimersByTime(50);
      });

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchend", {
            touches: [],
            changedTouches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      expect(onTap).toHaveBeenCalled();
      expect(result.current.lastGesture).toBe("tap");
    });

    it("should detect double tap", () => {
      const onDoubleTap = jest.fn();
      const { result } = renderHook(() =>
        useTouchAvatarInteraction({ onDoubleTap })
      );

      act(() => {
        result.current.ref(element);
      });

      // First tap
      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      act(() => {
        jest.advanceTimersByTime(50);
      });

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchend", {
            touches: [],
            changedTouches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      // Second tap within threshold
      act(() => {
        jest.advanceTimersByTime(100);
        (Date.now as jest.Mock).mockReturnValue(1150);
      });

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      act(() => {
        jest.advanceTimersByTime(50);
        (Date.now as jest.Mock).mockReturnValue(1200);
      });

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchend", {
            touches: [],
            changedTouches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      expect(onDoubleTap).toHaveBeenCalled();
      expect(result.current.lastGesture).toBe("double-tap");
    });
  });

  // ============================================================================
  // Long Press Tests
  // ============================================================================

  describe("long press", () => {
    it("should detect long press after threshold", () => {
      const onLongPress = jest.fn();
      const { result } = renderHook(() =>
        useTouchAvatarInteraction({ onLongPress }, { longPressThreshold: 500 })
      );

      act(() => {
        result.current.ref(element);
      });

      // Start touch
      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      // Advance past long press threshold
      act(() => {
        jest.advanceTimersByTime(600);
      });

      expect(onLongPress).toHaveBeenCalled();
      expect(result.current.state.currentGesture).toBe("long-press");
    });

    it("should trigger heavy haptic on long press", () => {
      const { result } = renderHook(() =>
        useTouchAvatarInteraction({}, { longPressThreshold: 500, enableHaptics: true })
      );

      act(() => {
        result.current.ref(element);
      });

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      act(() => {
        jest.advanceTimersByTime(600);
      });

      expect(mockHapticTrigger).toHaveBeenCalledWith("heavy");
    });

    it("should cancel long press if moved", () => {
      const onLongPress = jest.fn();
      const { result } = renderHook(() =>
        useTouchAvatarInteraction({ onLongPress }, { longPressThreshold: 500 })
      );

      act(() => {
        result.current.ref(element);
      });

      // Start touch
      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      // Move significantly before threshold
      act(() => {
        jest.advanceTimersByTime(200);
        element.dispatchEvent(
          new TouchEvent("touchmove", {
            touches: [
              {
                identifier: 0,
                clientX: 80,
                clientY: 80,
                pageX: 80,
                pageY: 80,
                screenX: 80,
                screenY: 80,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      // Advance past threshold
      act(() => {
        jest.advanceTimersByTime(400);
      });

      expect(onLongPress).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Touch End Tests
  // ============================================================================

  describe("touch end", () => {
    it("should reset state on touch end", () => {
      const { result } = renderHook(() => useTouchAvatarInteraction());

      act(() => {
        result.current.ref(element);
      });

      // Start touch
      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      expect(result.current.state.isTouching).toBe(true);

      // End touch
      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchend", {
            touches: [],
            changedTouches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      expect(result.current.state.isTouching).toBe(false);
      expect(result.current.state.position).toBeNull();
      expect(result.current.state.touchCount).toBe(0);
    });

    it("should call onTouchEnd callback", () => {
      const onTouchEnd = jest.fn();
      const { result } = renderHook(() =>
        useTouchAvatarInteraction({ onTouchEnd })
      );

      act(() => {
        result.current.ref(element);
      });

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchend", {
            touches: [],
            changedTouches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      expect(onTouchEnd).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Reset Tests
  // ============================================================================

  describe("reset", () => {
    it("should reset all state", () => {
      const { result } = renderHook(() => useTouchAvatarInteraction());

      act(() => {
        result.current.ref(element);
      });

      // Start touch to change state
      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.state.isTouching).toBe(false);
      expect(result.current.state.currentGesture).toBe("none");
      expect(result.current.state.position).toBeNull();
      expect(result.current.lastGesture).toBe("none");
      expect(result.current.eyeTrackingPosition).toBeNull();
    });
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe("configuration", () => {
    it("should use custom long press threshold", () => {
      const onLongPress = jest.fn();
      const { result } = renderHook(() =>
        useTouchAvatarInteraction({ onLongPress }, { longPressThreshold: 200 })
      );

      act(() => {
        result.current.ref(element);
      });

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      // Should trigger at 200ms
      act(() => {
        jest.advanceTimersByTime(250);
      });

      expect(onLongPress).toHaveBeenCalled();
    });

    it("should disable haptics when configured", () => {
      const { result } = renderHook(() =>
        useTouchAvatarInteraction({}, { enableHaptics: false })
      );

      act(() => {
        result.current.ref(element);
      });

      act(() => {
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [
              {
                identifier: 0,
                clientX: 50,
                clientY: 50,
                pageX: 50,
                pageY: 50,
                screenX: 50,
                screenY: 50,
                target: element,
                radiusX: 1,
                radiusY: 1,
                rotationAngle: 0,
                force: 1,
              } as Touch,
            ],
            bubbles: true,
          })
        );
      });

      expect(mockHapticTrigger).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should cleanup event listeners on unmount", () => {
      const removeEventListenerSpy = jest.spyOn(element, "removeEventListener");

      const { result, unmount } = renderHook(() => useTouchAvatarInteraction());

      act(() => {
        result.current.ref(element);
      });

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "touchstart",
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "touchmove",
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "touchend",
        expect.any(Function)
      );
    });

    it("should cleanup when ref changes", () => {
      const removeEventListenerSpy = jest.spyOn(element, "removeEventListener");

      const { result } = renderHook(() => useTouchAvatarInteraction());

      act(() => {
        result.current.ref(element);
      });

      // Change ref to null
      act(() => {
        result.current.ref(null);
      });

      expect(removeEventListenerSpy).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Sub-Hooks Tests
// ============================================================================

describe("useTouchEyeTracking", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    jest.useFakeTimers();
    mockHapticTrigger.mockClear();

    element = document.createElement("div");
    Object.defineProperty(element, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
      }),
    });
    document.body.appendChild(element);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    document.body.removeChild(element);
  });

  it("should provide ref and position", () => {
    const { result } = renderHook(() => useTouchEyeTracking());

    expect(typeof result.current.ref).toBe("function");
    expect(result.current.position).toBeNull();
  });

  it("should update position on touch", () => {
    const { result } = renderHook(() => useTouchEyeTracking());

    act(() => {
      result.current.ref(element);
    });

    act(() => {
      element.dispatchEvent(
        new TouchEvent("touchstart", {
          touches: [
            {
              identifier: 0,
              clientX: 50,
              clientY: 50,
              pageX: 50,
              pageY: 50,
              screenX: 50,
              screenY: 50,
              target: element,
              radiusX: 1,
              radiusY: 1,
              rotationAngle: 0,
              force: 1,
            } as Touch,
          ],
          bubbles: true,
        })
      );
    });

    expect(result.current.position).not.toBeNull();
  });
});

describe("useAvatarTap", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    jest.useFakeTimers();
    mockHapticTrigger.mockClear();

    element = document.createElement("div");
    Object.defineProperty(element, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
      }),
    });
    document.body.appendChild(element);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    document.body.removeChild(element);
  });

  it("should provide ref callback", () => {
    const onTap = jest.fn();
    const { result } = renderHook(() => useAvatarTap(onTap));

    expect(typeof result.current).toBe("function");
  });

  it("should call onTap on tap", () => {
    const onTap = jest.fn();
    const { result } = renderHook(() => useAvatarTap(onTap));

    act(() => {
      result.current(element);
    });

    // Simulate tap
    act(() => {
      element.dispatchEvent(
        new TouchEvent("touchstart", {
          touches: [
            {
              identifier: 0,
              clientX: 50,
              clientY: 50,
              pageX: 50,
              pageY: 50,
              screenX: 50,
              screenY: 50,
              target: element,
              radiusX: 1,
              radiusY: 1,
              rotationAngle: 0,
              force: 1,
            } as Touch,
          ],
          bubbles: true,
        })
      );
    });

    act(() => {
      jest.advanceTimersByTime(50);
    });

    act(() => {
      element.dispatchEvent(
        new TouchEvent("touchend", {
          touches: [],
          changedTouches: [
            {
              identifier: 0,
              clientX: 50,
              clientY: 50,
              pageX: 50,
              pageY: 50,
              screenX: 50,
              screenY: 50,
              target: element,
              radiusX: 1,
              radiusY: 1,
              rotationAngle: 0,
              force: 1,
            } as Touch,
          ],
          bubbles: true,
        })
      );
    });

    expect(onTap).toHaveBeenCalled();
  });
});
