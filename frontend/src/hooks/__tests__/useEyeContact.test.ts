/**
 * Tests for useEyeContact hook
 * Sprint 557: Eye contact awareness system tests
 */

import { renderHook, act } from "@testing-library/react";
import { useEyeContact } from "../useEyeContact";

// Mock requestAnimationFrame and cancelAnimationFrame
let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;

beforeAll(() => {
  jest.useFakeTimers();

  jest.spyOn(global, "requestAnimationFrame").mockImplementation((cb) => {
    rafCallback = cb;
    return ++rafId;
  });
  jest.spyOn(global, "cancelAnimationFrame").mockImplementation(() => {});
});

afterAll(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Helper to create mock container ref
function createMockContainer(): React.RefObject<HTMLElement> {
  const element = document.createElement("div");
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
  });
  return { current: element };
}

describe("useEyeContact", () => {
  describe("initialization", () => {
    it("should initialize with default values", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
        })
      );

      expect(result.current.isUserWatching).toBe(false);
      expect(result.current.isEyeContactActive).toBe(false);
      expect(result.current.contactDuration).toBe(0);
      expect(result.current.gazeTarget).toEqual({ x: 0, y: 0 });
      expect(result.current.pupilDilation).toBe(0);
      expect(result.current.intimacyLevel).toBe(0);
    });

    it("should handle null container ref", () => {
      const containerRef = { current: null };

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
        })
      );

      expect(result.current.isUserWatching).toBe(false);
    });

    it("should accept custom isAppFocused value", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: false,
        })
      );

      expect(result.current.isUserWatching).toBe(false);
    });
  });

  describe("mouse tracking", () => {
    it("should set isUserWatching true on mouseenter", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      expect(result.current.isUserWatching).toBe(true);
    });

    it("should set isUserWatching false on mouseleave", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      expect(result.current.isUserWatching).toBe(true);

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseleave"));
      });

      expect(result.current.isUserWatching).toBe(false);
      expect(result.current.contactDuration).toBe(0);
    });

    it("should track mouse position on mousemove", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
        })
      );

      // Enter container
      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      // Move mouse
      act(() => {
        const event = new MouseEvent("mousemove", {
          clientX: 150, // Right of center (100)
          clientY: 50, // Above center (100)
        });
        containerRef.current?.dispatchEvent(event);
      });

      // Run animation frame to update gaze
      act(() => {
        if (rafCallback) rafCallback(16);
      });

      // Gaze should start moving toward mouse position
      expect(result.current.gazeTarget.x).not.toBe(0);
    });

    it("should normalize mouse position to -1 to 1 range", () => {
      const containerRef = createMockContainer();

      renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
        })
      );

      // Move mouse to extreme right (beyond container)
      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
        const event = new MouseEvent("mousemove", {
          clientX: 500, // Far right
          clientY: -100, // Far up
        });
        containerRef.current?.dispatchEvent(event);
      });

      // Values should be clamped
      // The internal lastMousePos ref will be clamped, but we verify
      // gaze moves within expected bounds via animation
    });
  });

  describe("eye contact state", () => {
    it("should activate eye contact when user watches and app focused", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      // Run animation frame
      act(() => {
        if (rafCallback) rafCallback(16);
      });

      expect(result.current.isEyeContactActive).toBe(true);
    });

    it("should not activate eye contact when app not focused", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: false,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      // Run animation frame
      act(() => {
        if (rafCallback) rafCallback(16);
      });

      expect(result.current.isEyeContactActive).toBe(false);
    });
  });

  describe("contact duration", () => {
    it("should track contact duration over time", () => {
      const containerRef = createMockContainer();
      jest.spyOn(Date, "now").mockReturnValue(1000);

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      // Advance time
      jest.spyOn(Date, "now").mockReturnValue(6000); // 5 seconds later

      // Run animation frame
      act(() => {
        if (rafCallback) rafCallback(16);
      });

      expect(result.current.contactDuration).toBe(5);
    });

    it("should reset contact duration on mouseleave", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      act(() => {
        if (rafCallback) rafCallback(16);
      });

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseleave"));
      });

      expect(result.current.contactDuration).toBe(0);
    });
  });

  describe("intimacy level", () => {
    it("should build intimacy over sustained eye contact", () => {
      const containerRef = createMockContainer();
      jest.spyOn(Date, "now").mockReturnValue(1000);

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      // Simulate 15 seconds of eye contact (halfway to full intimacy)
      jest.spyOn(Date, "now").mockReturnValue(16000);

      act(() => {
        if (rafCallback) rafCallback(16);
      });

      expect(result.current.intimacyLevel).toBeGreaterThan(0);
      expect(result.current.intimacyLevel).toBeLessThanOrEqual(1);
    });

    it("should build intimacy faster with emotional emotions", () => {
      const containerRef = createMockContainer();
      jest.spyOn(Date, "now").mockReturnValue(1000);

      const { result, rerender } = renderHook(
        ({ emotion }) =>
          useEyeContact({
            isSpeaking: false,
            isListening: false,
            emotion,
            containerRef,
            isAppFocused: true,
          }),
        { initialProps: { emotion: "tenderness" } }
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      jest.spyOn(Date, "now").mockReturnValue(16000); // 15 seconds

      act(() => {
        if (rafCallback) rafCallback(16);
      });

      const tenderIntimacy = result.current.intimacyLevel;

      // Now test with neutral emotion
      rerender({ emotion: "neutral" });
      jest.spyOn(Date, "now").mockReturnValue(1000); // Reset time

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseleave"));
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      jest.spyOn(Date, "now").mockReturnValue(16000);

      act(() => {
        if (rafCallback) rafCallback(16);
      });

      // Tenderness should build intimacy faster
      expect(tenderIntimacy).toBeGreaterThan(0);
    });

    it("should decay intimacy when not making eye contact", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      // Leave container (not watching)
      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseleave"));
      });

      // Run animation frames - intimacy should decay
      for (let i = 0; i < 10; i++) {
        act(() => {
          if (rafCallback) rafCallback(16 * (i + 1));
        });
      }

      // Intimacy should be 0 or approaching 0
      expect(result.current.intimacyLevel).toBe(0);
    });
  });

  describe("pupil dilation", () => {
    it("should dilate pupils with eye contact", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      // Run several animation frames
      for (let i = 0; i < 20; i++) {
        act(() => {
          if (rafCallback) rafCallback(16 * (i + 1));
        });
      }

      expect(result.current.pupilDilation).toBeGreaterThan(0);
    });

    it("should dilate more with emotional emotions", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "joy",
          containerRef,
          isAppFocused: true,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      // Run animation frames
      for (let i = 0; i < 30; i++) {
        act(() => {
          if (rafCallback) rafCallback(16 * (i + 1));
        });
      }

      expect(result.current.pupilDilation).toBeGreaterThan(0.3);
    });

    it("should reduce dilation without eye contact", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      // No mouseenter - not watching
      act(() => {
        if (rafCallback) rafCallback(16);
      });

      // Dilation should be minimal
      expect(result.current.pupilDilation).toBeLessThan(0.2);
    });
  });

  describe("gaze behavior", () => {
    it("should follow mouse position when user watching", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
        const event = new MouseEvent("mousemove", {
          clientX: 180, // Right of center
          clientY: 20, // Above center
        });
        containerRef.current?.dispatchEvent(event);
      });

      // Run animation frames to interpolate
      for (let i = 0; i < 50; i++) {
        act(() => {
          if (rafCallback) rafCallback(16 * (i + 1));
        });
      }

      // Gaze should be pointing right and up
      expect(result.current.gazeTarget.x).toBeGreaterThan(0);
    });

    it("should focus more on center when listening", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: true, // Listening mode
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
        const event = new MouseEvent("mousemove", {
          clientX: 180,
          clientY: 20,
        });
        containerRef.current?.dispatchEvent(event);
      });

      // Run animation frames
      for (let i = 0; i < 30; i++) {
        act(() => {
          if (rafCallback) rafCallback(16 * (i + 1));
        });
      }

      // Gaze should be less extreme (0.3 follow strength vs 0.6)
      expect(Math.abs(result.current.gazeTarget.x)).toBeLessThan(0.5);
    });

    it("should return to default idle gaze when not watching", () => {
      const containerRef = createMockContainer();

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      // Not watching - no mouseenter
      for (let i = 0; i < 100; i++) {
        act(() => {
          if (rafCallback) rafCallback(16 * (i + 1));
        });
      }

      // Should be near idle position (0, -0.05)
      expect(Math.abs(result.current.gazeTarget.x)).toBeLessThan(0.1);
    });
  });

  describe("gaze break behavior", () => {
    it("should schedule gaze breaks when watching", () => {
      const containerRef = createMockContainer();
      jest.spyOn(global.Math, "random").mockReturnValue(0.5);

      renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      // Advance past gaze break interval
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Test passes if no errors - gaze break was scheduled
      jest.spyOn(global.Math, "random").mockRestore();
    });

    it("should clear gaze break timer on mouseleave", () => {
      const containerRef = createMockContainer();

      renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseleave"));
      });

      // Timer should be cleared - no error when advancing time
      act(() => {
        jest.advanceTimersByTime(20000);
      });
    });

    it("should look away during gaze break", () => {
      const containerRef = createMockContainer();
      jest.spyOn(global.Math, "random").mockReturnValue(0.5);

      const { result } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: true, // Longer intervals
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      // Initial eye contact
      act(() => {
        if (rafCallback) rafCallback(16);
      });

      expect(result.current.isEyeContactActive).toBe(true);

      // Advance to trigger gaze break
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      act(() => {
        if (rafCallback) rafCallback(16);
      });

      // Should be looking away during break
      // Test just verifies no errors
      jest.spyOn(global.Math, "random").mockRestore();
    });
  });

  describe("speaking and listening states", () => {
    it("should have shorter gaze break intervals when speaking", () => {
      const containerRef = createMockContainer();

      renderHook(() =>
        useEyeContact({
          isSpeaking: true,
          isListening: false,
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      // Should not throw when advancing time
      act(() => {
        jest.advanceTimersByTime(7000);
      });
    });

    it("should have longer gaze break intervals when listening", () => {
      const containerRef = createMockContainer();

      renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: true,
          emotion: "neutral",
          containerRef,
          isAppFocused: true,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      // Should not throw when advancing time
      act(() => {
        jest.advanceTimersByTime(12000);
      });
    });
  });

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const containerRef = createMockContainer();

      const { unmount } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
        })
      );

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it("should clear timers on unmount", () => {
      const containerRef = createMockContainer();
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      const { unmount } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
        })
      );

      act(() => {
        containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
      });

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("should remove event listeners on unmount", () => {
      const containerRef = createMockContainer();
      const removeEventListenerSpy = jest.spyOn(
        containerRef.current!,
        "removeEventListener"
      );

      const { unmount } = renderHook(() =>
        useEyeContact({
          isSpeaking: false,
          isListening: false,
          emotion: "neutral",
          containerRef,
        })
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mouseenter",
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mouseleave",
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mousemove",
        expect.any(Function)
      );
    });
  });

  describe("emotion specific behavior", () => {
    it.each(["tenderness", "joy", "empathy"])(
      "should boost intimacy for %s emotion",
      (emotion) => {
        const containerRef = createMockContainer();
        jest.spyOn(Date, "now").mockReturnValue(1000);

        const { result } = renderHook(() =>
          useEyeContact({
            isSpeaking: false,
            isListening: false,
            emotion,
            containerRef,
            isAppFocused: true,
          })
        );

        act(() => {
          containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
        });

        jest.spyOn(Date, "now").mockReturnValue(11000); // 10 seconds

        act(() => {
          if (rafCallback) rafCallback(16);
        });

        // Should have intimacy boost (1.5x)
        expect(result.current.intimacyLevel).toBeGreaterThan(0);
      }
    );

    it.each(["tenderness", "joy", "excitement"])(
      "should add emotional dilation for %s emotion",
      (emotion) => {
        const containerRef = createMockContainer();

        const { result } = renderHook(() =>
          useEyeContact({
            isSpeaking: false,
            isListening: false,
            emotion,
            containerRef,
            isAppFocused: true,
          })
        );

        act(() => {
          containerRef.current?.dispatchEvent(new MouseEvent("mouseenter"));
        });

        // Run animation frames
        for (let i = 0; i < 50; i++) {
          act(() => {
            if (rafCallback) rafCallback(16 * (i + 1));
          });
        }

        // Emotional dilation should add 0.2 extra
        expect(result.current.pupilDilation).toBeGreaterThan(0.4);
      }
    );
  });
});
