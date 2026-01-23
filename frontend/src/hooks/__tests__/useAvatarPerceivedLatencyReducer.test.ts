/**
 * Tests for Avatar Perceived Latency Reducer Hook - Sprint 533
 *
 * Tests techniques to reduce perceived latency in avatar interactions:
 * - Anticipatory animations that start before input completes
 * - Motion blur effects to mask frame drops
 * - Skeleton/placeholder states during loading
 * - Progressive enhancement of avatar details
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarPerceivedLatencyReducer,
  useAnticipatoryAnimation,
  useProgressiveAvatarLoading,
} from "../useAvatarPerceivedLatencyReducer";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);

  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    return setTimeout(() => cb(mockTime), 0) as unknown as number;
  });

  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    clearTimeout(id);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useAvatarPerceivedLatencyReducer", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.loadingPhase).toBe("idle");
      expect(result.current.state.anticipationLevel).toBe(0);
      expect(result.current.state.useMotionBlur).toBe(false);
    });

    it("should initialize with zero metrics", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      expect(result.current.metrics.perceivedLatencyMs).toBe(0);
      expect(result.current.metrics.actualLatencyMs).toBe(0);
      expect(result.current.metrics.latencyReduction).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAvatarPerceivedLatencyReducer({
          enableMotionBlur: true,
          anticipationThresholdMs: 50,
          progressiveLoadingSteps: 5,
        })
      );

      expect(result.current.state.useMotionBlur).toBe(true);
    });
  });

  describe("anticipatory animations", () => {
    it("should start anticipatory animation on input", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startAnticipation("hover");
      });

      expect(result.current.state.anticipationLevel).toBeGreaterThan(0);
    });

    it("should increase anticipation level over time", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      mockTime = 0;
      act(() => {
        result.current.controls.startAnticipation("tap");
      });

      const initial = result.current.state.anticipationLevel;

      mockTime = 50;
      act(() => {
        result.current.controls.updateAnticipation();
      });

      expect(result.current.state.anticipationLevel).toBeGreaterThanOrEqual(initial);
    });

    it("should complete anticipation on response", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startAnticipation("tap");
      });

      expect(result.current.state.anticipationLevel).toBeGreaterThan(0);

      act(() => {
        result.current.controls.completeAnticipation();
      });

      expect(result.current.state.anticipationLevel).toBe(0);
    });

    it("should provide anticipation transform", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startAnticipation("tap");
      });

      const transform = result.current.controls.getAnticipationTransform();
      expect(transform).toBeDefined();
      expect(typeof transform.scale).toBe("number");
    });
  });

  describe("motion blur", () => {
    it("should enable motion blur during fast movement", () => {
      const { result } = renderHook(() =>
        useAvatarPerceivedLatencyReducer({ enableMotionBlur: true })
      );

      act(() => {
        result.current.controls.setMovementSpeed(100);
      });

      expect(result.current.state.useMotionBlur).toBe(true);
    });

    it("should disable motion blur during slow movement", () => {
      const { result } = renderHook(() =>
        useAvatarPerceivedLatencyReducer({ enableMotionBlur: true })
      );

      act(() => {
        result.current.controls.setMovementSpeed(10);
      });

      // Low speed shouldn't trigger motion blur
      const styles = result.current.controls.getMotionBlurStyles();
      expect(styles.filter).toBe("none");
    });

    it("should provide motion blur CSS styles", () => {
      const { result } = renderHook(() =>
        useAvatarPerceivedLatencyReducer({ enableMotionBlur: true })
      );

      act(() => {
        result.current.controls.setMovementSpeed(150);
      });

      const styles = result.current.controls.getMotionBlurStyles();
      expect(styles).toBeDefined();
    });
  });

  describe("progressive loading", () => {
    it("should track loading phases", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startLoading();
      });

      expect(result.current.state.loadingPhase).toBe("skeleton");
    });

    it("should progress through loading stages", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startLoading();
      });
      expect(result.current.state.loadingPhase).toBe("skeleton");

      act(() => {
        result.current.controls.advanceLoading();
      });
      expect(result.current.state.loadingPhase).toBe("lowRes");

      act(() => {
        result.current.controls.advanceLoading();
      });
      expect(result.current.state.loadingPhase).toBe("mediumRes");

      act(() => {
        result.current.controls.advanceLoading();
      });
      expect(result.current.state.loadingPhase).toBe("highRes");

      act(() => {
        result.current.controls.advanceLoading();
      });
      expect(result.current.state.loadingPhase).toBe("complete");
    });

    it("should complete loading", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startLoading();
        result.current.controls.completeLoading();
      });

      expect(result.current.state.loadingPhase).toBe("complete");
    });

    it("should provide loading progress", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startLoading();
        result.current.controls.advanceLoading();
      });

      expect(result.current.state.loadingProgress).toBeGreaterThan(0);
      expect(result.current.state.loadingProgress).toBeLessThanOrEqual(1);
    });
  });

  describe("perceived latency calculation", () => {
    it("should measure actual vs perceived latency", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      mockTime = 0;
      act(() => {
        result.current.controls.startLatencyMeasurement();
        result.current.controls.startAnticipation("tap");
      });

      mockTime = 100;
      act(() => {
        result.current.controls.endLatencyMeasurement();
      });

      expect(result.current.metrics.actualLatencyMs).toBe(100);
      expect(result.current.metrics.perceivedLatencyMs).toBeLessThanOrEqual(100);
    });

    it("should calculate latency reduction percentage", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      mockTime = 0;
      act(() => {
        result.current.controls.startLatencyMeasurement();
        result.current.controls.startAnticipation("tap");
      });

      mockTime = 100;
      act(() => {
        result.current.controls.endLatencyMeasurement();
      });

      // With anticipation, perceived should be less than actual
      expect(result.current.metrics.latencyReduction).toBeGreaterThanOrEqual(0);
    });
  });

  describe("skeleton state", () => {
    it("should provide skeleton styles", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startLoading();
      });

      const skeletonStyles = result.current.controls.getSkeletonStyles();
      expect(skeletonStyles).toBeDefined();
      expect(typeof skeletonStyles.opacity).toBe("number");
    });

    it("should show skeleton when loading", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startLoading();
      });

      expect(result.current.state.showSkeleton).toBe(true);
    });

    it("should hide skeleton when complete", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startLoading();
        result.current.controls.completeLoading();
      });

      expect(result.current.state.showSkeleton).toBe(false);
    });
  });

  describe("callbacks", () => {
    it("should call onAnticipationStart callback", () => {
      const onAnticipationStart = jest.fn();
      const { result } = renderHook(() =>
        useAvatarPerceivedLatencyReducer({}, { onAnticipationStart })
      );

      act(() => {
        result.current.controls.startAnticipation("tap");
      });

      expect(onAnticipationStart).toHaveBeenCalledWith("tap");
    });

    it("should call onLoadingPhaseChange callback", () => {
      const onLoadingPhaseChange = jest.fn();
      const { result } = renderHook(() =>
        useAvatarPerceivedLatencyReducer({}, { onLoadingPhaseChange })
      );

      act(() => {
        result.current.controls.startLoading();
      });

      expect(onLoadingPhaseChange).toHaveBeenCalledWith("skeleton");
    });
  });

  describe("metrics reset", () => {
    it("should reset all metrics", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      mockTime = 0;
      act(() => {
        result.current.controls.startLatencyMeasurement();
      });

      mockTime = 50;
      act(() => {
        result.current.controls.endLatencyMeasurement();
      });

      expect(result.current.metrics.actualLatencyMs).toBeGreaterThan(0);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.actualLatencyMs).toBe(0);
      expect(result.current.metrics.perceivedLatencyMs).toBe(0);
    });
  });

  // ============================================================================
  // Branch Coverage Tests - Sprint 617
  // ============================================================================

  describe("branch coverage - updateAnticipation early return (lines 156-158)", () => {
    it("should return early when no anticipation has started (line 154)", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      // updateAnticipation without starting anticipation first
      // This should hit the early return at line 154
      act(() => {
        result.current.controls.updateAnticipation();
      });

      // Anticipation level should remain 0
      expect(result.current.state.anticipationLevel).toBe(0);
    });

    it("should update anticipation after starting (for comparison)", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      mockTime = 0;
      act(() => {
        result.current.controls.startAnticipation("tap");
      });

      const initialLevel = result.current.state.anticipationLevel;

      mockTime = 50;
      act(() => {
        result.current.controls.updateAnticipation();
      });

      // Should update when anticipation has started
      expect(result.current.state.anticipationLevel).toBeGreaterThanOrEqual(initialLevel);
    });
  });

  describe("branch coverage - advanceLoading at complete phase (line 207)", () => {
    it("should not advance beyond complete phase (line 207)", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      // Get to complete phase
      act(() => {
        result.current.controls.completeLoading();
      });

      expect(result.current.state.loadingPhase).toBe("complete");

      // Try to advance - should stay at complete
      act(() => {
        result.current.controls.advanceLoading();
      });

      // Should still be at complete
      expect(result.current.state.loadingPhase).toBe("complete");
    });

    it("should not advance when already at last phase after advancing through all phases", () => {
      const onLoadingPhaseChange = jest.fn();
      const { result } = renderHook(() =>
        useAvatarPerceivedLatencyReducer({}, { onLoadingPhaseChange })
      );

      // Advance through all phases
      act(() => {
        result.current.controls.startLoading(); // skeleton
      });

      act(() => {
        result.current.controls.advanceLoading(); // lowRes
      });

      act(() => {
        result.current.controls.advanceLoading(); // mediumRes
      });

      act(() => {
        result.current.controls.advanceLoading(); // highRes
      });

      act(() => {
        result.current.controls.advanceLoading(); // complete
      });

      expect(result.current.state.loadingPhase).toBe("complete");
      onLoadingPhaseChange.mockClear();

      // Try to advance beyond complete - should not call callback
      act(() => {
        result.current.controls.advanceLoading();
      });

      // Callback should NOT be called since we're already at complete
      expect(onLoadingPhaseChange).not.toHaveBeenCalled();
      expect(result.current.state.loadingPhase).toBe("complete");
    });
  });

  describe("branch coverage - onAnticipationComplete callback (line 165)", () => {
    it("should call onAnticipationComplete callback", () => {
      const onAnticipationComplete = jest.fn();
      const { result } = renderHook(() =>
        useAvatarPerceivedLatencyReducer({}, { onAnticipationComplete })
      );

      act(() => {
        result.current.controls.startAnticipation("tap");
      });

      act(() => {
        result.current.controls.completeAnticipation();
      });

      expect(onAnticipationComplete).toHaveBeenCalled();
    });

    it("should not error when onAnticipationComplete is not provided", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startAnticipation("tap");
      });

      // Should not throw when completing without callback
      expect(() => {
        act(() => {
          result.current.controls.completeAnticipation();
        });
      }).not.toThrow();

      expect(result.current.state.anticipationLevel).toBe(0);
    });
  });

  describe("branch coverage - anticipation types (lines 147-148)", () => {
    it("should set initial level for drag type", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startAnticipation("drag");
      });

      // drag type should have initial level of 0.2
      expect(result.current.state.anticipationLevel).toBe(0.2);
    });

    it("should set initial level for scroll type", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startAnticipation("scroll");
      });

      // scroll type should have initial level of 0.2 (same as drag - else branch)
      expect(result.current.state.anticipationLevel).toBe(0.2);
    });

    it("should set initial level for hover type", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startAnticipation("hover");
      });

      // hover type should have initial level of 0.1
      expect(result.current.state.anticipationLevel).toBe(0.1);
    });

    it("should set initial level for tap type", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      act(() => {
        result.current.controls.startAnticipation("tap");
      });

      // tap type should have initial level of 0.3
      expect(result.current.state.anticipationLevel).toBe(0.3);
    });
  });

  describe("branch coverage - latency reduction calculation (lines 136-138)", () => {
    it("should calculate positive latency reduction when perceived < actual", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      mockTime = 0;
      act(() => {
        result.current.controls.startLatencyMeasurement();
        result.current.controls.startAnticipation("tap"); // Start anticipation to reduce perceived latency
      });

      mockTime = 200;
      act(() => {
        result.current.controls.endLatencyMeasurement();
      });

      // With anticipation, perceived should be less than actual
      expect(result.current.metrics.actualLatencyMs).toBe(200);
      expect(result.current.metrics.perceivedLatencyMs).toBeLessThan(200);
      expect(result.current.metrics.latencyReduction).toBeGreaterThan(0);
    });

    it("should cap latency reduction at 0 when perceived >= actual (line 138)", () => {
      const { result } = renderHook(() => useAvatarPerceivedLatencyReducer());

      mockTime = 0;
      act(() => {
        result.current.controls.startLatencyMeasurement();
        // No anticipation - perceived should equal actual
      });

      mockTime = 100;
      act(() => {
        result.current.controls.endLatencyMeasurement();
      });

      // Without anticipation, reduction should be 0
      expect(result.current.metrics.latencyReduction).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useAvatarPerceivedLatencyReducer());
      unmount();
    });
  });
});

describe("useAnticipatoryAnimation", () => {
  it("should provide anticipation control", () => {
    const { result } = renderHook(() => useAnticipatoryAnimation());

    expect(typeof result.current.start).toBe("function");
    expect(typeof result.current.complete).toBe("function");
    expect(result.current.isAnticipating).toBe(false);
  });

  it("should start anticipation", () => {
    const { result } = renderHook(() => useAnticipatoryAnimation());

    act(() => {
      result.current.start();
    });

    expect(result.current.isAnticipating).toBe(true);
  });

  it("should complete anticipation", () => {
    const { result } = renderHook(() => useAnticipatoryAnimation());

    act(() => {
      result.current.start();
      result.current.complete();
    });

    expect(result.current.isAnticipating).toBe(false);
  });

  it("should provide transform value", () => {
    const { result } = renderHook(() => useAnticipatoryAnimation());

    act(() => {
      result.current.start();
    });

    expect(result.current.transform).toBeDefined();
  });
});

describe("useProgressiveAvatarLoading", () => {
  it("should provide loading control", () => {
    const { result } = renderHook(() => useProgressiveAvatarLoading());

    expect(typeof result.current.startLoad).toBe("function");
    expect(typeof result.current.completeLoad).toBe("function");
    expect(result.current.phase).toBe("idle");
  });

  it("should start loading", () => {
    const { result } = renderHook(() => useProgressiveAvatarLoading());

    act(() => {
      result.current.startLoad();
    });

    expect(result.current.phase).not.toBe("idle");
  });

  it("should complete loading", () => {
    const { result } = renderHook(() => useProgressiveAvatarLoading());

    act(() => {
      result.current.startLoad();
      result.current.completeLoad();
    });

    expect(result.current.phase).toBe("complete");
  });

  it("should provide progress value", () => {
    const { result } = renderHook(() => useProgressiveAvatarLoading());

    act(() => {
      result.current.startLoad();
    });

    expect(result.current.progress).toBeGreaterThanOrEqual(0);
    expect(result.current.progress).toBeLessThanOrEqual(1);
  });
});
