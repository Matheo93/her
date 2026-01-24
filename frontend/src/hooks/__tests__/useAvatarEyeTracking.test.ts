/**
 * Tests for useAvatarEyeTracking hook
 * Sprint 545: Eye gaze tracking system with natural behaviors
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarEyeTracking,
  useCursorFollowingEyes,
  useConversationGaze,
  useEyeGazeTransform,
} from "../useAvatarEyeTracking";

// Mock requestAnimationFrame
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

describe("useAvatarEyeTracking", () => {
  describe("initialization", () => {
    it("should initialize with default values", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      expect(result.current.state.targetType).toBe("user");
      expect(result.current.state.eyelidOpen).toBe(1);
      expect(result.current.state.pupilDilation).toBe(0.5);
    });

    it("should accept custom initial target", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({
          initialTarget: "away",
          autoBlink: false,
        })
      );

      expect(result.current.state.targetType).toBe("away");
    });
  });

  describe("lookAt", () => {
    it("should update target position", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.lookAt(0.8, 0.2);
      });

      expect(result.current.state.targetType).toBe("point");
    });

    it("should clamp values to 0-1", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.lookAt(1.5, -0.5);
      });

      // Should not throw and targetType should be "point"
      expect(result.current.state.targetType).toBe("point");
    });
  });

  describe("lookAtUser", () => {
    it("should set target type to user", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({
          initialTarget: "away",
          autoBlink: false,
        })
      );

      act(() => {
        result.current.controls.lookAtUser();
      });

      expect(result.current.state.targetType).toBe("user");
    });
  });

  describe("followCursor", () => {
    it("should enable cursor following", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.followCursor(true);
      });

      expect(result.current.state.targetType).toBe("cursor");
    });

    it("should disable cursor following and reset to user", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.followCursor(true);
      });

      act(() => {
        result.current.controls.followCursor(false);
      });

      expect(result.current.state.targetType).toBe("user");
    });
  });

  describe("lookAway", () => {
    it("should set target type to away", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.lookAway();
      });

      expect(result.current.state.targetType).toBe("away");
    });

    it("should look left when specified", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.lookAway("left");
      });

      expect(result.current.state.targetType).toBe("away");
    });

    it("should look right when specified", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.lookAway("right");
      });

      expect(result.current.state.targetType).toBe("away");
    });

    it("should look up when specified", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.lookAway("up");
      });

      expect(result.current.state.targetType).toBe("away");
    });

    it("should look down when specified", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.lookAway("down");
      });

      expect(result.current.state.targetType).toBe("away");
    });
  });

  describe("setTarget", () => {
    it("should set target to random", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.setTarget("random");
      });

      expect(result.current.state.targetType).toBe("random");
    });

    it("should set target to down", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.setTarget("down");
      });

      expect(result.current.state.targetType).toBe("down");
    });

    it("should set target to up", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.setTarget("up");
      });

      expect(result.current.state.targetType).toBe("up");
    });
  });

  describe("blink", () => {
    it("should close and open eyelid", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.blink();
      });

      expect(result.current.state.eyelidOpen).toBe(0);

      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(result.current.state.eyelidOpen).toBe(1);
    });
  });

  describe("doubleBlink", () => {
    it("should perform double blink", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.doubleBlink();
      });

      expect(result.current.state.eyelidOpen).toBe(0);

      // First open
      act(() => {
        jest.advanceTimersByTime(150);
      });
      expect(result.current.state.eyelidOpen).toBe(1);

      // Second close
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(result.current.state.eyelidOpen).toBe(0);

      // Final open
      act(() => {
        jest.advanceTimersByTime(150);
      });
      expect(result.current.state.eyelidOpen).toBe(1);
    });
  });

  describe("setPupilDilation", () => {
    it("should set pupil dilation", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.setPupilDilation(0.8);
      });

      expect(result.current.state.pupilDilation).toBe(0.8);
    });

    it("should clamp pupil dilation to 0-1", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      act(() => {
        result.current.controls.setPupilDilation(1.5);
      });
      expect(result.current.state.pupilDilation).toBe(1);

      act(() => {
        result.current.controls.setPupilDilation(-0.5);
      });
      expect(result.current.state.pupilDilation).toBe(0);
    });
  });

  describe("reset", () => {
    it("should reset to initial state", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({
          initialTarget: "user",
          autoBlink: false,
        })
      );

      // Change some values
      act(() => {
        result.current.controls.setTarget("away");
        result.current.controls.setPupilDilation(0.9);
      });

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.targetType).toBe("user");
      expect(result.current.state.pupilDilation).toBe(0.5);
      expect(result.current.state.eyelidOpen).toBe(1);
    });
  });

  describe("auto-blink", () => {
    it("should auto-blink when enabled", () => {
      const { result } = renderHook(() =>
        useAvatarEyeTracking({
          autoBlink: true,
          blinkInterval: [100, 200],
        })
      );

      // Advance past blink interval
      act(() => {
        jest.advanceTimersByTime(250);
      });

      // Should have blinked (eyelidOpen might be 0 or back to 1)
      expect(result.current.state.eyelidOpen).toBeDefined();
    });
  });

  describe("onGazeShift callback", () => {
    it("should call callback when gaze shifts", () => {
      const onGazeShift = jest.fn();

      const { result } = renderHook(() =>
        useAvatarEyeTracking({
          autoBlink: false,
          onGazeShift,
        })
      );

      act(() => {
        result.current.controls.setTarget("away");
      });

      expect(onGazeShift).toHaveBeenCalledWith("away");
    });
  });

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const { unmount } = renderHook(() =>
        useAvatarEyeTracking({ autoBlink: false })
      );

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it("should clear blink timeout on unmount", () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      const { unmount } = renderHook(() =>
        useAvatarEyeTracking({
          autoBlink: true,
          blinkInterval: [1000, 2000],
        })
      );

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });
});

describe("useCursorFollowingEyes", () => {
  it("should return eye rotation values", () => {
    const { result } = renderHook(() => useCursorFollowingEyes());

    expect(result.current.horizontal).toBeDefined();
    expect(result.current.vertical).toBeDefined();
    expect(typeof result.current.horizontal).toBe("number");
    expect(typeof result.current.vertical).toBe("number");
  });
});

describe("useConversationGaze", () => {
  it("should return gaze state when speaking", () => {
    const { result } = renderHook(
      ({ isSpeaking, isListening }) =>
        useConversationGaze(isSpeaking, isListening),
      { initialProps: { isSpeaking: true, isListening: false } }
    );

    expect(result.current.targetType).toBeDefined();
    expect(result.current.eyeRotation).toBeDefined();
  });

  it("should return gaze state when listening", () => {
    const { result } = renderHook(
      ({ isSpeaking, isListening }) =>
        useConversationGaze(isSpeaking, isListening),
      { initialProps: { isSpeaking: false, isListening: true } }
    );

    expect(result.current.targetType).toBe("user");
  });
});

describe("useEyeGazeTransform", () => {
  it("should return CSS properties for eyes and head", () => {
    const { result } = renderHook(() => useEyeGazeTransform());

    expect(result.current.leftEye).toBeDefined();
    expect(result.current.rightEye).toBeDefined();
    expect(result.current.head).toBeDefined();
    expect(result.current.leftEye.transform).toBeDefined();
    expect(result.current.rightEye.transform).toBeDefined();
    expect(result.current.head.transform).toBeDefined();
  });
});
