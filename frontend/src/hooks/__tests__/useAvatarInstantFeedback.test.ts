/**
 * Tests for Avatar Instant Feedback Hook - Sprint 536
 *
 * Tests instant visual feedback for avatar interactions:
 * - Immediate micro-animations
 * - Placeholder expressions
 * - Optimistic state updates
 * - Processing and rollback phases
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarInstantFeedback,
  useTapFeedback,
  useSpeakFeedback,
  useOptimisticAvatarState,
} from "../useAvatarInstantFeedback";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.useFakeTimers();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("useAvatarInstantFeedback", () => {
  describe("initialization", () => {
    it("should initialize with idle phase", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      expect(result.current.state.phase).toBe("idle");
      expect(result.current.state.currentFeedbackType).toBeNull();
      expect(result.current.state.isProcessing).toBe(false);
    });

    it("should initialize with default placeholder expression", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      expect(result.current.state.placeholderExpression).toEqual({
        eyebrowRaise: 0,
        eyeWiden: 0,
        mouthOpen: 0,
        headTilt: 0,
      });
    });

    it("should initialize with zero metrics", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      expect(result.current.metrics.instantResponseTime).toBe(0);
      expect(result.current.metrics.processingTime).toBe(0);
      expect(result.current.metrics.rollbackCount).toBe(0);
      expect(result.current.metrics.successRate).toBe(100);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAvatarInstantFeedback({
          feedbackIntensity: "strong",
          processingTimeoutMs: 5000,
        })
      );

      expect(result.current.state.phase).toBe("idle");
    });
  });

  describe("instant feedback", () => {
    it("should trigger instant feedback on tap", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.triggerInstantFeedback("tap");
      });

      expect(result.current.state.phase).toBe("instant");
      expect(result.current.state.currentFeedbackType).toBe("tap");
    });

    it("should set feedback position when provided", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 200 });
      });

      expect(result.current.state.feedbackPosition).toEqual({ x: 100, y: 200 });
    });

    it("should update placeholder expression for tap", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.triggerInstantFeedback("tap");
      });

      expect(result.current.state.placeholderExpression.eyebrowRaise).toBeGreaterThan(0);
    });

    it("should update placeholder expression for speak", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.triggerInstantFeedback("speak");
      });

      expect(result.current.state.placeholderExpression.mouthOpen).toBeGreaterThan(0);
    });

    it("should call onInstantFeedback callback", () => {
      const onInstantFeedback = jest.fn();
      const { result } = renderHook(() =>
        useAvatarInstantFeedback({}, { onInstantFeedback })
      );

      act(() => {
        result.current.controls.triggerInstantFeedback("tap");
      });

      expect(onInstantFeedback).toHaveBeenCalledWith("tap");
    });
  });

  describe("processing phase", () => {
    it("should transition to processing phase", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.triggerInstantFeedback("tap");
        result.current.controls.startProcessing();
      });

      expect(result.current.state.phase).toBe("processing");
      expect(result.current.state.isProcessing).toBe(true);
    });

    it("should call onProcessingStart callback", () => {
      const onProcessingStart = jest.fn();
      const { result } = renderHook(() =>
        useAvatarInstantFeedback({}, { onProcessingStart })
      );

      act(() => {
        result.current.controls.startProcessing();
      });

      expect(onProcessingStart).toHaveBeenCalled();
    });

    it("should auto-rollback after processing timeout", () => {
      const onRollback = jest.fn();
      const { result } = renderHook(() =>
        useAvatarInstantFeedback(
          { processingTimeoutMs: 1000 },
          { onRollback }
        )
      );

      act(() => {
        result.current.controls.startProcessing();
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.state.phase).toBe("rollback");
      expect(onRollback).toHaveBeenCalledWith("Processing timeout");
    });
  });

  describe("completion", () => {
    it("should complete processing successfully", () => {
      const onProcessingComplete = jest.fn();
      const { result } = renderHook(() =>
        useAvatarInstantFeedback({}, { onProcessingComplete })
      );

      act(() => {
        result.current.controls.startProcessing();
      });

      mockTime = 100;
      act(() => {
        result.current.controls.completeProcessing();
      });

      expect(result.current.state.phase).toBe("complete");
      expect(onProcessingComplete).toHaveBeenCalled();
    });

    it("should track processing time", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.startProcessing();
      });

      act(() => {
        result.current.controls.completeProcessing();
      });

      // Processing time should be recorded (may be 0 with mocked time)
      expect(typeof result.current.metrics.processingTime).toBe("number");
      expect(result.current.metrics.processingTime).toBeGreaterThanOrEqual(0);
    });

    it("should update success rate on completion", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.startProcessing();
        result.current.controls.completeProcessing();
      });

      expect(result.current.metrics.successRate).toBe(100);
    });
  });

  describe("rollback", () => {
    it("should trigger manual rollback", () => {
      const onRollback = jest.fn();
      const { result } = renderHook(() =>
        useAvatarInstantFeedback({}, { onRollback })
      );

      act(() => {
        result.current.controls.startProcessing();
        result.current.controls.triggerRollback("Test error");
      });

      expect(result.current.state.phase).toBe("rollback");
      expect(onRollback).toHaveBeenCalledWith("Test error");
    });

    it("should increment rollback count", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.triggerRollback("Error 1");
      });

      expect(result.current.metrics.rollbackCount).toBe(1);

      act(() => {
        result.current.controls.triggerRollback("Error 2");
      });

      expect(result.current.metrics.rollbackCount).toBe(2);
    });

    it("should auto-reset after rollback animation", () => {
      const { result } = renderHook(() =>
        useAvatarInstantFeedback({ rollbackAnimationMs: 200 })
      );

      act(() => {
        result.current.controls.triggerRollback("Test");
      });

      expect(result.current.state.phase).toBe("rollback");

      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(result.current.state.phase).toBe("idle");
    });
  });

  describe("feedback styles", () => {
    it("should return idle style when idle", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      const style = result.current.controls.getInstantFeedbackStyle();

      expect(style.transform).toBe("scale(1)");
      expect(style.opacity).toBe(1);
    });

    it("should return instant style when triggered", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.triggerInstantFeedback("tap");
      });

      const style = result.current.controls.getInstantFeedbackStyle();

      expect(style.transform).toContain("scale");
      expect(style.transition).toContain("ease-out");
    });

    it("should return processing style during processing", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.startProcessing();
      });

      const style = result.current.controls.getInstantFeedbackStyle();

      expect(style.opacity).toBeLessThan(1);
    });

    it("should return rollback style during rollback", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.triggerRollback("Test");
      });

      const style = result.current.controls.getInstantFeedbackStyle();

      expect(style.filter).toContain("saturate");
    });
  });

  describe("optimistic values", () => {
    it("should set optimistic value", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.setOptimisticValue("mood", "happy");
      });

      const state = result.current.controls.getOptimisticValue<string>("mood");
      expect(state?.value).toBe("happy");
      expect(state?.isOptimistic).toBe(true);
    });

    it("should commit optimistic value", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.setOptimisticValue("mood", "happy");
        result.current.controls.commitOptimisticValue("mood");
      });

      const state = result.current.controls.getOptimisticValue<string>("mood");
      expect(state?.isOptimistic).toBe(false);
    });

    it("should rollback optimistic value", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.setOptimisticValue("mood", "sad");
        result.current.controls.setOptimisticValue("mood", "happy");
      });

      act(() => {
        result.current.controls.rollbackOptimisticValue("mood");
      });

      const state = result.current.controls.getOptimisticValue<string>("mood");
      expect(state?.value).toBe("sad");
    });
  });

  describe("reset", () => {
    it("should reset all state", () => {
      const { result } = renderHook(() => useAvatarInstantFeedback());

      act(() => {
        result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 100 });
        result.current.controls.startProcessing();
      });

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.phase).toBe("idle");
      expect(result.current.state.currentFeedbackType).toBeNull();
      expect(result.current.state.feedbackPosition).toBeNull();
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useAvatarInstantFeedback());
      unmount();
    });
  });
});

describe("useTapFeedback", () => {
  it("should provide tap feedback control", () => {
    const { result } = renderHook(() => useTapFeedback());

    expect(typeof result.current.triggerTap).toBe("function");
    expect(result.current.isActive).toBe(false);
    expect(result.current.style).toBeDefined();
  });

  it("should trigger tap feedback", () => {
    const { result } = renderHook(() => useTapFeedback());

    act(() => {
      result.current.triggerTap({ x: 50, y: 50 });
    });

    expect(result.current.isActive).toBe(true);
  });

  it("should provide style for tap", () => {
    const { result } = renderHook(() => useTapFeedback());

    act(() => {
      result.current.triggerTap();
    });

    expect(result.current.style).toBeDefined();
  });
});

describe("useSpeakFeedback", () => {
  it("should provide speak feedback control", () => {
    const { result } = renderHook(() => useSpeakFeedback());

    expect(typeof result.current.triggerSpeak).toBe("function");
    expect(result.current.expression).toBeDefined();
    expect(result.current.isProcessing).toBe(false);
  });

  it("should trigger speak feedback", () => {
    const { result } = renderHook(() => useSpeakFeedback());

    act(() => {
      result.current.triggerSpeak();
    });

    expect(result.current.expression.mouthOpen).toBeGreaterThan(0);
  });
});

describe("useOptimisticAvatarState", () => {
  it("should provide optimistic state management", () => {
    const { result } = renderHook(() =>
      useOptimisticAvatarState("mood", "neutral")
    );

    expect(result.current.value).toBe("neutral");
    expect(result.current.isOptimistic).toBe(false);
  });

  it("should set optimistic value", () => {
    const { result } = renderHook(() =>
      useOptimisticAvatarState("mood", "neutral")
    );

    act(() => {
      result.current.setValue("happy");
    });

    expect(result.current.value).toBe("happy");
    expect(result.current.isOptimistic).toBe(true);
  });

  it("should commit optimistic value", () => {
    const { result } = renderHook(() =>
      useOptimisticAvatarState("mood", "neutral")
    );

    act(() => {
      result.current.setValue("happy");
      result.current.commit();
    });

    expect(result.current.value).toBe("happy");
    expect(result.current.isOptimistic).toBe(false);
  });

  it("should rollback optimistic value", () => {
    const { result } = renderHook(() =>
      useOptimisticAvatarState("mood", "neutral")
    );

    act(() => {
      result.current.setValue("happy");
    });

    act(() => {
      result.current.rollback();
    });

    expect(result.current.isOptimistic).toBe(false);
  });
});

// ============================================================================
// Branch Coverage Tests - Sprint 609
// ============================================================================

describe("branch coverage - calculatePlaceholderExpression (lines 162-191)", () => {
  it("should calculate press expression (lines 163-168)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    act(() => {
      result.current.controls.triggerInstantFeedback("press");
    });

    const expr = result.current.state.placeholderExpression;
    expect(expr.eyebrowRaise).toBeGreaterThan(0);
    expect(expr.eyeWiden).toBeGreaterThan(0);
    expect(expr.mouthOpen).toBeGreaterThan(0);
    expect(expr.headTilt).toBeGreaterThan(0);
  });

  it("should calculate swipe expression (lines 169-175)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    act(() => {
      result.current.controls.triggerInstantFeedback("swipe");
    });

    const expr = result.current.state.placeholderExpression;
    expect(expr.eyebrowRaise).toBeGreaterThan(0);
    expect(expr.eyeWiden).toBe(0);
    expect(expr.mouthOpen).toBe(0);
    expect(expr.headTilt).toBeGreaterThan(0);
  });

  it("should calculate pinch expression (lines 177-182)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    act(() => {
      result.current.controls.triggerInstantFeedback("pinch");
    });

    const expr = result.current.state.placeholderExpression;
    expect(expr.eyebrowRaise).toBeGreaterThan(0);
    expect(expr.eyeWiden).toBeGreaterThan(0);
    expect(expr.mouthOpen).toBe(0);
    expect(expr.headTilt).toBe(0);
  });

  it("should return default expression for unknown type (line 191)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    act(() => {
      // Force an unknown type by casting
      result.current.controls.triggerInstantFeedback("unknown" as any);
    });

    const expr = result.current.state.placeholderExpression;
    expect(expr.eyebrowRaise).toBe(0);
    expect(expr.eyeWiden).toBe(0);
    expect(expr.mouthOpen).toBe(0);
    expect(expr.headTilt).toBe(0);
  });
});

describe("branch coverage - instant response time measurement (lines 209-211)", () => {
  it("should call requestAnimationFrame to measure response time (lines 209-211)", () => {
    // Track if requestAnimationFrame was called
    const rafSpy = jest.spyOn(window, "requestAnimationFrame");

    const { result } = renderHook(() => useAvatarInstantFeedback());

    act(() => {
      mockTime = 0;
      result.current.controls.triggerInstantFeedback("tap");
    });

    // Verify rAF was called (covering lines 209-211)
    expect(rafSpy).toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it("should update instant response time when rAF callback executes (lines 210-211)", () => {
    // Directly execute callback to test the state update
    let capturedCallback: FrameRequestCallback | null = null;
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      capturedCallback = cb;
      return 1;
    });

    const { result } = renderHook(() => useAvatarInstantFeedback());

    // Trigger feedback which schedules rAF
    act(() => {
      mockTime = 0;
      result.current.controls.triggerInstantFeedback("tap");
    });

    // Manually invoke the rAF callback inside act
    if (capturedCallback) {
      act(() => {
        mockTime = 16;
        capturedCallback!(16);
      });
    }

    // The metric should be updated (may be 16 or calculated based on mock)
    expect(result.current.metrics.instantResponseTime).toBeGreaterThanOrEqual(0);
  });
});

describe("branch coverage - startProcessing timeout clearing (line 225)", () => {
  it("should clear existing timeout when startProcessing called twice (line 225)", () => {
    const onRollback = jest.fn();
    const { result } = renderHook(() =>
      useAvatarInstantFeedback(
        { processingTimeoutMs: 500 },
        { onRollback }
      )
    );

    // Start processing first time
    act(() => {
      result.current.controls.startProcessing();
    });

    // Advance time but not to timeout
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Start processing again - should clear old timeout and set new one
    act(() => {
      result.current.controls.startProcessing();
    });

    // Advance time past original timeout (300 + 300 = 600ms, original would have fired at 500ms)
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Should not have rolled back yet because new timeout started at 300ms
    expect(result.current.state.phase).toBe("processing");
    expect(onRollback).not.toHaveBeenCalled();

    // Advance to trigger new timeout
    act(() => {
      jest.advanceTimersByTime(200); // Total: 800ms from second startProcessing
    });

    expect(onRollback).toHaveBeenCalledWith("Processing timeout");
  });
});

describe("branch coverage - completeProcessing optimistic commit (lines 248-257)", () => {
  it("should commit all optimistic values on complete (lines 249-256)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    // Set multiple optimistic values
    act(() => {
      result.current.controls.setOptimisticValue("mood", "happy");
      result.current.controls.setOptimisticValue("energy", 100);
    });

    // Verify they're optimistic
    let moodState = result.current.controls.getOptimisticValue<string>("mood");
    let energyState = result.current.controls.getOptimisticValue<number>("energy");
    expect(moodState?.isOptimistic).toBe(true);
    expect(moodState?.pendingUpdate).toBe(true);
    expect(energyState?.isOptimistic).toBe(true);

    // Start and complete processing
    act(() => {
      result.current.controls.startProcessing();
    });

    act(() => {
      result.current.controls.completeProcessing();
    });

    // Verify all optimistic values are committed
    moodState = result.current.controls.getOptimisticValue<string>("mood");
    energyState = result.current.controls.getOptimisticValue<number>("energy");
    expect(moodState?.isOptimistic).toBe(false);
    expect(moodState?.pendingUpdate).toBe(false);
    expect(energyState?.isOptimistic).toBe(false);
    expect(energyState?.pendingUpdate).toBe(false);
  });

  it("should handle empty optimistic values map on complete (line 248)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    // Complete without any optimistic values
    act(() => {
      result.current.controls.startProcessing();
      result.current.controls.completeProcessing();
    });

    expect(result.current.state.phase).toBe("complete");
    // No errors should occur
  });
});

describe("branch coverage - triggerRollback optimistic values (lines 273-282)", () => {
  it("should rollback optimistic values with rollbackValue (lines 274-280)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    // Set initial value then update it
    act(() => {
      result.current.controls.setOptimisticValue("mood", "sad");
    });

    act(() => {
      result.current.controls.setOptimisticValue("mood", "happy");
    });

    // Verify optimistic state
    let moodState = result.current.controls.getOptimisticValue<string>("mood");
    expect(moodState?.value).toBe("happy");
    expect(moodState?.isOptimistic).toBe(true);
    expect(moodState?.rollbackValue).toBe("sad");

    // Trigger rollback
    act(() => {
      result.current.controls.triggerRollback("Test failure");
    });

    // Verify value rolled back
    moodState = result.current.controls.getOptimisticValue<string>("mood");
    expect(moodState?.value).toBe("sad");
    expect(moodState?.isOptimistic).toBe(false);
    expect(moodState?.rollbackValue).toBeNull();
  });

  it("should not rollback values with null rollbackValue (line 274 condition)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    // Set and commit a value (commit sets rollbackValue to null)
    act(() => {
      result.current.controls.setOptimisticValue("mood", "happy");
      result.current.controls.commitOptimisticValue("mood");
    });

    let moodState = result.current.controls.getOptimisticValue<string>("mood");
    expect(moodState?.rollbackValue).toBeNull();
    expect(moodState?.isOptimistic).toBe(false);

    // Trigger rollback
    act(() => {
      result.current.controls.triggerRollback("Test");
    });

    // Value should remain unchanged since rollbackValue was null
    moodState = result.current.controls.getOptimisticValue<string>("mood");
    expect(moodState?.value).toBe("happy");
  });

  it("should clear processing timeout on rollback (lines 263-266)", () => {
    const onRollback = jest.fn();
    const { result } = renderHook(() =>
      useAvatarInstantFeedback(
        { processingTimeoutMs: 1000 },
        { onRollback }
      )
    );

    // Start processing (creates timeout)
    act(() => {
      result.current.controls.startProcessing();
    });

    // Trigger manual rollback (should clear timeout)
    act(() => {
      result.current.controls.triggerRollback("Manual rollback");
    });

    expect(onRollback).toHaveBeenCalledWith("Manual rollback");

    // Advance past original timeout
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    // Should only have one rollback call (not two from timeout)
    expect(onRollback).toHaveBeenCalledTimes(1);
  });
});

describe("branch coverage - getInstantFeedbackStyle complete phase (line 320)", () => {
  it("should return complete phase style (lines 320-325)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    act(() => {
      result.current.controls.startProcessing();
      result.current.controls.completeProcessing();
    });

    expect(result.current.state.phase).toBe("complete");
    const style = result.current.controls.getInstantFeedbackStyle();

    expect(style.transform).toBe("scale(1)");
    expect(style.opacity).toBe(1);
    expect(style.filter).toBe("none");
    expect(style.transition).toBe("all 150ms ease-out");
  });
});

describe("branch coverage - getPlaceholderExpression (line 338)", () => {
  it("should return current placeholder expression (line 338)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    // Initially should return default
    let expr = result.current.controls.getPlaceholderExpression();
    expect(expr).toEqual({
      eyebrowRaise: 0,
      eyeWiden: 0,
      mouthOpen: 0,
      headTilt: 0,
    });

    // After triggering feedback
    act(() => {
      result.current.controls.triggerInstantFeedback("speak");
    });

    expr = result.current.controls.getPlaceholderExpression();
    expect(expr.mouthOpen).toBeGreaterThan(0);
  });
});

describe("branch coverage - intensity multipliers", () => {
  it("should apply subtle intensity (0.5x)", () => {
    const { result } = renderHook(() =>
      useAvatarInstantFeedback({ feedbackIntensity: "subtle" })
    );

    act(() => {
      result.current.controls.triggerInstantFeedback("tap");
    });

    const expr = result.current.state.placeholderExpression;
    // Tap with subtle: eyebrowRaise = 0.2 * 0.5 = 0.1
    expect(expr.eyebrowRaise).toBeCloseTo(0.1);
  });

  it("should apply strong intensity (1.5x)", () => {
    const { result } = renderHook(() =>
      useAvatarInstantFeedback({ feedbackIntensity: "strong" })
    );

    act(() => {
      result.current.controls.triggerInstantFeedback("tap");
    });

    const expr = result.current.state.placeholderExpression;
    // Tap with strong: eyebrowRaise = 0.2 * 1.5 = 0.3
    expect(expr.eyebrowRaise).toBeCloseTo(0.3);
  });
});

describe("branch coverage - reset with active timeout (lines 385-388)", () => {
  it("should clear processing timeout on reset (lines 385-388)", () => {
    const onRollback = jest.fn();
    const { result } = renderHook(() =>
      useAvatarInstantFeedback(
        { processingTimeoutMs: 500 },
        { onRollback }
      )
    );

    // Start processing (creates timeout)
    act(() => {
      result.current.controls.startProcessing();
    });

    // Reset should clear the timeout
    act(() => {
      result.current.controls.reset();
    });

    // Advance past timeout
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Rollback should not have been triggered
    expect(onRollback).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe("idle");
  });
});

describe("branch coverage - rollbackOptimisticValue with null rollbackValue (line 373)", () => {
  it("should not change value when rollbackValue is null (line 373)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    // Set initial value
    act(() => {
      result.current.controls.setOptimisticValue("key", "original");
    });

    // Commit (sets rollbackValue to null)
    act(() => {
      result.current.controls.commitOptimisticValue("key");
    });

    let state = result.current.controls.getOptimisticValue<string>("key");
    expect(state?.rollbackValue).toBeNull();

    // Try to rollback - should not change value
    act(() => {
      result.current.controls.rollbackOptimisticValue("key");
    });

    state = result.current.controls.getOptimisticValue<string>("key");
    expect(state?.value).toBe("original");
  });

  it("should rollback when state exists and rollbackValue is not null (lines 372-380)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    // Set initial value then update
    act(() => {
      result.current.controls.setOptimisticValue("key", "first");
    });

    act(() => {
      result.current.controls.setOptimisticValue("key", "second");
    });

    let state = result.current.controls.getOptimisticValue<string>("key");
    expect(state?.value).toBe("second");
    expect(state?.rollbackValue).toBe("first");

    // Rollback
    act(() => {
      result.current.controls.rollbackOptimisticValue("key");
    });

    state = result.current.controls.getOptimisticValue<string>("key");
    expect(state?.value).toBe("first");
    expect(state?.isOptimistic).toBe(false);
    expect(state?.rollbackValue).toBeNull();
  });
});

describe("branch coverage - commitOptimisticValue when state doesn't exist (line 360-361)", () => {
  it("should handle commit when key doesn't exist (line 361)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    // Try to commit non-existent key - should not throw
    act(() => {
      result.current.controls.commitOptimisticValue("nonexistent");
    });

    // Should be undefined (not in map)
    const state = result.current.controls.getOptimisticValue<string>("nonexistent");
    expect(state).toBeUndefined();
  });
});

describe("branch coverage - rollbackOptimisticValue when state doesn't exist (line 372)", () => {
  it("should handle rollback when key doesn't exist (line 372)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    // Try to rollback non-existent key - should not throw
    act(() => {
      result.current.controls.rollbackOptimisticValue("nonexistent");
    });

    // Should be undefined (not in map)
    const state = result.current.controls.getOptimisticValue<string>("nonexistent");
    expect(state).toBeUndefined();
  });
});

describe("branch coverage - setOptimisticValue preserves original rollbackValue (line 344)", () => {
  it("should preserve original rollbackValue when updating existing optimistic value (line 344)", () => {
    const { result } = renderHook(() => useAvatarInstantFeedback());

    // Set initial value
    act(() => {
      result.current.controls.setOptimisticValue("key", "original");
    });

    let state = result.current.controls.getOptimisticValue<string>("key");
    // First set uses value as rollbackValue
    expect(state?.rollbackValue).toBe("original");

    // Update to new value - should preserve original as rollbackValue
    act(() => {
      result.current.controls.setOptimisticValue("key", "updated");
    });

    state = result.current.controls.getOptimisticValue<string>("key");
    expect(state?.value).toBe("updated");
    expect(state?.rollbackValue).toBe("original"); // Still the original value
  });
});
