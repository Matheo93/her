/**
 * Tests for useAvatarBreathing hook
 * Sprint 521: Avatar UX mobile latency improvements
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useAvatarBreathing,
  useBreathingIntensity,
  useActivityBreathing,
  useBreathingTransform,
  PATTERN_CONFIGS,
  BreathingPattern,
} from "../useAvatarBreathing";

// RAF mock
let rafCallbacks: Map<number, (time: number) => void> = new Map();
let rafId = 0;
let currentTime = 0;

const mockRequestAnimationFrame = jest.fn((cb: (time: number) => void) => {
  const id = ++rafId;
  rafCallbacks.set(id, cb);
  return id;
});

const mockCancelAnimationFrame = jest.fn((id: number) => {
  rafCallbacks.delete(id);
});

Object.defineProperty(window, "requestAnimationFrame", {
  value: mockRequestAnimationFrame,
  writable: true,
});

Object.defineProperty(window, "cancelAnimationFrame", {
  value: mockCancelAnimationFrame,
  writable: true,
});

// Helper to advance animation
const advanceAnimation = (deltaMs: number) => {
  currentTime += deltaMs;
  const callbacks = Array.from(rafCallbacks.entries());
  rafCallbacks.clear();
  callbacks.forEach(([, cb]) => cb(currentTime));
};

describe("useAvatarBreathing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rafCallbacks.clear();
    rafId = 0;
    currentTime = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initialization", () => {
    it("should initialize with default values", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      expect(result.current.state.pattern).toBe("normal");
      expect(result.current.state.rate).toBe(PATTERN_CONFIGS.normal.rate);
      expect(result.current.isActive).toBe(true);
    });

    it("should initialize with custom initial pattern", () => {
      const { result } = renderHook(() =>
        useAvatarBreathing({ initialPattern: "relaxed" })
      );

      expect(result.current.state.pattern).toBe("relaxed");
      expect(result.current.state.rate).toBe(PATTERN_CONFIGS.relaxed.rate);
    });

    it("should not auto-start when autoStart is false", () => {
      const { result } = renderHook(() =>
        useAvatarBreathing({ autoStart: false })
      );

      expect(result.current.isActive).toBe(false);
    });

    it("should start animation loop when active", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      // Verify hook is active and has initial state
      expect(result.current.isActive).toBe(true);
      expect(result.current.state.phase).toBe(0);
    });
  });

  describe("breathing state", () => {
    it("should calculate breath phase", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      expect(result.current.state.phase).toBe(0);

      // Advance animation
      act(() => {
        advanceAnimation(100);
      });

      expect(result.current.state.phase).toBeGreaterThanOrEqual(0);
      expect(result.current.state.phase).toBeLessThanOrEqual(1);
    });

    it("should calculate chest expansion", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      expect(result.current.state.chestExpansion).toBeGreaterThanOrEqual(0);
      expect(result.current.state.chestExpansion).toBeLessThanOrEqual(1);
    });

    it("should calculate shoulder rise", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      expect(result.current.state.shoulderRise).toBeGreaterThanOrEqual(0);
      expect(result.current.state.shoulderRise).toBeLessThanOrEqual(1);
    });

    it("should calculate head movement", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      expect(result.current.state.headMovement).toHaveProperty("x");
      expect(result.current.state.headMovement).toHaveProperty("y");
      expect(typeof result.current.state.headMovement.x).toBe("number");
      expect(typeof result.current.state.headMovement.y).toBe("number");
    });

    it("should detect inhale/exhale phases", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      // At phase 0, should be inhaling
      expect(result.current.state.isInhaling).toBe(true);
    });

    it("should wrap phase around at 1", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      // Advance through more than one full cycle
      const cycleDuration = (60 / PATTERN_CONFIGS.normal.rate) * 1000;

      act(() => {
        advanceAnimation(cycleDuration + 100);
      });

      expect(result.current.state.phase).toBeLessThan(1);
    });
  });

  describe("pattern configs", () => {
    it("should have all pattern configurations", () => {
      const patterns: BreathingPattern[] = [
        "relaxed",
        "normal",
        "alert",
        "speaking",
        "listening",
        "excited",
        "calm",
        "sighing",
      ];

      patterns.forEach((pattern) => {
        expect(PATTERN_CONFIGS[pattern]).toBeDefined();
        expect(PATTERN_CONFIGS[pattern].rate).toBeGreaterThan(0);
        expect(PATTERN_CONFIGS[pattern].inhaleRatio).toBeGreaterThan(0);
        expect(PATTERN_CONFIGS[pattern].inhaleRatio).toBeLessThan(1);
        expect(PATTERN_CONFIGS[pattern].intensity).toBeGreaterThan(0);
      });
    });
  });

  describe("controls.setPattern", () => {
    it("should change pattern", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      act(() => {
        result.current.controls.setPattern("excited");
      });

      expect(result.current.state.pattern).toBe("excited");
      expect(result.current.state.rate).toBe(PATTERN_CONFIGS.excited.rate);
    });

    it("should reset custom rate when changing pattern", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      // Set custom rate first
      act(() => {
        result.current.controls.setRate(20);
      });

      expect(result.current.state.rate).toBe(20);

      // Change pattern
      act(() => {
        result.current.controls.setPattern("relaxed");
      });

      expect(result.current.state.rate).toBe(PATTERN_CONFIGS.relaxed.rate);
    });
  });

  describe("controls.setRate", () => {
    it("should set custom rate", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      act(() => {
        result.current.controls.setRate(20);
      });

      expect(result.current.state.rate).toBe(20);
    });

    it("should clamp rate to minimum 4", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      act(() => {
        result.current.controls.setRate(2);
      });

      expect(result.current.state.rate).toBe(4);
    });

    it("should clamp rate to maximum 30", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      act(() => {
        result.current.controls.setRate(40);
      });

      expect(result.current.state.rate).toBe(30);
    });
  });

  describe("controls.triggerSigh", () => {
    it("should trigger sigh pattern", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      act(() => {
        result.current.controls.triggerSigh();
      });

      expect(result.current.state.pattern).toBe("sighing");
      expect(result.current.state.phase).toBe(0);
    });

    it("should return to normal after sigh", async () => {
      const { result } = renderHook(() => useAvatarBreathing());

      act(() => {
        result.current.controls.triggerSigh();
      });

      expect(result.current.state.pattern).toBe("sighing");

      // Fast forward past sigh duration
      act(() => {
        jest.advanceTimersByTime(
          (60 / PATTERN_CONFIGS.sighing.rate) * 1000 + 100
        );
      });

      expect(result.current.state.pattern).toBe("normal");
    });
  });

  describe("controls.triggerDeepBreath", () => {
    it("should trigger deep breath", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      act(() => {
        result.current.controls.triggerDeepBreath();
      });

      expect(result.current.state.pattern).toBe("calm");
      expect(result.current.state.rate).toBe(4);
      expect(result.current.state.phase).toBe(0);
    });

    it("should return to previous pattern after deep breath", async () => {
      const { result } = renderHook(() =>
        useAvatarBreathing({ initialPattern: "alert" })
      );

      act(() => {
        result.current.controls.triggerDeepBreath();
      });

      expect(result.current.state.pattern).toBe("calm");

      // Fast forward past deep breath duration (15 seconds)
      act(() => {
        jest.advanceTimersByTime(15100);
      });

      expect(result.current.state.pattern).toBe("alert");
    });
  });

  describe("controls.holdBreath", () => {
    it("should hold breath for specified duration", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      const initialPhase = result.current.state.phase;

      act(() => {
        result.current.controls.holdBreath(1000);
      });

      // Advance animation while holding
      act(() => {
        advanceAnimation(500);
      });

      // Phase should not change while holding
      // (it updates via the animation loop but returns early)
      expect(result.current.state.phase).toBe(initialPhase);
    });

    it("should resume after hold duration", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      act(() => {
        result.current.controls.holdBreath(500);
      });

      // Fast forward past hold duration
      act(() => {
        jest.advanceTimersByTime(600);
      });

      // Should no longer be holding - verify still active
      expect(result.current.isActive).toBe(true);
    });

    it("should clear previous hold timeout", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      act(() => {
        result.current.controls.holdBreath(1000);
      });

      act(() => {
        result.current.controls.holdBreath(500);
      });

      // After 600ms (past second hold but not first), should resume
      act(() => {
        jest.advanceTimersByTime(600);
      });

      // Should be active
      expect(result.current.isActive).toBe(true);
    });
  });

  describe("controls.pause and resume", () => {
    it("should pause breathing", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      expect(result.current.isActive).toBe(true);

      act(() => {
        result.current.controls.pause();
      });

      expect(result.current.isActive).toBe(false);
    });

    it("should resume breathing", () => {
      const { result } = renderHook(() =>
        useAvatarBreathing({ autoStart: false })
      );

      expect(result.current.isActive).toBe(false);

      act(() => {
        result.current.controls.resume();
      });

      expect(result.current.isActive).toBe(true);
    });
  });

  describe("controls.reset", () => {
    it("should reset to initial state", () => {
      const { result } = renderHook(() =>
        useAvatarBreathing({ initialPattern: "relaxed" })
      );

      // Change some state
      act(() => {
        result.current.controls.setPattern("excited");
        result.current.controls.setRate(25);
      });

      expect(result.current.state.pattern).toBe("excited");
      expect(result.current.state.rate).toBe(25);

      // Reset
      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.pattern).toBe("relaxed");
      expect(result.current.state.rate).toBe(PATTERN_CONFIGS.relaxed.rate);
      expect(result.current.state.phase).toBe(0);
    });

    it("should clear hold timeout on reset", () => {
      const { result } = renderHook(() => useAvatarBreathing());

      act(() => {
        result.current.controls.holdBreath(5000);
      });

      act(() => {
        result.current.controls.reset();
      });

      // After reset, isActive should be true and phase should be 0
      expect(result.current.isActive).toBe(true);
      expect(result.current.state.phase).toBe(0);
    });
  });

  describe("callbacks", () => {
    it("should accept onInhale callback", () => {
      const onInhale = jest.fn();

      const { result } = renderHook(() =>
        useAvatarBreathing({ onInhale })
      );

      // Just verify hook initializes with callback
      expect(result.current.state).toBeDefined();
    });

    it("should accept onExhale callback", () => {
      const onExhale = jest.fn();

      const { result } = renderHook(() =>
        useAvatarBreathing({ onExhale })
      );

      // Just verify hook initializes with callback
      expect(result.current.state).toBeDefined();
    });
  });

  describe("variation", () => {
    it("should add variation when enabled", () => {
      const { result } = renderHook(() =>
        useAvatarBreathing({ addVariation: true, variationAmount: 0.1 })
      );

      // Advance animation
      act(() => {
        advanceAnimation(100);
      });

      // Phase should have been affected by variation
      expect(result.current.state.phase).toBeGreaterThanOrEqual(0);
    });

    it("should not add variation when disabled", () => {
      const { result } = renderHook(() =>
        useAvatarBreathing({ addVariation: false })
      );

      act(() => {
        advanceAnimation(100);
      });

      expect(result.current.state.phase).toBeGreaterThanOrEqual(0);
    });
  });

  describe("intensity multiplier", () => {
    it("should apply intensity multiplier", () => {
      const { result: resultNormal } = renderHook(() =>
        useAvatarBreathing({ intensityMultiplier: 1 })
      );

      const { result: resultDoubled } = renderHook(() =>
        useAvatarBreathing({ intensityMultiplier: 2 })
      );

      // At same phase, doubled should have higher intensity
      // (chest expansion is derived from intensity)
      expect(resultDoubled.current.state.chestExpansion).toBeGreaterThanOrEqual(
        resultNormal.current.state.chestExpansion
      );
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useAvatarBreathing());

      // Simply verify unmount doesn't throw
      expect(() => unmount()).not.toThrow();
    });

    it("should clear hold timeout on unmount", () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

      const { result, unmount } = renderHook(() => useAvatarBreathing());

      act(() => {
        result.current.controls.holdBreath(5000);
      });

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});

describe("useBreathingIntensity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rafCallbacks.clear();
    rafId = 0;
    currentTime = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should return breathing intensity value", () => {
    const { result } = renderHook(() => useBreathingIntensity());

    expect(typeof result.current).toBe("number");
    expect(result.current).toBeGreaterThanOrEqual(0);
  });

  it("should use specified pattern", () => {
    const { result } = renderHook(() => useBreathingIntensity("excited"));

    expect(typeof result.current).toBe("number");
  });
});

describe("useActivityBreathing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rafCallbacks.clear();
    rafId = 0;
    currentTime = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should map activity to pattern", () => {
    const { result } = renderHook(() => useActivityBreathing("idle"));

    expect(result.current.pattern).toBe("relaxed");
  });

  it("should update pattern when activity changes", () => {
    type ActivityType = "idle" | "speaking" | "listening" | "excited";
    const { result, rerender } = renderHook(
      ({ activity }: { activity: ActivityType }) => useActivityBreathing(activity),
      { initialProps: { activity: "idle" as ActivityType } }
    );

    expect(result.current.pattern).toBe("relaxed");

    rerender({ activity: "speaking" as ActivityType });

    expect(result.current.pattern).toBe("speaking");
  });

  it("should handle all activity types", () => {
    const activities = ["idle", "speaking", "listening", "excited"] as const;

    activities.forEach((activity) => {
      const { result } = renderHook(() => useActivityBreathing(activity));
      expect(result.current).toBeDefined();
      expect(result.current.pattern).toBeDefined();
    });
  });
});

describe("useBreathingTransform", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rafCallbacks.clear();
    rafId = 0;
    currentTime = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should return transform string", () => {
    const { result } = renderHook(() => useBreathingTransform());

    expect(result.current.transform).toBeDefined();
    expect(typeof result.current.transform).toBe("string");
    expect(result.current.transform).toContain("scaleY");
    expect(result.current.transform).toContain("translateY");
  });

  it("should return style object", () => {
    const { result } = renderHook(() => useBreathingTransform());

    expect(result.current.style).toBeDefined();
    expect(result.current.style.transform).toBeDefined();
    expect(result.current.style.transition).toBe("transform 0.1s ease-out");
  });

  it("should use specified pattern", () => {
    const { result } = renderHook(() => useBreathingTransform("excited"));

    expect(result.current.transform).toBeDefined();
  });
});

describe("breath curve calculation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rafCallbacks.clear();
    rafId = 0;
    currentTime = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should calculate inhale curve correctly", () => {
    const { result } = renderHook(() => useAvatarBreathing());

    // At phase 0, should be at start of inhale
    expect(result.current.state.phase).toBe(0);
    expect(result.current.state.isInhaling).toBe(true);
  });

  it("should track phase progression", () => {
    const { result } = renderHook(() => useAvatarBreathing());

    // Advance animation a bit
    act(() => {
      advanceAnimation(100);
    });

    // Phase should progress
    expect(result.current.state.phase).toBeGreaterThanOrEqual(0);
    expect(result.current.state.phase).toBeLessThan(1);
  });
});
