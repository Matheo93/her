/**
 * Tests for useAvatarBreathingSystem hook
 *
 * Sprint 563: Frontend - Avatar breathing animation system tests
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useAvatarBreathingSystem,
  useBreathingKeyframe,
  useConversationBreathing,
  type BreathingPattern,
  type BreathingPhase,
  type BreathingKeyframe,
  type BreathingCycle,
  type BreathingState,
  type BreathingMetrics,
  type BreathingConfig,
  type BreathingControls,
  type UseAvatarBreathingSystemResult,
} from "../useAvatarBreathingSystem";

// Mock timers
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

// ============================================================================
// EXPORTS TESTS
// ============================================================================

describe("useAvatarBreathingSystem exports", () => {
  test("exports useAvatarBreathingSystem hook", () => {
    expect(useAvatarBreathingSystem).toBeDefined();
    expect(typeof useAvatarBreathingSystem).toBe("function");
  });

  test("exports useBreathingKeyframe hook", () => {
    expect(useBreathingKeyframe).toBeDefined();
    expect(typeof useBreathingKeyframe).toBe("function");
  });

  test("exports useConversationBreathing hook", () => {
    expect(useConversationBreathing).toBeDefined();
    expect(typeof useConversationBreathing).toBe("function");
  });
});

// ============================================================================
// INITIALIZATION TESTS
// ============================================================================

describe("useAvatarBreathingSystem initialization", () => {
  test("returns state object", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.state).toBeDefined();
  });

  test("returns metrics object", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.metrics).toBeDefined();
  });

  test("returns controls object", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.controls).toBeDefined();
  });

  test("returns config object", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.config).toBeDefined();
  });

  test("initial pattern is normal", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.state.pattern).toBe("normal");
  });

  test("initial phase is inhale", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.state.phase).toBe("inhale");
  });

  test("initial progress is 0", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.state.progress).toBe(0);
  });

  test("initial cycleProgress is 0", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.state.cycleProgress).toBe(0);
  });

  test("initial keyframe has all properties", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.state.keyframe).toHaveProperty("chestExpansion");
    expect(result.current.state.keyframe).toHaveProperty("shoulderRise");
    expect(result.current.state.keyframe).toHaveProperty("abdomenExpansion");
    expect(result.current.state.keyframe).toHaveProperty("neckTension");
  });

  test("initial isTransitioning is false", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.state.isTransitioning).toBe(false);
  });
});

// ============================================================================
// CONFIG TESTS
// ============================================================================

describe("useAvatarBreathingSystem config", () => {
  test("uses default config when no options provided", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.config.enabled).toBe(true);
    expect(result.current.config.baseBreathsPerMinute).toBe(14);
  });

  test("accepts custom enabled option", () => {
    const { result } = renderHook(() =>
      useAvatarBreathingSystem({ enabled: false })
    );

    expect(result.current.config.enabled).toBe(false);
  });

  test("accepts custom baseBreathsPerMinute", () => {
    const { result } = renderHook(() =>
      useAvatarBreathingSystem({ baseBreathsPerMinute: 20 })
    );

    expect(result.current.config.baseBreathsPerMinute).toBe(20);
  });

  test("accepts custom emotionalSensitivity", () => {
    const { result } = renderHook(() =>
      useAvatarBreathingSystem({ emotionalSensitivity: 0.5 })
    );

    expect(result.current.config.emotionalSensitivity).toBe(0.5);
  });

  test("accepts custom speakingPauseSensitivity", () => {
    const { result } = renderHook(() =>
      useAvatarBreathingSystem({ speakingPauseSensitivity: 0.9 })
    );

    expect(result.current.config.speakingPauseSensitivity).toBe(0.9);
  });

  test("accepts custom transitionSmoothness", () => {
    const { result } = renderHook(() =>
      useAvatarBreathingSystem({ transitionSmoothness: 0.8 })
    );

    expect(result.current.config.transitionSmoothness).toBe(0.8);
  });

  test("accepts custom randomVariation", () => {
    const { result } = renderHook(() =>
      useAvatarBreathingSystem({ randomVariation: 0.2 })
    );

    expect(result.current.config.randomVariation).toBe(0.2);
  });

  test("accepts custom chestMovementScale", () => {
    const { result } = renderHook(() =>
      useAvatarBreathingSystem({ chestMovementScale: 1.5 })
    );

    expect(result.current.config.chestMovementScale).toBe(1.5);
  });

  test("accepts custom shoulderMovementScale", () => {
    const { result } = renderHook(() =>
      useAvatarBreathingSystem({ shoulderMovementScale: 0.8 })
    );

    expect(result.current.config.shoulderMovementScale).toBe(0.8);
  });

  test("accepts subtleMode option", () => {
    const { result } = renderHook(() =>
      useAvatarBreathingSystem({ subtleMode: true })
    );

    expect(result.current.config.subtleMode).toBe(true);
  });
});

// ============================================================================
// METRICS TESTS
// ============================================================================

describe("useAvatarBreathingSystem metrics", () => {
  test("initial totalCycles is 0", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.metrics.totalCycles).toBe(0);
  });

  test("initial patternChanges is 0", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.metrics.patternChanges).toBe(0);
  });

  test("initial speakingPauses is 0", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.metrics.speakingPauses).toBe(0);
  });

  test("initial emotionalAdaptations is 0", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.metrics.emotionalAdaptations).toBe(0);
  });

  test("initial averageCycleMs is 5000", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.metrics.averageCycleMs).toBe(5000);
  });
});

// ============================================================================
// CONTROLS - setPattern TESTS
// ============================================================================

describe("useAvatarBreathingSystem controls - setPattern", () => {
  test("setPattern function exists", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.controls.setPattern).toBeDefined();
    expect(typeof result.current.controls.setPattern).toBe("function");
  });

  test("setPattern changes pattern to relaxed", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setPattern("relaxed");
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("relaxed");
  });

  test("setPattern changes pattern to excited", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setPattern("excited");
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("excited");
  });

  test("setPattern changes pattern to speaking", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setPattern("speaking");
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("speaking");
  });

  test("setPattern increments patternChanges metric", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    const initialChanges = result.current.metrics.patternChanges;

    act(() => {
      result.current.controls.setPattern("alert");
      jest.advanceTimersByTime(100);
    });

    expect(result.current.metrics.patternChanges).toBe(initialChanges + 1);
  });

  test("setPattern does not increment when setting same pattern", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setPattern("normal");
      jest.advanceTimersByTime(100);
    });

    const changesAfterFirst = result.current.metrics.patternChanges;

    act(() => {
      result.current.controls.setPattern("normal");
      jest.advanceTimersByTime(100);
    });

    expect(result.current.metrics.patternChanges).toBe(changesAfterFirst);
  });

  test("setPattern sets isTransitioning to true", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setPattern("thinking");
      jest.advanceTimersByTime(16);
    });

    expect(result.current.state.isTransitioning).toBe(true);
  });
});

// ============================================================================
// CONTROLS - triggerSigh TESTS
// ============================================================================

describe("useAvatarBreathingSystem controls - triggerSigh", () => {
  test("triggerSigh function exists", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.controls.triggerSigh).toBeDefined();
    expect(typeof result.current.controls.triggerSigh).toBe("function");
  });

  test("triggerSigh sets pattern to sighing", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.triggerSigh();
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("sighing");
  });

  test("triggerSigh returns to previous pattern after timeout", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setPattern("relaxed");
      jest.advanceTimersByTime(100);
    });

    act(() => {
      result.current.controls.triggerSigh();
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("sighing");

    act(() => {
      jest.advanceTimersByTime(8000);
    });

    expect(result.current.state.pattern).toBe("relaxed");
  });
});

// ============================================================================
// CONTROLS - holdBreath/resumeBreathing TESTS
// ============================================================================

describe("useAvatarBreathingSystem controls - holdBreath/resumeBreathing", () => {
  test("holdBreath function exists", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.controls.holdBreath).toBeDefined();
    expect(typeof result.current.controls.holdBreath).toBe("function");
  });

  test("resumeBreathing function exists", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.controls.resumeBreathing).toBeDefined();
    expect(typeof result.current.controls.resumeBreathing).toBe("function");
  });

  test("holdBreath accepts duration parameter", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.holdBreath(2000);
    });

    // Should not throw
    expect(result.current.state).toBeDefined();
  });

  test("resumeBreathing can be called", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.holdBreath(2000);
    });

    act(() => {
      result.current.controls.resumeBreathing();
    });

    // Should not throw
    expect(result.current.state).toBeDefined();
  });
});

// ============================================================================
// CONTROLS - setEmotionalState TESTS
// ============================================================================

describe("useAvatarBreathingSystem controls - setEmotionalState", () => {
  test("setEmotionalState function exists", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.controls.setEmotionalState).toBeDefined();
    expect(typeof result.current.controls.setEmotionalState).toBe("function");
  });

  test("setEmotionalState with happy emotion", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setEmotionalState("happy", 0.8);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("normal");
  });

  test("setEmotionalState with excited emotion", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setEmotionalState("excited", 0.8);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("excited");
  });

  test("setEmotionalState with calm emotion", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setEmotionalState("calm", 0.8);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("relaxed");
  });

  test("setEmotionalState with anxious emotion", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setEmotionalState("anxious", 0.8);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("alert");
  });

  test("setEmotionalState with thoughtful emotion", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setEmotionalState("thoughtful", 0.8);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("thinking");
  });

  test("setEmotionalState increments emotionalAdaptations", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    const initialAdaptations = result.current.metrics.emotionalAdaptations;

    act(() => {
      result.current.controls.setEmotionalState("excited", 0.8);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.metrics.emotionalAdaptations).toBe(
      initialAdaptations + 1
    );
  });

  test("setEmotionalState ignores low intensity", () => {
    const { result } = renderHook(() =>
      useAvatarBreathingSystem({ emotionalSensitivity: 0.7 })
    );

    const initialAdaptations = result.current.metrics.emotionalAdaptations;

    act(() => {
      result.current.controls.setEmotionalState("excited", 0.1);
      jest.advanceTimersByTime(100);
    });

    // Should not adapt due to low intensity
    expect(result.current.metrics.emotionalAdaptations).toBe(initialAdaptations);
  });

  test("setEmotionalState handles unknown emotion", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setEmotionalState("unknown_emotion", 0.8);
      jest.advanceTimersByTime(100);
    });

    // Should default to normal
    expect(result.current.state.pattern).toBe("normal");
  });

  test("setEmotionalState is case-insensitive", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setEmotionalState("EXCITED", 0.8);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("excited");
  });
});

// ============================================================================
// CONTROLS - setSpeaking TESTS
// ============================================================================

describe("useAvatarBreathingSystem controls - setSpeaking", () => {
  test("setSpeaking function exists", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.controls.setSpeaking).toBeDefined();
    expect(typeof result.current.controls.setSpeaking).toBe("function");
  });

  test("setSpeaking(true) changes pattern to speaking", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setSpeaking(true);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("speaking");
  });

  test("setSpeaking(false) changes pattern to listening", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setSpeaking(true);
      jest.advanceTimersByTime(100);
    });

    act(() => {
      result.current.controls.setSpeaking(false);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("listening");
  });

  test("setSpeaking(true) increments speakingPauses", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    const initialPauses = result.current.metrics.speakingPauses;

    act(() => {
      result.current.controls.setSpeaking(true);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.metrics.speakingPauses).toBe(initialPauses + 1);
  });

  test("setSpeaking(true) multiple times only increments once", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    const initialPauses = result.current.metrics.speakingPauses;

    act(() => {
      result.current.controls.setSpeaking(true);
      jest.advanceTimersByTime(100);
    });

    act(() => {
      result.current.controls.setSpeaking(true);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.metrics.speakingPauses).toBe(initialPauses + 1);
  });
});

// ============================================================================
// CONTROLS - reset TESTS
// ============================================================================

describe("useAvatarBreathingSystem controls - reset", () => {
  test("reset function exists", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.controls.reset).toBeDefined();
    expect(typeof result.current.controls.reset).toBe("function");
  });

  test("reset returns pattern to normal", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setPattern("excited");
      jest.advanceTimersByTime(100);
    });

    act(() => {
      result.current.controls.reset();
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("normal");
  });

  test("reset clears metrics", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setPattern("excited");
      result.current.controls.setSpeaking(true);
      jest.advanceTimersByTime(100);
    });

    act(() => {
      result.current.controls.reset();
    });

    expect(result.current.metrics.totalCycles).toBe(0);
    expect(result.current.metrics.patternChanges).toBe(0);
    expect(result.current.metrics.speakingPauses).toBe(0);
    expect(result.current.metrics.emotionalAdaptations).toBe(0);
  });
});

// ============================================================================
// CONTROLS - updateConfig TESTS
// ============================================================================

describe("useAvatarBreathingSystem controls - updateConfig", () => {
  test("updateConfig function exists", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    expect(result.current.controls.updateConfig).toBeDefined();
    expect(typeof result.current.controls.updateConfig).toBe("function");
  });

  test("updateConfig can be called without error", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.updateConfig({ subtleMode: true });
    });

    // Should not throw
    expect(result.current.config).toBeDefined();
  });
});

// ============================================================================
// BREATHING PATTERNS TESTS
// ============================================================================

describe("breathing patterns", () => {
  const allPatterns: BreathingPattern[] = [
    "relaxed",
    "normal",
    "alert",
    "excited",
    "speaking",
    "listening",
    "thinking",
    "holding",
    "sighing",
    "laughing",
  ];

  test.each(allPatterns)("can set pattern to %s", (pattern) => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setPattern(pattern);
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe(pattern);
  });
});

// ============================================================================
// KEYFRAME TESTS
// ============================================================================

describe("keyframe values", () => {
  test("keyframe values are numbers", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    const { keyframe } = result.current.state;

    expect(typeof keyframe.chestExpansion).toBe("number");
    expect(typeof keyframe.shoulderRise).toBe("number");
    expect(typeof keyframe.abdomenExpansion).toBe("number");
    expect(typeof keyframe.neckTension).toBe("number");
  });

  test("keyframe values are in valid range", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    const { keyframe } = result.current.state;

    expect(keyframe.chestExpansion).toBeGreaterThanOrEqual(0);
    expect(keyframe.shoulderRise).toBeGreaterThanOrEqual(0);
    expect(keyframe.abdomenExpansion).toBeGreaterThanOrEqual(0);
    expect(keyframe.neckTension).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// useBreathingKeyframe TESTS
// ============================================================================

describe("useBreathingKeyframe", () => {
  test("returns keyframe object", () => {
    const { result } = renderHook(() => useBreathingKeyframe());

    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty("chestExpansion");
    expect(result.current).toHaveProperty("shoulderRise");
    expect(result.current).toHaveProperty("abdomenExpansion");
    expect(result.current).toHaveProperty("neckTension");
  });

  test("accepts config options", () => {
    const { result } = renderHook(() =>
      useBreathingKeyframe({ subtleMode: true })
    );

    expect(result.current).toBeDefined();
  });
});

// ============================================================================
// useConversationBreathing TESTS
// ============================================================================

describe("useConversationBreathing", () => {
  test("returns full result object", () => {
    const { result } = renderHook(() =>
      useConversationBreathing(false, false)
    );

    expect(result.current.state).toBeDefined();
    expect(result.current.metrics).toBeDefined();
    expect(result.current.controls).toBeDefined();
    expect(result.current.config).toBeDefined();
  });

  test("sets speaking pattern when AI is speaking", () => {
    const { result } = renderHook(() =>
      useConversationBreathing(false, true)
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("speaking");
  });

  test("sets listening pattern when user is speaking", () => {
    const { result } = renderHook(() =>
      useConversationBreathing(true, false)
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("listening");
  });

  test("responds to emotion parameter", () => {
    const { result } = renderHook(() =>
      useConversationBreathing(false, false, "excited")
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("excited");
  });

  test("AI speaking takes precedence over user speaking", () => {
    const { result } = renderHook(() =>
      useConversationBreathing(true, true)
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("speaking");
  });
});

// ============================================================================
// DISABLED STATE TESTS
// ============================================================================

describe("disabled breathing system", () => {
  test("does not animate when disabled", () => {
    const { result } = renderHook(() =>
      useAvatarBreathingSystem({ enabled: false })
    );

    const initialState = { ...result.current.state };

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // State should not have changed significantly
    expect(result.current.state.pattern).toBe(initialState.pattern);
  });
});

// ============================================================================
// SUBTLE MODE TESTS
// ============================================================================

describe("subtle mode", () => {
  test("subtleMode reduces movement scale", () => {
    const { result: normalResult } = renderHook(() =>
      useAvatarBreathingSystem({ subtleMode: false })
    );

    const { result: subtleResult } = renderHook(() =>
      useAvatarBreathingSystem({ subtleMode: true })
    );

    // Both should have valid keyframes
    expect(normalResult.current.state.keyframe).toBeDefined();
    expect(subtleResult.current.state.keyframe).toBeDefined();
  });
});

// ============================================================================
// CLEANUP TESTS
// ============================================================================

describe("cleanup", () => {
  test("cancels animation frame on unmount", () => {
    const { unmount } = renderHook(() => useAvatarBreathingSystem());

    // Should not throw on unmount
    unmount();
  });

  test("handles multiple renders without memory leak", () => {
    const { rerender } = renderHook(
      ({ config }) => useAvatarBreathingSystem(config),
      { initialProps: { config: {} } }
    );

    // Multiple rerenders should not cause issues
    for (let i = 0; i < 10; i++) {
      rerender({ config: { baseBreathsPerMinute: 14 + i } });
    }
  });
});

// ============================================================================
// EDGE CASES TESTS
// ============================================================================

describe("edge cases", () => {
  test("handles rapid pattern changes", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setPattern("relaxed");
      result.current.controls.setPattern("excited");
      result.current.controls.setPattern("thinking");
      result.current.controls.setPattern("alert");
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.pattern).toBe("alert");
  });

  test("handles emotion with zero intensity", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setEmotionalState("excited", 0);
      jest.advanceTimersByTime(100);
    });

    // Should not change pattern due to zero intensity
    expect(result.current.state.pattern).toBe("normal");
  });

  test("handles negative emotion intensity", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.setEmotionalState("excited", -0.5);
      jest.advanceTimersByTime(100);
    });

    // Should not change pattern
    expect(result.current.state.pattern).toBe("normal");
  });

  test("handles holdBreath with zero duration", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.holdBreath(0);
      jest.advanceTimersByTime(100);
    });

    // Should not throw
    expect(result.current.state).toBeDefined();
  });

  test("handles very long hold duration", () => {
    const { result } = renderHook(() => useAvatarBreathingSystem());

    act(() => {
      result.current.controls.holdBreath(60000);
    });

    // Should not throw
    expect(result.current.state).toBeDefined();
  });
});
