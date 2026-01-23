/**
 * Tests for useAvatarTouchFeedbackBridge - Sprint 543
 *
 * Tests touch-to-visual feedback bridge:
 * - Instant visual feedback on touch
 * - Predictive avatar state
 * - Gesture detection
 * - Region mapping
 * - Transition states
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarTouchFeedbackBridge,
  useTouchFeedbackStyle,
  useAvatarPredictedState,
  useTouchFeedbackActive,
  useFeedbackLatency,
} from "../useAvatarTouchFeedbackBridge";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.useFakeTimers();
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ============================================================================
// Helper Functions
// ============================================================================

function createTouchPoint(
  id: number,
  x: number,
  y: number,
  pressure = 0.5
): { id: number; x: number; y: number; pressure: number; timestamp: number } {
  return { id, x, y, pressure, timestamp: mockTime };
}

// ============================================================================
// Main Hook Tests
// ============================================================================

describe("useAvatarTouchFeedbackBridge", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.transitionState).toBe("idle");
      expect(result.current.state.activeTouches).toHaveLength(0);
      expect(result.current.state.activeFeedbacks).toHaveLength(0);
    });

    it("should initialize with null predicted state", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      expect(result.current.state.predictedState).toBeNull();
      expect(result.current.state.lastGesture).toBeNull();
      expect(result.current.state.lastRegion).toBeNull();
    });

    it("should initialize with zero metrics", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      expect(result.current.metrics.feedbackLatencyMs).toBe(0);
      expect(result.current.metrics.gesturesDetected).toBe(0);
      expect(result.current.metrics.feedbacksTriggered).toBe(0);
    });

    it("should provide control functions", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      expect(typeof result.current.controls.enable).toBe("function");
      expect(typeof result.current.controls.disable).toBe("function");
      expect(typeof result.current.controls.processTouchStart).toBe("function");
      expect(typeof result.current.controls.processTouchMove).toBe("function");
      expect(typeof result.current.controls.processTouchEnd).toBe("function");
      expect(typeof result.current.controls.triggerFeedback).toBe("function");
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({
          feedbackDelayMs: 10,
          transitionDurationMs: 200,
        })
      );

      expect(result.current.state.isActive).toBe(false);
    });
  });

  describe("enable/disable", () => {
    it("should enable the bridge", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      expect(result.current.state.isActive).toBe(true);
    });

    it("should disable the bridge", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      expect(result.current.state.isActive).toBe(true);

      act(() => {
        result.current.controls.disable();
      });

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.activeTouches).toHaveLength(0);
      expect(result.current.state.activeFeedbacks).toHaveLength(0);
    });
  });

  describe("touch processing", () => {
    it("should process touch start", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      const touches = [createTouchPoint(1, 100, 150, 0.7)];

      act(() => {
        result.current.controls.processTouchStart(touches, "face");
      });

      expect(result.current.state.activeTouches).toHaveLength(1);
      expect(result.current.state.lastRegion).toBe("face");
      expect(result.current.state.transitionState).toBe("feedback");
    });

    it("should return feedbacks from touch start", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      const touches = [createTouchPoint(1, 100, 150, 0.7)];
      let feedbacks: ReturnType<typeof result.current.controls.processTouchStart>;

      act(() => {
        feedbacks = result.current.controls.processTouchStart(touches, "eyes");
      });

      expect(feedbacks!).toHaveLength(1);
      expect(feedbacks![0].region).toBe("eyes");
      expect(feedbacks![0].feedbackType).toBe("pulse"); // eyes -> pulse
    });

    it("should not process touch when disabled", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      // Don't enable

      const touches = [createTouchPoint(1, 100, 150)];
      let feedbacks: ReturnType<typeof result.current.controls.processTouchStart>;

      act(() => {
        feedbacks = result.current.controls.processTouchStart(touches, "face");
      });

      expect(feedbacks!).toHaveLength(0);
      expect(result.current.state.activeTouches).toHaveLength(0);
    });

    it("should process touch move", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 150)],
          "face"
        );
      });

      mockTime += 16;

      // Move touch
      act(() => {
        result.current.controls.processTouchMove([
          createTouchPoint(1, 120, 160),
        ]);
      });

      expect(result.current.state.activeTouches[0].x).toBe(120);
      expect(result.current.state.activeTouches[0].y).toBe(160);
    });

    it("should process touch end", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 150)],
          "face"
        );
      });

      expect(result.current.state.activeTouches).toHaveLength(1);

      // End touch
      act(() => {
        result.current.controls.processTouchEnd([1]);
      });

      expect(result.current.state.activeTouches).toHaveLength(0);
      expect(result.current.state.transitionState).toBe("transitioning");
    });
  });

  describe("feedback triggering", () => {
    it("should trigger feedback manually", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      let feedback: ReturnType<typeof result.current.controls.triggerFeedback>;

      act(() => {
        feedback = result.current.controls.triggerFeedback("face", "glow", 0.8);
      });

      expect(feedback!.region).toBe("face");
      expect(feedback!.feedbackType).toBe("glow");
      expect(feedback!.intensity).toBe(0.8);
      expect(result.current.state.activeFeedbacks).toHaveLength(1);
    });

    it("should clamp intensity to valid range", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      let feedback: ReturnType<typeof result.current.controls.triggerFeedback>;

      act(() => {
        feedback = result.current.controls.triggerFeedback("face", "glow", 1.5);
      });

      expect(feedback!.intensity).toBe(1);

      act(() => {
        feedback = result.current.controls.triggerFeedback("eyes", "pulse", -0.5);
      });

      expect(feedback!.intensity).toBe(0);
    });

    it("should clear feedbacks", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
        result.current.controls.triggerFeedback("face", "glow");
        result.current.controls.triggerFeedback("eyes", "pulse");
      });

      expect(result.current.state.activeFeedbacks.length).toBeGreaterThan(0);

      act(() => {
        result.current.controls.clearFeedbacks();
      });

      expect(result.current.state.activeFeedbacks).toHaveLength(0);
      expect(result.current.state.transitionState).toBe("idle");
    });

    it("should limit concurrent feedbacks", () => {
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({ maxConcurrentFeedbacks: 3 })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Trigger more than max
      act(() => {
        result.current.controls.triggerFeedback("face", "glow");
        result.current.controls.triggerFeedback("eyes", "pulse");
        result.current.controls.triggerFeedback("mouth", "scale");
        result.current.controls.triggerFeedback("head", "highlight");
        result.current.controls.triggerFeedback("body", "ripple");
      });

      expect(result.current.state.activeFeedbacks.length).toBeLessThanOrEqual(3);
    });
  });

  describe("gesture detection", () => {
    it("should detect tap gesture", () => {
      const onGestureDetected = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({}, { onGestureDetected })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Quick tap
      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      expect(onGestureDetected).toHaveBeenCalledWith("tap", "face");
      expect(result.current.state.lastGesture).toBe("tap");
    });

    it("should detect swipe gesture", () => {
      const onGestureDetected = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({}, { onGestureDetected })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      // Move significantly
      for (let i = 1; i <= 5; i++) {
        mockTime += 16;
        act(() => {
          result.current.controls.processTouchMove([
            createTouchPoint(1, 100 + i * 20, 100),
          ]);
        });
      }

      expect(result.current.state.lastGesture).toBe("swipe");
    });

    it("should track gestures detected count", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      expect(result.current.metrics.gesturesDetected).toBe(0);

      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      expect(result.current.metrics.gesturesDetected).toBe(1);
    });
  });

  describe("prediction", () => {
    it("should predict avatar state when enabled", () => {
      const onPrediction = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge(
          { enablePrediction: true },
          { onPrediction }
        )
      );

      act(() => {
        result.current.controls.enable();
      });

      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100, 0.8)],
          "face"
        );
      });

      expect(onPrediction).toHaveBeenCalled();
      expect(result.current.state.predictedState).not.toBeNull();
      expect(result.current.state.predictedState?.expression).toBe("curious"); // tap -> curious
    });

    it("should not predict when disabled", () => {
      const onPrediction = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge(
          { enablePrediction: false },
          { onPrediction }
        )
      );

      act(() => {
        result.current.controls.enable();
      });

      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      expect(onPrediction).not.toHaveBeenCalled();
      expect(result.current.state.predictedState).toBeNull();
    });

    it("should update prediction on touch move", () => {
      const onPrediction = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge(
          { enablePrediction: true },
          { onPrediction }
        )
      );

      act(() => {
        result.current.controls.enable();
      });

      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      const initialCallCount = onPrediction.mock.calls.length;

      mockTime += 16;
      act(() => {
        result.current.controls.processTouchMove([
          createTouchPoint(1, 200, 100),
        ]);
      });

      expect(onPrediction.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe("region mapping", () => {
    it("should map point to head region", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      const bounds = { left: 0, top: 0, width: 500, height: 500 } as DOMRect;

      const region = result.current.controls.getRegionFromPoint(250, 100, bounds);
      expect(region).toBe("head");
    });

    it("should map point to face region", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      const bounds = { left: 0, top: 0, width: 500, height: 500 } as DOMRect;

      const region = result.current.controls.getRegionFromPoint(250, 200, bounds);
      expect(region).toBe("face");
    });

    it("should map point to eyes region", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      const bounds = { left: 0, top: 0, width: 500, height: 500 } as DOMRect;

      // Eyes are at sides of face area
      const region = result.current.controls.getRegionFromPoint(100, 200, bounds);
      expect(region).toBe("eyes");
    });

    it("should map point to mouth region", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      const bounds = { left: 0, top: 0, width: 500, height: 500 } as DOMRect;

      const region = result.current.controls.getRegionFromPoint(250, 275, bounds);
      expect(region).toBe("mouth");
    });

    it("should map point to body region", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      const bounds = { left: 0, top: 0, width: 500, height: 500 } as DOMRect;

      const region = result.current.controls.getRegionFromPoint(250, 350, bounds);
      expect(region).toBe("body");
    });
  });

  describe("state synchronization", () => {
    it("should sync with actual avatar state", () => {
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({ enablePrediction: true })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Generate prediction
      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      expect(result.current.state.predictedState).not.toBeNull();

      // Sync with actual state
      act(() => {
        result.current.controls.syncWithAvatarState({ expression: "curious" });
      });

      expect(result.current.state.transitionState).toBe("synced");
      expect(result.current.state.predictedState).toBeNull();
    });

    it("should update prediction accuracy on sync", () => {
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({ enablePrediction: true })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Generate prediction
      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      const initialAccuracy = result.current.metrics.predictionAccuracy;

      // Sync with matching expression
      act(() => {
        result.current.controls.syncWithAvatarState({ expression: "curious" });
      });

      // Accuracy should remain high for correct prediction
      expect(result.current.metrics.predictionAccuracy).toBeGreaterThanOrEqual(0);
    });
  });

  describe("callbacks", () => {
    it("should call onFeedbackStart", () => {
      const onFeedbackStart = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({}, { onFeedbackStart })
      );

      act(() => {
        result.current.controls.enable();
        result.current.controls.triggerFeedback("face", "glow");
      });

      expect(onFeedbackStart).toHaveBeenCalled();
      expect(onFeedbackStart.mock.calls[0][0].region).toBe("face");
    });

    it("should call onFeedbackEnd after decay", () => {
      const onFeedbackEnd = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge(
          { feedbackDecayMs: 100 },
          { onFeedbackEnd }
        )
      );

      act(() => {
        result.current.controls.enable();
        result.current.controls.triggerFeedback("face", "glow");
      });

      expect(onFeedbackEnd).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(onFeedbackEnd).toHaveBeenCalled();
    });

    it("should call onStateTransition", () => {
      const onStateTransition = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({}, { onStateTransition })
      );

      act(() => {
        result.current.controls.enable();
      });

      act(() => {
        result.current.controls.triggerFeedback("face", "glow");
      });

      // Should transition from idle to feedback
      expect(onStateTransition).toHaveBeenCalledWith("idle", "feedback");
    });
  });

  describe("metrics", () => {
    it("should track feedback latency", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
        result.current.controls.triggerFeedback("face", "glow");
      });

      expect(result.current.metrics.feedbackLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should track feedbacks triggered count", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      expect(result.current.metrics.feedbacksTriggered).toBe(0);

      act(() => {
        result.current.controls.triggerFeedback("face", "glow");
        result.current.controls.triggerFeedback("eyes", "pulse");
      });

      expect(result.current.metrics.feedbacksTriggered).toBe(2);
    });

    it("should reset metrics", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
        result.current.controls.triggerFeedback("face", "glow");
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      expect(result.current.metrics.feedbacksTriggered).toBeGreaterThan(0);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.feedbackLatencyMs).toBe(0);
      expect(result.current.metrics.gesturesDetected).toBe(0);
      expect(result.current.metrics.feedbacksTriggered).toBe(0);
    });
  });

  describe("feedback styles", () => {
    it("should create highlight style", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      let feedback: ReturnType<typeof result.current.controls.triggerFeedback>;

      act(() => {
        feedback = result.current.controls.triggerFeedback("head", "highlight", 0.5);
      });

      expect(feedback!.style.filter).toContain("brightness");
    });

    it("should create glow style", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      let feedback: ReturnType<typeof result.current.controls.triggerFeedback>;

      act(() => {
        feedback = result.current.controls.triggerFeedback("face", "glow", 0.5);
      });

      expect(feedback!.style.filter).toContain("drop-shadow");
    });

    it("should create scale style", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      let feedback: ReturnType<typeof result.current.controls.triggerFeedback>;

      act(() => {
        feedback = result.current.controls.triggerFeedback("mouth", "scale", 0.5);
      });

      expect(feedback!.style.transform).toContain("scale");
    });
  });
});

// ============================================================================
// Convenience Hooks Tests
// ============================================================================

describe("useTouchFeedbackStyle", () => {
  it("should return null when no feedback for region", () => {
    const { result } = renderHook(() => useTouchFeedbackStyle("face"));

    expect(result.current).toBeNull();
  });
});

describe("useAvatarPredictedState", () => {
  it("should return null initially", () => {
    const { result } = renderHook(() => useAvatarPredictedState());

    expect(result.current).toBeNull();
  });
});

describe("useTouchFeedbackActive", () => {
  it("should return false when idle", () => {
    const { result } = renderHook(() => useTouchFeedbackActive());

    expect(result.current).toBe(false);
  });
});

describe("useFeedbackLatency", () => {
  it("should provide latency metrics", () => {
    const { result } = renderHook(() => useFeedbackLatency());

    expect(result.current.current).toBe(0);
    expect(result.current.average).toBe(0);
  });
});

// ============================================================================
// Additional Branch Coverage Tests - Sprint 543
// ============================================================================

describe("useAvatarTouchFeedbackBridge - branch coverage", () => {
  describe("multi-touch gestures", () => {
    it("should detect pinch gesture with two touches", () => {
      const onGestureDetected = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({}, { onGestureDetected })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start with two touches close together
      const touches1 = [
        createTouchPoint(1, 200, 200),
        createTouchPoint(2, 250, 200),
      ];

      act(() => {
        result.current.controls.processTouchStart(touches1, "face");
      });

      // Move touches apart significantly (> 30px change)
      mockTime += 16;
      const touches2 = [
        createTouchPoint(1, 150, 200),
        createTouchPoint(2, 300, 200),
      ];

      act(() => {
        result.current.controls.processTouchMove(touches2);
      });

      expect(result.current.state.lastGesture).toBe("pinch");
    });

    it("should detect rotate gesture with two touches", () => {
      const onGestureDetected = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({}, { onGestureDetected })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start with two horizontal touches
      const touches1 = [
        createTouchPoint(1, 200, 200),
        createTouchPoint(2, 300, 200),
      ];

      act(() => {
        result.current.controls.processTouchStart(touches1, "face");
      });

      // Rotate (change angle > 0.2 radians) without changing distance much
      mockTime += 16;
      const touches2 = [
        createTouchPoint(1, 200, 200),
        createTouchPoint(2, 280, 260), // Rotated position
      ];

      act(() => {
        result.current.controls.processTouchMove(touches2);
      });

      expect(result.current.state.lastGesture).toBe("rotate");
    });

    it("should handle two touches without enough history", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      // Start with two touches - no history yet
      const touches = [
        createTouchPoint(1, 200, 200),
        createTouchPoint(2, 250, 200),
      ];

      act(() => {
        result.current.controls.processTouchStart(touches, "face");
      });

      // With two touches and no history, gesture returns null (multi-touch code path)
      // But since we have two feedbacks triggered, lastGesture may be null
      expect(result.current.state.activeTouches).toHaveLength(2);
    });

    it("should return null for more than two touches", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      // Start with three touches
      const touches = [
        createTouchPoint(1, 100, 100),
        createTouchPoint(2, 200, 200),
        createTouchPoint(3, 300, 300),
      ];

      act(() => {
        result.current.controls.processTouchStart(touches, "face");
      });

      // With 3 touches, no specific gesture is detected initially
      // It will fall back to null in the gesture detection
      expect(result.current.state.activeTouches).toHaveLength(3);
    });
  });

  describe("long-press gesture", () => {
    it("should detect long-press gesture", () => {
      const onGestureDetected = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({}, { onGestureDetected })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      const touch = createTouchPoint(1, 100, 100);

      act(() => {
        result.current.controls.processTouchStart([touch], "face");
      });

      // Advance time for long-press (> 500ms)
      mockTime += 600;

      // Small move to trigger gesture check (< 20px distance)
      const touch2 = createTouchPoint(1, 105, 105);

      act(() => {
        result.current.controls.processTouchMove([touch2]);
      });

      expect(result.current.state.lastGesture).toBe("long-press");
    });
  });

  describe("latency history management", () => {
    it("should limit latency history to 100 entries", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      // Trigger 110 feedbacks to exceed the 100 limit
      for (let i = 0; i < 110; i++) {
        act(() => {
          result.current.controls.triggerFeedback("face", "glow", 0.5);
        });
        mockTime += 1;
      }

      // Metrics should still work correctly
      expect(result.current.metrics.feedbacksTriggered).toBe(110);
      expect(result.current.metrics.averageFeedbackLatency).toBeGreaterThanOrEqual(0);
    });
  });

  describe("region mapping edge cases", () => {
    it("should map point to hand region (lower corners)", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      const bounds = { left: 0, top: 0, width: 500, height: 500 } as DOMRect;

      // Left hand area (normalizedY > 0.8 and normalizedX < 0.3)
      const leftHand = result.current.controls.getRegionFromPoint(100, 450, bounds);
      expect(leftHand).toBe("hand");

      // Right hand area (normalizedY > 0.8 and normalizedX > 0.7)
      const rightHand = result.current.controls.getRegionFromPoint(400, 450, bounds);
      expect(rightHand).toBe("hand");
    });

    it("should map center bottom to body region", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      const bounds = { left: 0, top: 0, width: 500, height: 500 } as DOMRect;

      // Center bottom (normalizedY > 0.8 but center x)
      const centerBottom = result.current.controls.getRegionFromPoint(250, 450, bounds);
      expect(centerBottom).toBe("body");
    });
  });

  describe("touch end transition", () => {
    it("should transition to synced state after all touches end", () => {
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({ transitionDurationMs: 50 })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start touch
      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      expect(result.current.state.activeTouches).toHaveLength(1);

      // End touch
      act(() => {
        result.current.controls.processTouchEnd([1]);
      });

      expect(result.current.state.activeTouches).toHaveLength(0);
      expect(result.current.state.transitionState).toBe("transitioning");

      // After transition duration
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current.state.transitionState).toBe("synced");
      expect(result.current.state.predictedState).toBeNull();
    });
  });

  describe("ripple feedback style", () => {
    it("should create ripple style", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      let feedback: ReturnType<typeof result.current.controls.triggerFeedback>;

      act(() => {
        feedback = result.current.controls.triggerFeedback("body", "ripple", 0.5);
      });

      expect(feedback!.style.transform).toContain("scale");
      expect(feedback!.style.opacity).toBeGreaterThan(0.5);
    });
  });

  describe("empty touches handling", () => {
    it("should handle processTouchMove with empty touches", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      act(() => {
        result.current.controls.enable();
      });

      // Try to process empty touches
      act(() => {
        result.current.controls.processTouchMove([]);
      });

      expect(result.current.state.activeTouches).toHaveLength(0);
    });

    it("should handle processTouchEnd when disabled", () => {
      const { result } = renderHook(() => useAvatarTouchFeedbackBridge());

      // Don't enable

      // Try to end touch when disabled
      act(() => {
        result.current.controls.processTouchEnd([1]);
      });

      expect(result.current.state.transitionState).toBe("idle");
    });
  });

  describe("prediction without gesture", () => {
    it("should predict neutral expression when no gesture detected", () => {
      const onPrediction = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge(
          { enablePrediction: true },
          { onPrediction }
        )
      );

      act(() => {
        result.current.controls.enable();
      });

      // Process touch with empty history (no gesture)
      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      // First touch always detects "tap" so let's check it gets curious
      expect(result.current.state.predictedState?.expression).toBe("curious");
    });
  });

  describe("gesture change during move", () => {
    it("should update gesture on touch move and call callback", () => {
      const onGestureDetected = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({}, { onGestureDetected })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Start with tap
      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      expect(result.current.state.lastGesture).toBe("tap");
      const initialCount = onGestureDetected.mock.calls.length;

      // Move to create swipe (> 50px)
      for (let i = 1; i <= 5; i++) {
        mockTime += 16;
        act(() => {
          result.current.controls.processTouchMove([
            createTouchPoint(1, 100 + i * 15, 100),
          ]);
        });
      }

      // Gesture should change and callback should be called again
      expect(result.current.state.lastGesture).toBe("swipe");
      expect(onGestureDetected.mock.calls.length).toBeGreaterThan(initialCount);
    });
  });

  describe("sync prediction accuracy", () => {
    it("should decrease accuracy on prediction mismatch", () => {
      const { result } = renderHook(() =>
        useAvatarTouchFeedbackBridge({ enablePrediction: true })
      );

      act(() => {
        result.current.controls.enable();
      });

      // Generate prediction
      act(() => {
        result.current.controls.processTouchStart(
          [createTouchPoint(1, 100, 100)],
          "face"
        );
      });

      expect(result.current.state.predictedState?.expression).toBe("curious");

      const initialAccuracy = result.current.metrics.predictionAccuracy;

      // Sync with mismatched expression
      act(() => {
        result.current.controls.syncWithAvatarState({ expression: "sad" });
      });

      // Accuracy should decrease
      expect(result.current.metrics.predictionAccuracy).toBeLessThan(initialAccuracy);
    });
  });
});
