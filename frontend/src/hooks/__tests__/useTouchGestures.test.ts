/**
 * useTouchGestures Tests - Sprint 532
 *
 * Tests for mobile touch gesture detection including swipe, tap,
 * long press, and pinch gestures.
 */

import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import {
  useTouchGestures,
  useSwipe,
  usePullToRefresh,
} from "../useTouchGestures";

// Mock Date.now for consistent timing
let mockTime = 1000;
const originalDateNow = Date.now;

beforeEach(() => {
  mockTime = 1000;
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  Date.now = originalDateNow;
  jest.restoreAllMocks();
});

// Helper to create mock touch list
function createMockTouchList(
  touches: Array<{ clientX: number; clientY: number }>
): TouchList {
  const touchList = touches.map(
    (t, i) =>
      ({
        clientX: t.clientX,
        clientY: t.clientY,
        identifier: i,
        target: document.createElement("div"),
        pageX: t.clientX,
        pageY: t.clientY,
        screenX: t.clientX,
        screenY: t.clientY,
        radiusX: 0,
        radiusY: 0,
        rotationAngle: 0,
        force: 1,
      }) as Touch
  );

  // Create array-like object with numeric indices
  const list: Record<number | string, unknown> = {
    length: touchList.length,
    item: (index: number) => touchList[index] || null,
    [Symbol.iterator]: function* () {
      for (const touch of touchList) yield touch;
    },
  };

  // Add numeric indices for array access
  touchList.forEach((touch, i) => {
    list[i] = touch;
  });

  return list as unknown as TouchList;
}

// Helper to create mock touch events
function createTouchEvent(
  type: string,
  touches: Array<{ clientX: number; clientY: number }>,
  changedTouches?: Array<{ clientX: number; clientY: number }>
): TouchEvent {
  return {
    type,
    touches: createMockTouchList(touches),
    changedTouches: createMockTouchList(changedTouches ?? touches),
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as TouchEvent;
}

// Wrapper component for testing hooks with ref
function createTestRef(): React.RefObject<HTMLElement> {
  const element = document.createElement("div");
  return { current: element };
}

describe("useTouchGestures", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const ref = createTestRef();
      const callbacks = {};

      const { result } = renderHook(() => useTouchGestures(ref, callbacks));

      expect(result.current.isSwiping).toBe(false);
      expect(result.current.isLongPressing).toBe(false);
      expect(result.current.isPinching).toBe(false);
      expect(result.current.swipeDirection).toBeNull();
    });

    it("should attach event listeners to element", () => {
      const ref = createTestRef();
      const addEventListenerSpy = jest.spyOn(ref.current!, "addEventListener");

      renderHook(() => useTouchGestures(ref, {}));

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "touchstart",
        expect.any(Function),
        { passive: true }
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "touchmove",
        expect.any(Function),
        { passive: true }
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "touchend",
        expect.any(Function),
        { passive: true }
      );
    });

    it("should not attach listeners when disabled", () => {
      const ref = createTestRef();
      const addEventListenerSpy = jest.spyOn(ref.current!, "addEventListener");

      renderHook(() => useTouchGestures(ref, {}, { enabled: false }));

      expect(addEventListenerSpy).not.toHaveBeenCalled();
    });
  });

  describe("tap detection", () => {
    it("should detect single tap", () => {
      const ref = createTestRef();
      const onTap = jest.fn();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchEndHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchend") {
          touchEndHandler = handler as (e: TouchEvent) => void;
        }
      });

      renderHook(() => useTouchGestures(ref, { onTap }));

      // Simulate tap (small movement, quick release)
      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      });

      mockTime += 50; // 50ms later

      act(() => {
        touchEndHandler(createTouchEvent("touchend", [], [{ clientX: 102, clientY: 102 }]));
      });

      expect(onTap).toHaveBeenCalledWith({ x: 102, y: 102 });
    });

    it("should detect double tap", () => {
      const ref = createTestRef();
      const onDoubleTap = jest.fn();
      const onTap = jest.fn();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchEndHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchend") {
          touchEndHandler = handler as (e: TouchEvent) => void;
        }
      });

      renderHook(() => useTouchGestures(ref, { onTap, onDoubleTap }));

      // First tap
      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      });
      mockTime += 50;
      act(() => {
        touchEndHandler(createTouchEvent("touchend", [], [{ clientX: 100, clientY: 100 }]));
      });

      // Second tap within doubleTapDelay (300ms default)
      mockTime += 100;
      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      });
      mockTime += 50;
      act(() => {
        touchEndHandler(createTouchEvent("touchend", [], [{ clientX: 100, clientY: 100 }]));
      });

      expect(onDoubleTap).toHaveBeenCalledWith({ x: 100, y: 100 });
    });
  });

  describe("swipe detection", () => {
    it("should detect swipe right", () => {
      const ref = createTestRef();
      const onSwipe = jest.fn();
      const onSwipeRight = jest.fn();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchEndHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchend") {
          touchEndHandler = handler as (e: TouchEvent) => void;
        }
      });

      renderHook(() => useTouchGestures(ref, { onSwipe, onSwipeRight }));

      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      });

      mockTime += 100; // 100ms swipe

      act(() => {
        touchEndHandler(createTouchEvent("touchend", [], [{ clientX: 200, clientY: 105 }]));
      });

      expect(onSwipeRight).toHaveBeenCalled();
      expect(onSwipe).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: "right",
          distance: expect.any(Number),
          velocity: expect.any(Number),
        })
      );
    });

    it("should detect swipe left", () => {
      const ref = createTestRef();
      const onSwipeLeft = jest.fn();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchEndHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchend") {
          touchEndHandler = handler as (e: TouchEvent) => void;
        }
      });

      renderHook(() => useTouchGestures(ref, { onSwipeLeft }));

      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 200, clientY: 100 }]));
      });

      mockTime += 100;

      act(() => {
        touchEndHandler(createTouchEvent("touchend", [], [{ clientX: 50, clientY: 105 }]));
      });

      expect(onSwipeLeft).toHaveBeenCalled();
    });

    it("should detect swipe up", () => {
      const ref = createTestRef();
      const onSwipeUp = jest.fn();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchEndHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchend") {
          touchEndHandler = handler as (e: TouchEvent) => void;
        }
      });

      renderHook(() => useTouchGestures(ref, { onSwipeUp }));

      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 200 }]));
      });

      mockTime += 100;

      act(() => {
        touchEndHandler(createTouchEvent("touchend", [], [{ clientX: 105, clientY: 50 }]));
      });

      expect(onSwipeUp).toHaveBeenCalled();
    });

    it("should detect swipe down", () => {
      const ref = createTestRef();
      const onSwipeDown = jest.fn();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchEndHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchend") {
          touchEndHandler = handler as (e: TouchEvent) => void;
        }
      });

      renderHook(() => useTouchGestures(ref, { onSwipeDown }));

      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 50 }]));
      });

      mockTime += 100;

      act(() => {
        touchEndHandler(createTouchEvent("touchend", [], [{ clientX: 105, clientY: 200 }]));
      });

      expect(onSwipeDown).toHaveBeenCalled();
    });

    it("should update swipe state during movement", () => {
      const ref = createTestRef();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchMoveHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchmove") {
          touchMoveHandler = handler as (e: TouchEvent) => void;
        }
      });

      const { result } = renderHook(() => useTouchGestures(ref, {}));

      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      });

      act(() => {
        touchMoveHandler(createTouchEvent("touchmove", [{ clientX: 150, clientY: 100 }]));
      });

      expect(result.current.isSwiping).toBe(true);
      expect(result.current.swipeDirection).toBe("right");
    });

    it("should not trigger swipe if distance below threshold", () => {
      const ref = createTestRef();
      const onSwipe = jest.fn();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchEndHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchend") {
          touchEndHandler = handler as (e: TouchEvent) => void;
        }
      });

      // Default swipeThreshold is 50px
      renderHook(() => useTouchGestures(ref, { onSwipe }));

      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      });

      mockTime += 100;

      act(() => {
        // Only 30px movement, below 50px threshold
        touchEndHandler(createTouchEvent("touchend", [], [{ clientX: 130, clientY: 100 }]));
      });

      expect(onSwipe).not.toHaveBeenCalled();
    });
  });

  describe("long press detection", () => {
    it("should detect long press after delay", () => {
      const ref = createTestRef();
      const onLongPress = jest.fn();
      let touchStartHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
      });

      const { result } = renderHook(() =>
        useTouchGestures(ref, { onLongPress }, { longPressDelay: 500 })
      );

      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      });

      expect(result.current.isLongPressing).toBe(false);

      // Fast-forward past long press delay
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(onLongPress).toHaveBeenCalledWith({ x: 100, y: 100 });
      expect(result.current.isLongPressing).toBe(true);
    });

    it("should cancel long press on move", () => {
      const ref = createTestRef();
      const onLongPress = jest.fn();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchMoveHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchmove") {
          touchMoveHandler = handler as (e: TouchEvent) => void;
        }
      });

      renderHook(() => useTouchGestures(ref, { onLongPress }));

      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      });

      // Move before long press triggers
      act(() => {
        jest.advanceTimersByTime(200);
        touchMoveHandler(createTouchEvent("touchmove", [{ clientX: 150, clientY: 100 }]));
      });

      // Long press should be cancelled
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(onLongPress).not.toHaveBeenCalled();
    });
  });

  describe("pinch detection", () => {
    it("should detect pinch gesture", () => {
      const ref = createTestRef();
      const onPinch = jest.fn();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchMoveHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchmove") {
          touchMoveHandler = handler as (e: TouchEvent) => void;
        }
      });

      const { result } = renderHook(() => useTouchGestures(ref, { onPinch }));

      // Start with two fingers 100px apart
      act(() => {
        touchStartHandler(
          createTouchEvent("touchstart", [
            { clientX: 100, clientY: 100 },
            { clientX: 200, clientY: 100 },
          ])
        );
      });

      expect(result.current.isPinching).toBe(true);

      // Move fingers to 200px apart (zoom in)
      act(() => {
        touchMoveHandler(
          createTouchEvent("touchmove", [
            { clientX: 50, clientY: 100 },
            { clientX: 250, clientY: 100 },
          ])
        );
      });

      expect(onPinch).toHaveBeenCalledWith(
        expect.objectContaining({
          scale: 2, // 200px / 100px = 2
          center: { x: 150, y: 100 },
        })
      );
    });

    it("should reset pinch state on touch end", () => {
      const ref = createTestRef();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchEndHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchend") {
          touchEndHandler = handler as (e: TouchEvent) => void;
        }
      });

      const { result } = renderHook(() => useTouchGestures(ref, {}));

      act(() => {
        touchStartHandler(
          createTouchEvent("touchstart", [
            { clientX: 100, clientY: 100 },
            { clientX: 200, clientY: 100 },
          ])
        );
      });

      expect(result.current.isPinching).toBe(true);

      act(() => {
        touchEndHandler(createTouchEvent("touchend", []));
      });

      expect(result.current.isPinching).toBe(false);
    });
  });

  describe("custom options", () => {
    it("should respect custom swipe threshold", () => {
      const ref = createTestRef();
      const onSwipe = jest.fn();
      let touchStartHandler: (e: TouchEvent) => void;
      let touchEndHandler: (e: TouchEvent) => void;

      jest.spyOn(ref.current!, "addEventListener").mockImplementation((
        event: string,
        handler: EventListenerOrEventListenerObject
      ) => {
        if (event === "touchstart") {
          touchStartHandler = handler as (e: TouchEvent) => void;
        }
        if (event === "touchend") {
          touchEndHandler = handler as (e: TouchEvent) => void;
        }
      });

      renderHook(() =>
        useTouchGestures(ref, { onSwipe }, { swipeThreshold: 200 })
      );

      act(() => {
        touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      });

      mockTime += 50;

      // 100px movement (less than 200px threshold)
      act(() => {
        touchEndHandler(createTouchEvent("touchend", [], [{ clientX: 200, clientY: 100 }]));
      });

      expect(onSwipe).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should remove event listeners on unmount", () => {
      const ref = createTestRef();
      const removeEventListenerSpy = jest.spyOn(ref.current!, "removeEventListener");

      const { unmount } = renderHook(() => useTouchGestures(ref, {}));

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
  });
});

describe("useSwipe", () => {
  it("should provide simplified swipe interface", () => {
    const ref = createTestRef();
    const onSwipe = jest.fn();
    let touchStartHandler: (e: TouchEvent) => void;
    let touchEndHandler: (e: TouchEvent) => void;

    jest.spyOn(ref.current!, "addEventListener").mockImplementation((
      event: string,
      handler: EventListenerOrEventListenerObject
    ) => {
      if (event === "touchstart") {
        touchStartHandler = handler as (e: TouchEvent) => void;
      }
      if (event === "touchend") {
        touchEndHandler = handler as (e: TouchEvent) => void;
      }
    });

    renderHook(() => useSwipe(ref, onSwipe));

    act(() => {
      touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
    });

    mockTime += 100;

    act(() => {
      touchEndHandler(createTouchEvent("touchend", [], [{ clientX: 200, clientY: 100 }]));
    });

    expect(onSwipe).toHaveBeenCalledWith("right");
  });

  it("should return gesture state", () => {
    const ref = createTestRef();
    const onSwipe = jest.fn();

    const { result } = renderHook(() => useSwipe(ref, onSwipe));

    expect(result.current.isSwiping).toBe(false);
    expect(result.current.swipeDirection).toBeNull();
  });
});

describe("usePullToRefresh", () => {
  it("should initialize with default state", () => {
    const ref = createTestRef();
    const onRefresh = jest.fn();

    const { result } = renderHook(() => usePullToRefresh(ref, onRefresh));

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.progress).toBe(0);
  });

  it("should track pull progress", () => {
    const ref = createTestRef();
    // Set scrollTop to 0 to enable pull-to-refresh
    Object.defineProperty(ref.current, "scrollTop", {
      value: 0,
      writable: true,
    });

    const onRefresh = jest.fn();
    let touchStartHandler: (e: TouchEvent) => void;
    let touchMoveHandler: (e: TouchEvent) => void;

    jest.spyOn(ref.current!, "addEventListener").mockImplementation((
      event: string,
      handler: EventListenerOrEventListenerObject
    ) => {
      if (event === "touchstart") {
        touchStartHandler = handler as (e: TouchEvent) => void;
      }
      if (event === "touchmove") {
        touchMoveHandler = handler as (e: TouchEvent) => void;
      }
    });

    const { result } = renderHook(() =>
      usePullToRefresh(ref, onRefresh, { threshold: 100 })
    );

    act(() => {
      touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 50 }]));
    });

    act(() => {
      touchMoveHandler(createTouchEvent("touchmove", [{ clientX: 100, clientY: 100 }]));
    });

    // 50px pulled out of 100px threshold = 50% progress
    expect(result.current.progress).toBe(0.5);
  });

  it("should trigger refresh at threshold", async () => {
    const ref = createTestRef();
    Object.defineProperty(ref.current, "scrollTop", {
      value: 0,
      writable: true,
    });

    const onRefresh = jest.fn().mockResolvedValue(undefined);
    let touchStartHandler: (e: TouchEvent) => void;
    let touchMoveHandler: (e: TouchEvent) => void;
    let touchEndHandler: (e: TouchEvent) => void;

    jest.spyOn(ref.current!, "addEventListener").mockImplementation((
      event: string,
      handler: EventListenerOrEventListenerObject
    ) => {
      if (event === "touchstart") {
        touchStartHandler = handler as (e: TouchEvent) => void;
      }
      if (event === "touchmove") {
        touchMoveHandler = handler as (e: TouchEvent) => void;
      }
      if (event === "touchend") {
        touchEndHandler = handler as (e: TouchEvent) => void;
      }
    });

    const { result } = renderHook(() =>
      usePullToRefresh(ref, onRefresh, { threshold: 80 })
    );

    act(() => {
      touchStartHandler(createTouchEvent("touchstart", [{ clientX: 100, clientY: 50 }]));
    });

    act(() => {
      touchMoveHandler(createTouchEvent("touchmove", [{ clientX: 100, clientY: 150 }]));
    });

    // Progress should be 1 (100px > 80px threshold)
    expect(result.current.progress).toBe(1);

    await act(async () => {
      touchEndHandler(createTouchEvent("touchend", []));
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalled();
  });

  it("should not attach listeners when disabled", () => {
    const ref = createTestRef();
    const addEventListenerSpy = jest.spyOn(ref.current!, "addEventListener");
    const onRefresh = jest.fn();

    renderHook(() => usePullToRefresh(ref, onRefresh, { enabled: false }));

    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });
});
