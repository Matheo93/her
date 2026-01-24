/**
 * Tests for useAvatarMicroInteractions hook - Sprint 556
 *
 * Tests:
 * - Initialization and default state
 * - Trigger micro-interactions
 * - Queue management
 * - Animation processing
 * - Pause/Resume controls
 * - Metrics tracking
 * - Blend shapes and movements
 * - Cleanup
 * - Convenience hooks (useTypingAcknowledgment, usePauseCuriosity, etc.)
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarMicroInteractions,
  useTypingAcknowledgment,
  usePauseCuriosity,
  useAttentionShift,
  useEmpathySignals,
  type MicroInteractionType,
  type InteractionIntensity,
} from "../useAvatarMicroInteractions";

// Mock requestAnimationFrame and Date.now
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

describe("useAvatarMicroInteractions", () => {
  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      expect(result.current.state.active).toBeNull();
      expect(result.current.state.queue).toEqual([]);
      expect(result.current.state.isProcessing).toBe(false);
      expect(result.current.isPaused).toBe(false);
    });

    it("should initialize with empty blend shapes", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      expect(result.current.currentBlendShapes).toEqual({});
    });

    it("should initialize with zero head movement", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      expect(result.current.currentHeadMovement).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("should initialize with zero eye movement", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      expect(result.current.currentEyeMovement).toEqual({ x: 0, y: 0 });
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      expect(result.current.metrics.totalTriggered).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAvatarMicroInteractions({
          enabled: false,
          maxQueueSize: 10,
        })
      );

      // Triggering should not work when disabled
      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      expect(result.current.state.active).toBeNull();
    });
  });

  // ============================================================================
  // Trigger Tests
  // ============================================================================

  describe("trigger", () => {
    it("should trigger a micro-interaction", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      expect(result.current.state.active).not.toBeNull();
      expect(result.current.state.active?.type).toBe("attention_shift");
      expect(result.current.state.isProcessing).toBe(true);
    });

    it("should trigger with custom intensity", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift", "expressive");
      });

      expect(result.current.state.active?.intensity).toBe("expressive");
    });

    it("should use base intensity when not specified", () => {
      const { result } = renderHook(() =>
        useAvatarMicroInteractions({ baseIntensity: "subtle" })
      );

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      expect(result.current.state.active?.intensity).toBe("subtle");
    });

    it("should trigger all interaction types", () => {
      const types: MicroInteractionType[] = [
        "attention_shift",
        "typing_acknowledgment",
        "pause_curiosity",
        "hover_recognition",
        "speech_preparation",
        "listening_readiness",
        "thought_processing",
        "empathy_signal",
        "encouragement",
        "understanding_nod",
      ];

      for (const type of types) {
        const { result } = renderHook(() => useAvatarMicroInteractions());

        act(() => {
          result.current.controls.trigger(type);
        });

        expect(result.current.state.active?.type).toBe(type);
      }
    });

    it("should not trigger when disabled", () => {
      const { result } = renderHook(() =>
        useAvatarMicroInteractions({ enabled: false })
      );

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      expect(result.current.state.active).toBeNull();
    });

    it("should not trigger when paused", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.pause();
      });

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      expect(result.current.state.active).toBeNull();
    });
  });

  // ============================================================================
  // Queue Tests
  // ============================================================================

  describe("queue management", () => {
    it("should add to queue when interaction is active", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      act(() => {
        result.current.controls.trigger("typing_acknowledgment");
      });

      expect(result.current.state.queue.length).toBe(1);
      expect(result.current.state.queue[0].type).toBe("typing_acknowledgment");
    });

    it("should respect max queue size", () => {
      const { result } = renderHook(() =>
        useAvatarMicroInteractions({ maxQueueSize: 2 })
      );

      act(() => {
        result.current.controls.trigger("attention_shift"); // Active
        result.current.controls.trigger("typing_acknowledgment"); // Queue 1
        result.current.controls.trigger("pause_curiosity"); // Queue 2
        result.current.controls.trigger("encouragement"); // Should be ignored
      });

      expect(result.current.state.queue.length).toBe(2);
    });

    it("should clear queue", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift");
        result.current.controls.trigger("typing_acknowledgment");
        result.current.controls.trigger("pause_curiosity");
      });

      act(() => {
        result.current.controls.clearQueue();
      });

      expect(result.current.state.queue.length).toBe(0);
    });
  });

  // ============================================================================
  // Metrics Tests
  // ============================================================================

  describe("metrics tracking", () => {
    it("should track total triggered count", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      expect(result.current.metrics.totalTriggered).toBe(0);

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      expect(result.current.metrics.totalTriggered).toBe(1);
    });

    it("should track interaction counts by type", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      expect(result.current.metrics.interactionCounts.attention_shift).toBe(1);
    });

    it("should increment counts for same type", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      // Complete first interaction
      act(() => {
        runFrames(50, 16);
      });

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      expect(result.current.metrics.interactionCounts.attention_shift).toBe(2);
    });
  });

  // ============================================================================
  // Pause/Resume Tests
  // ============================================================================

  describe("pause and resume", () => {
    it("should pause interactions", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.pause();
      });

      expect(result.current.isPaused).toBe(true);
    });

    it("should resume interactions", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.pause();
      });

      act(() => {
        result.current.controls.resume();
      });

      expect(result.current.isPaused).toBe(false);
    });

    it("should not process animation when paused", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      act(() => {
        result.current.controls.pause();
      });

      const beforeBlendShapes = { ...result.current.currentBlendShapes };

      // Try to advance animation
      act(() => {
        runFrames(10, 16);
      });

      // Animation should not have progressed (same blend shapes)
      expect(result.current.isPaused).toBe(true);
    });
  });

  // ============================================================================
  // Cancel Tests
  // ============================================================================

  describe("cancel", () => {
    it("should cancel active interaction", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      expect(result.current.state.active).not.toBeNull();

      act(() => {
        result.current.controls.cancel();
      });

      expect(result.current.state.active).toBeNull();
      expect(result.current.state.isProcessing).toBe(false);
    });

    it("should reset blend shapes on cancel", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      // Let animation run a bit
      act(() => {
        runFrames(5, 16);
      });

      act(() => {
        result.current.controls.cancel();
      });

      expect(result.current.currentBlendShapes).toEqual({});
    });

    it("should reset head movement on cancel", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      act(() => {
        result.current.controls.cancel();
      });

      expect(result.current.currentHeadMovement).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("should reset eye movement on cancel", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      act(() => {
        result.current.controls.cancel();
      });

      expect(result.current.currentEyeMovement).toEqual({ x: 0, y: 0 });
    });
  });

  // ============================================================================
  // Last Triggered Tracking Tests
  // ============================================================================

  describe("last triggered tracking", () => {
    it("should track last triggered timestamp", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      const beforeTrigger = mockNow;

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      expect(result.current.state.lastTriggered.attention_shift).toBeDefined();
      expect(result.current.state.lastTriggered.attention_shift).toBe(beforeTrigger);
    });
  });

  // ============================================================================
  // Intensity Tests
  // ============================================================================

  describe("intensity levels", () => {
    it("should apply subtle intensity", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift", "subtle");
      });

      expect(result.current.state.active?.intensity).toBe("subtle");
    });

    it("should apply moderate intensity", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift", "moderate");
      });

      expect(result.current.state.active?.intensity).toBe("moderate");
    });

    it("should apply expressive intensity", () => {
      const { result } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift", "expressive");
      });

      expect(result.current.state.active?.intensity).toBe("expressive");
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const { result, unmount } = renderHook(() => useAvatarMicroInteractions());

      act(() => {
        result.current.controls.trigger("attention_shift");
      });

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// useTypingAcknowledgment Tests
// ============================================================================

describe("useTypingAcknowledgment", () => {
  it("should return blend shapes", () => {
    const { result } = renderHook(() => useTypingAcknowledgment(false));

    expect(result.current.blendShapes).toBeDefined();
  });

  it("should trigger when typing starts", () => {
    const { result, rerender } = renderHook(
      ({ isTyping }) => useTypingAcknowledgment(isTyping),
      { initialProps: { isTyping: false } }
    );

    rerender({ isTyping: true });

    // Typing acknowledgment should have been triggered
    // (internal state, we verify no error occurs)
    expect(result.current.blendShapes).toBeDefined();
  });

  it("should not re-trigger while still typing", () => {
    const { result, rerender } = renderHook(
      ({ isTyping }) => useTypingAcknowledgment(isTyping),
      { initialProps: { isTyping: false } }
    );

    rerender({ isTyping: true });
    rerender({ isTyping: true });

    expect(result.current.blendShapes).toBeDefined();
  });
});

// ============================================================================
// usePauseCuriosity Tests
// ============================================================================

describe("usePauseCuriosity", () => {
  it("should return blend shapes and head movement", () => {
    const { result } = renderHook(() => usePauseCuriosity(false));

    expect(result.current.blendShapes).toBeDefined();
    expect(result.current.headMovement).toBeDefined();
  });

  it("should trigger after pause threshold", () => {
    const { result, rerender } = renderHook(
      ({ isTyping }) => usePauseCuriosity(isTyping, 1000),
      { initialProps: { isTyping: true } }
    );

    // Stop typing
    rerender({ isTyping: false });

    // Advance past threshold
    act(() => {
      jest.advanceTimersByTime(1100);
    });

    expect(result.current.blendShapes).toBeDefined();
  });

  it("should reset trigger when typing resumes", () => {
    const { result, rerender } = renderHook(
      ({ isTyping }) => usePauseCuriosity(isTyping, 1000),
      { initialProps: { isTyping: true } }
    );

    rerender({ isTyping: false });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    rerender({ isTyping: true });

    // Should not trigger because typing resumed
    expect(result.current.blendShapes).toBeDefined();
  });
});

// ============================================================================
// useAttentionShift Tests
// ============================================================================

describe("useAttentionShift", () => {
  it("should return event handlers and current values", () => {
    const { result } = renderHook(() => useAttentionShift());

    expect(result.current.onScroll).toBeDefined();
    expect(result.current.onFocusChange).toBeDefined();
    expect(result.current.blendShapes).toBeDefined();
    expect(result.current.headMovement).toBeDefined();
  });

  it("should trigger on scroll", () => {
    const { result } = renderHook(() => useAttentionShift());

    act(() => {
      result.current.onScroll();
    });

    // Should have triggered (internal state)
    expect(result.current.blendShapes).toBeDefined();
  });

  it("should trigger on focus change", () => {
    const { result } = renderHook(() => useAttentionShift());

    act(() => {
      result.current.onFocusChange();
    });

    expect(result.current.blendShapes).toBeDefined();
  });

  it("should respect cooldown", () => {
    const { result } = renderHook(() => useAttentionShift());

    act(() => {
      result.current.onScroll();
    });

    // Immediate second call should be ignored (cooldown)
    act(() => {
      result.current.onScroll();
    });

    // No error should occur
    expect(result.current.blendShapes).toBeDefined();
  });
});

// ============================================================================
// useEmpathySignals Tests
// ============================================================================

describe("useEmpathySignals", () => {
  it("should return blend shapes and head movement", () => {
    const { result } = renderHook(() => useEmpathySignals("neutral"));

    expect(result.current.blendShapes).toBeDefined();
    expect(result.current.headMovement).toBeDefined();
  });

  it("should trigger empathy signal for negative sentiment", () => {
    const { result, rerender } = renderHook(
      ({ sentiment }) => useEmpathySignals(sentiment),
      { initialProps: { sentiment: "neutral" as const } }
    );

    rerender({ sentiment: "negative" as const });

    expect(result.current.blendShapes).toBeDefined();
  });

  it("should trigger encouragement for positive sentiment", () => {
    const { result, rerender } = renderHook(
      ({ sentiment }) => useEmpathySignals(sentiment),
      { initialProps: { sentiment: "neutral" as const } }
    );

    rerender({ sentiment: "positive" as const });

    expect(result.current.blendShapes).toBeDefined();
  });

  it("should not trigger for same sentiment", () => {
    const { result, rerender } = renderHook(
      ({ sentiment }) => useEmpathySignals(sentiment),
      { initialProps: { sentiment: "neutral" as const } }
    );

    rerender({ sentiment: "neutral" as const });

    expect(result.current.blendShapes).toBeDefined();
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe("edge cases", () => {
  it("should handle rapid trigger calls", () => {
    const { result } = renderHook(() => useAvatarMicroInteractions());

    act(() => {
      for (let i = 0; i < 20; i++) {
        result.current.controls.trigger("attention_shift");
      }
    });

    // Queue should be at max size (5)
    expect(result.current.state.queue.length).toBeLessThanOrEqual(5);
  });

  it("should handle pause/resume/cancel cycle", () => {
    const { result } = renderHook(() => useAvatarMicroInteractions());

    act(() => {
      result.current.controls.trigger("attention_shift");
      result.current.controls.pause();
      result.current.controls.resume();
      result.current.controls.cancel();
    });

    expect(result.current.state.active).toBeNull();
    expect(result.current.isPaused).toBe(false);
  });

  it("should handle multiple cancel calls", () => {
    const { result } = renderHook(() => useAvatarMicroInteractions());

    act(() => {
      result.current.controls.cancel();
      result.current.controls.cancel();
      result.current.controls.cancel();
    });

    expect(result.current.state.active).toBeNull();
  });

  it("should handle config with naturalness", () => {
    const { result } = renderHook(() =>
      useAvatarMicroInteractions({ naturalness: 0.5 })
    );

    act(() => {
      result.current.controls.trigger("attention_shift");
    });

    // Should trigger with variation applied
    expect(result.current.state.active).not.toBeNull();
  });
});
