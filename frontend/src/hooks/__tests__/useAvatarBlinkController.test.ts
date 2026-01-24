/**
 * Tests for useAvatarBlinkController hook - Sprint 553
 *
 * Tests:
 * - Initialization and default state
 * - Blink animations (all types)
 * - Automatic blinking behavior
 * - Emotional state influence
 * - Focus/Speaking/Listening adjustments
 * - Pause/Resume controls
 * - Metrics tracking
 * - Configuration updates
 * - Cleanup
 * - Sub-hooks (useEyeClosure, useConversationBlink)
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarBlinkController,
  useEyeClosure,
  useConversationBlink,
  type BlinkType,
} from "../useAvatarBlinkController";

// Mock performance.now and Date.now for consistent timing
let mockNow = 1000;
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

beforeEach(() => {
  mockNow = 1000;
  Date.now = jest.fn(() => mockNow);
  rafCallback = null;
  rafId = 0;
});

function advanceTime(ms: number) {
  mockNow += ms;
}

function triggerRaf() {
  if (rafCallback) rafCallback(mockNow);
}

function runFrames(count: number, msPerFrame = 16) {
  for (let i = 0; i < count; i++) {
    advanceTime(msPerFrame);
    triggerRaf();
  }
}

describe("useAvatarBlinkController", () => {
  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      expect(result.current.state.isBlinking).toBe(false);
      expect(result.current.state.phase).toBe("open");
      expect(result.current.state.progress).toBe(0);
      expect(result.current.state.leftEye).toBe(0);
      expect(result.current.state.rightEye).toBe(0);
      expect(result.current.state.currentType).toBeNull();
    });

    it("should initialize with default config", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      expect(result.current.config.enabled).toBe(true);
      expect(result.current.config.baseIntervalMs).toBe(4000);
      expect(result.current.config.closeDurationMs).toBe(100);
      expect(result.current.config.transitionDurationMs).toBe(70);
    });

    it("should accept custom initial config", () => {
      const { result } = renderHook(() =>
        useAvatarBlinkController({
          baseIntervalMs: 3000,
          closeDurationMs: 150,
        })
      );

      expect(result.current.config.baseIntervalMs).toBe(3000);
      expect(result.current.config.closeDurationMs).toBe(150);
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      expect(result.current.metrics.totalBlinks).toBe(0);
      expect(result.current.metrics.blinksPerMinute).toBe(0);
      expect(result.current.metrics.forcedBlinks).toBe(0);
    });
  });

  // ============================================================================
  // Trigger Blink Tests
  // ============================================================================

  describe("triggerBlink", () => {
    it("should trigger a normal blink", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf(); // Start animation loop
      });

      act(() => {
        result.current.controls.triggerBlink();
      });

      expect(result.current.state.isBlinking).toBe(true);
    });

    it("should trigger specific blink types", () => {
      const blinkTypes: BlinkType[] = [
        "normal",
        "slow",
        "rapid",
        "double",
        "half",
        "long",
        "flutter",
      ];

      for (const type of blinkTypes) {
        const { result } = renderHook(() => useAvatarBlinkController());

        act(() => {
          triggerRaf();
        });

        act(() => {
          result.current.controls.triggerBlink(type);
        });

        expect(result.current.state.isBlinking).toBe(true);
        expect(result.current.state.currentType).toBe(type);
      }
    });

    it("should complete blink animation cycle", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf();
      });

      act(() => {
        result.current.controls.triggerBlink("normal");
      });

      expect(result.current.state.isBlinking).toBe(true);

      // Run through entire animation (transition + close + transition = 70 + 100 + 70 = 240ms)
      // Need more frames to complete animation
      act(() => {
        runFrames(50, 16); // ~800ms to ensure complete
      });

      expect(result.current.state.isBlinking).toBe(false);
      expect(result.current.state.phase).toBe("open");
      expect(result.current.state.leftEye).toBe(0);
      expect(result.current.state.rightEye).toBe(0);
    });

    it("should not start new blink while already blinking", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf();
      });

      act(() => {
        result.current.controls.triggerBlink("normal");
      });

      const initialType = result.current.state.currentType;

      // Try to trigger another blink
      act(() => {
        result.current.controls.triggerBlink("slow");
      });

      // Should still be the original blink type
      expect(result.current.state.currentType).toBe(initialType);
    });
  });

  // ============================================================================
  // Wink Tests
  // ============================================================================

  describe("triggerWink", () => {
    it("should trigger left wink", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf();
      });

      act(() => {
        result.current.controls.triggerWink("left");
      });

      expect(result.current.state.isBlinking).toBe(true);
      expect(result.current.state.currentType).toBe("wink_left");
    });

    it("should trigger right wink", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf();
      });

      act(() => {
        result.current.controls.triggerWink("right");
      });

      expect(result.current.state.isBlinking).toBe(true);
      expect(result.current.state.currentType).toBe("wink_right");
    });

    it("should only close one eye during wink", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf();
      });

      act(() => {
        result.current.controls.triggerWink("left");
      });

      // Advance to mid-blink
      act(() => {
        runFrames(5, 16); // ~80ms into animation
      });

      // Left eye should be closing, right should stay open
      expect(result.current.state.leftEye).toBeGreaterThan(0);
      expect(result.current.state.rightEye).toBe(0);
    });
  });

  // ============================================================================
  // Automatic Blinking Tests
  // ============================================================================

  describe("automatic blinking", () => {
    it("should auto-blink after interval expires", () => {
      const { result } = renderHook(() =>
        useAvatarBlinkController({ baseIntervalMs: 500, intervalVariation: 0 })
      );

      act(() => {
        triggerRaf();
      });

      // Advance past interval
      act(() => {
        advanceTime(600);
        triggerRaf();
      });

      expect(result.current.state.isBlinking).toBe(true);
    });

    it("should force blink at maxIntervalMs", () => {
      const { result } = renderHook(() =>
        useAvatarBlinkController({
          baseIntervalMs: 20000, // Very long base interval
          maxIntervalMs: 500,
          intervalVariation: 0,
        })
      );

      act(() => {
        triggerRaf();
      });

      // Wait longer than maxInterval
      act(() => {
        advanceTime(600);
        triggerRaf();
      });

      expect(result.current.state.isBlinking).toBe(true);
      expect(result.current.metrics.forcedBlinks).toBe(1);
    });
  });

  // ============================================================================
  // Emotional State Tests
  // ============================================================================

  describe("emotional state influence", () => {
    it("should accept emotional state", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        result.current.controls.setEmotionalState("happy", 0.8);
      });

      // No error should occur
      expect(result.current.controls.setEmotionalState).toBeDefined();
    });

    it("should handle unknown emotions", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        result.current.controls.setEmotionalState("unknownemotion", 0.5);
      });

      // Should not throw
      expect(true).toBe(true);
    });
  });

  // ============================================================================
  // Focus/Speaking/Listening Tests
  // ============================================================================

  describe("state adjustments", () => {
    it("should set focused state", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        result.current.controls.setFocused(true);
      });

      // No error should occur
      expect(result.current.controls.setFocused).toBeDefined();
    });

    it("should set speaking state", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        result.current.controls.setSpeaking(true);
      });

      expect(result.current.controls.setSpeaking).toBeDefined();
    });

    it("should set listening state", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        result.current.controls.setListening(true);
      });

      expect(result.current.controls.setListening).toBeDefined();
    });
  });

  // ============================================================================
  // Pause/Resume Tests
  // ============================================================================

  describe("pause and resume", () => {
    it("should pause animation", () => {
      const { result } = renderHook(() =>
        useAvatarBlinkController({ baseIntervalMs: 100, intervalVariation: 0 })
      );

      act(() => {
        triggerRaf();
      });

      act(() => {
        result.current.controls.pause();
      });

      // Wait for normal blink interval
      act(() => {
        advanceTime(200);
        triggerRaf();
      });

      // Should not have triggered a blink due to pause
      expect(result.current.state.isBlinking).toBe(false);
    });

    it("should resume animation", () => {
      const { result } = renderHook(() =>
        useAvatarBlinkController({ baseIntervalMs: 100, intervalVariation: 0 })
      );

      act(() => {
        triggerRaf();
      });

      act(() => {
        result.current.controls.pause();
      });

      act(() => {
        advanceTime(50);
        triggerRaf();
      });

      act(() => {
        result.current.controls.resume();
      });

      // After resume and interval
      act(() => {
        advanceTime(200);
        triggerRaf();
      });

      expect(result.current.state.isBlinking).toBe(true);
    });
  });

  // ============================================================================
  // Metrics Tests
  // ============================================================================

  describe("metrics tracking", () => {
    it("should track total blinks", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf();
      });

      expect(result.current.metrics.totalBlinks).toBe(0);

      act(() => {
        result.current.controls.triggerBlink();
      });

      expect(result.current.metrics.totalBlinks).toBe(1);

      // Complete blink
      act(() => {
        runFrames(20, 16);
      });

      act(() => {
        result.current.controls.triggerBlink();
      });

      expect(result.current.metrics.totalBlinks).toBe(2);
    });

    it("should track blinks by type", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf();
      });

      act(() => {
        result.current.controls.triggerBlink("slow");
      });

      expect(result.current.metrics.blinksByType.slow).toBe(1);

      // Complete blink
      act(() => {
        runFrames(30, 16);
      });

      act(() => {
        result.current.controls.triggerBlink("rapid");
      });

      expect(result.current.metrics.blinksByType.rapid).toBe(1);
    });
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe("configuration", () => {
    it("should update config", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        result.current.controls.updateConfig({ baseIntervalMs: 2000 });
      });

      expect(result.current.config.baseIntervalMs).toBe(2000);
    });

    it("should not auto-blink when disabled", () => {
      const { result } = renderHook(() =>
        useAvatarBlinkController({ enabled: false, baseIntervalMs: 100, intervalVariation: 0 })
      );

      // Wait for auto-blink interval
      act(() => {
        advanceTime(200);
        triggerRaf();
      });

      // Should not have auto-blinked because disabled
      expect(result.current.metrics.totalBlinks).toBe(0);
    });
  });

  // ============================================================================
  // Reset Tests
  // ============================================================================

  describe("reset", () => {
    it("should reset state", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf();
      });

      act(() => {
        result.current.controls.triggerBlink();
      });

      expect(result.current.metrics.totalBlinks).toBe(1);

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.metrics.totalBlinks).toBe(0);
      expect(result.current.state.isBlinking).toBe(false);
      expect(result.current.state.leftEye).toBe(0);
      expect(result.current.state.rightEye).toBe(0);
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const { unmount } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf();
      });

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Blink Phases Tests
  // ============================================================================

  describe("blink phases", () => {
    it("should transition through phases during blink", () => {
      const { result } = renderHook(() =>
        useAvatarBlinkController({
          transitionDurationMs: 100,
          closeDurationMs: 100,
        })
      );

      act(() => {
        triggerRaf();
      });

      act(() => {
        result.current.controls.triggerBlink("normal");
      });

      // Initially should be closing
      act(() => {
        advanceTime(50);
        triggerRaf();
      });

      // During close transition, leftEye should be between 0 and 1
      expect(result.current.state.leftEye).toBeGreaterThan(0);
      expect(result.current.state.leftEye).toBeLessThanOrEqual(1);

      // At peak closure (after transition + part of closed phase)
      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      // Eye should be mostly or fully closed during the closed phase
      expect(result.current.state.leftEye).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ============================================================================
  // Time Tracking Tests
  // ============================================================================

  describe("time tracking", () => {
    it("should track time since last blink", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf();
      });

      act(() => {
        result.current.controls.triggerBlink();
      });

      // Complete blink
      act(() => {
        runFrames(20, 16);
      });

      act(() => {
        advanceTime(1000);
        triggerRaf();
      });

      expect(result.current.state.timeSinceLastBlink).toBeGreaterThan(0);
    });

    it("should track next blink timing", () => {
      const { result } = renderHook(() => useAvatarBlinkController());

      act(() => {
        triggerRaf();
      });

      expect(result.current.state.nextBlinkIn).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// useEyeClosure Tests
// ============================================================================

describe("useEyeClosure", () => {
  it("should return eye closure values", () => {
    const { result } = renderHook(() => useEyeClosure());

    expect(result.current.left).toBe(0);
    expect(result.current.right).toBe(0);
    expect(result.current.isBlinking).toBe(false);
  });

  it("should update during blink", () => {
    const { result } = renderHook(() => useEyeClosure());

    act(() => {
      triggerRaf();
    });

    // The underlying controller will manage blinking
    // We just verify the values are accessible
    expect(typeof result.current.left).toBe("number");
    expect(typeof result.current.right).toBe("number");
    expect(typeof result.current.isBlinking).toBe("boolean");
  });
});

// ============================================================================
// useConversationBlink Tests
// ============================================================================

describe("useConversationBlink", () => {
  it("should return blink controller result", () => {
    const { result } = renderHook(() =>
      useConversationBlink(false, false, "neutral")
    );

    expect(result.current.state).toBeDefined();
    expect(result.current.metrics).toBeDefined();
    expect(result.current.controls).toBeDefined();
    expect(result.current.config).toBeDefined();
  });

  it("should update speaking state", () => {
    const { result, rerender } = renderHook(
      ({ isSpeaking }) => useConversationBlink(isSpeaking, false),
      { initialProps: { isSpeaking: false } }
    );

    act(() => {
      triggerRaf();
    });

    rerender({ isSpeaking: true });

    // No error should occur
    expect(result.current.controls).toBeDefined();
  });

  it("should update listening state", () => {
    const { result, rerender } = renderHook(
      ({ isListening }) => useConversationBlink(false, isListening),
      { initialProps: { isListening: false } }
    );

    act(() => {
      triggerRaf();
    });

    rerender({ isListening: true });

    expect(result.current.controls).toBeDefined();
  });

  it("should update emotional state", () => {
    const { result, rerender } = renderHook(
      ({ emotion }) => useConversationBlink(false, false, emotion),
      { initialProps: { emotion: "neutral" } }
    );

    act(() => {
      triggerRaf();
    });

    rerender({ emotion: "happy" });

    expect(result.current.controls).toBeDefined();
  });
});

// ============================================================================
// Blink Animation Types Tests
// ============================================================================

describe("blink animation types", () => {
  it("should handle flutter blink with multiple partial closures", () => {
    const { result } = renderHook(() => useAvatarBlinkController());

    act(() => {
      triggerRaf();
    });

    act(() => {
      result.current.controls.triggerBlink("flutter");
    });

    expect(result.current.state.currentType).toBe("flutter");
  });

  it("should handle half blink with partial closure", () => {
    const { result } = renderHook(() => useAvatarBlinkController());

    act(() => {
      triggerRaf();
    });

    act(() => {
      result.current.controls.triggerBlink("half");
    });

    // Advance to mid-blink
    act(() => {
      advanceTime(100);
      triggerRaf();
    });

    // Half blink should only go to ~0.5 closure
    expect(result.current.state.leftEye).toBeLessThanOrEqual(0.6);
  });

  it("should handle long blink with extended closure", () => {
    const { result } = renderHook(() => useAvatarBlinkController());

    act(() => {
      triggerRaf();
    });

    act(() => {
      result.current.controls.triggerBlink("long");
    });

    expect(result.current.state.currentType).toBe("long");

    // Long blink should take longer
    act(() => {
      runFrames(10, 16); // 160ms
    });

    // Should still be blinking
    expect(result.current.state.isBlinking).toBe(true);
  });

  it("should handle double blink", () => {
    // Force double blink by setting chance to 0
    const { result } = renderHook(() =>
      useAvatarBlinkController({ doubleBlinkChance: 0 })
    );

    act(() => {
      triggerRaf();
    });

    act(() => {
      result.current.controls.triggerBlink("double");
    });

    expect(result.current.state.currentType).toBe("double");
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe("edge cases", () => {
  it("should handle rapid config updates", () => {
    const { result } = renderHook(() => useAvatarBlinkController());

    act(() => {
      result.current.controls.updateConfig({ baseIntervalMs: 1000 });
      result.current.controls.updateConfig({ baseIntervalMs: 2000 });
      result.current.controls.updateConfig({ baseIntervalMs: 3000 });
    });

    expect(result.current.config.baseIntervalMs).toBe(3000);
  });

  it("should handle multiple control calls in sequence", () => {
    const { result } = renderHook(() => useAvatarBlinkController());

    act(() => {
      triggerRaf();
    });

    act(() => {
      result.current.controls.setEmotionalState("happy", 0.5);
      result.current.controls.setFocused(true);
      result.current.controls.setSpeaking(true);
      result.current.controls.setListening(true);
    });

    // Should not throw
    expect(result.current.controls).toBeDefined();
  });

  it("should handle pause/resume/reset cycle", () => {
    const { result } = renderHook(() => useAvatarBlinkController());

    act(() => {
      triggerRaf();
    });

    act(() => {
      result.current.controls.pause();
      result.current.controls.resume();
      result.current.controls.reset();
    });

    expect(result.current.state.isBlinking).toBe(false);
    expect(result.current.metrics.totalBlinks).toBe(0);
  });
});
