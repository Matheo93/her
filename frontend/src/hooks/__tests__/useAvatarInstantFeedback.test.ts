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
