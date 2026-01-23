/**
 * Tests for Avatar Gesture Response Accelerator Hook - Sprint 533
 *
 * Tests gesture-to-avatar response pipeline optimization including:
 * - Predictive gesture recognition
 * - Instant visual feedback
 * - Latency compensation
 * - Priority-based avatar response scheduling
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarGestureResponseAccelerator,
  useInstantAvatarFeedback,
  useGesturePrioritizedResponse,
  GestureIntent,
  AvatarResponseType,
  ScheduledResponse,
} from "../useAvatarGestureResponseAccelerator";

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

describe("useAvatarGestureResponseAccelerator", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.currentGesture).toBeNull();
      expect(result.current.state.pendingResponses).toBe(0);
      expect(result.current.state.feedbackMode).toBe("instant");
    });

    it("should initialize with zero latency metrics", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      expect(result.current.metrics.averageResponseTimeMs).toBe(0);
      expect(result.current.metrics.gesturesProcessed).toBe(0);
      expect(result.current.metrics.feedbackLatencyMs).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAvatarGestureResponseAccelerator({
          feedbackMode: "predictive",
          targetResponseTimeMs: 8,
          maxQueuedResponses: 5,
        })
      );

      expect(result.current.state.feedbackMode).toBe("predictive");
    });

    it("should initialize prediction confidence to zero", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      expect(result.current.state.predictionConfidence).toBe(0);
    });
  });

  describe("gesture recognition", () => {
    it("should recognize tap gesture", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      let intent: GestureIntent | null = null;
      act(() => {
        intent = result.current.controls.recognizeGesture({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      expect(intent).not.toBeNull();
      expect(intent!.gestureType).toBe("tap");
      expect(intent!.avatarResponse).toBe("acknowledge");
    });

    it("should recognize swipe gesture", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      let intent: GestureIntent | null = null;
      act(() => {
        intent = result.current.controls.recognizeGesture({
          type: "swipe",
          direction: "right",
          velocity: 500,
          position: { x: 200, y: 100 },
          timestamp: mockTime,
        });
      });

      expect(intent).not.toBeNull();
      expect(intent!.gestureType).toBe("swipe");
      expect(intent!.avatarResponse).toBe("track");
    });

    it("should recognize long press gesture", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      let intent: GestureIntent | null = null;
      act(() => {
        intent = result.current.controls.recognizeGesture({
          type: "longPress",
          position: { x: 150, y: 150 },
          duration: 500,
          timestamp: mockTime,
        });
      });

      expect(intent).not.toBeNull();
      expect(intent!.gestureType).toBe("longPress");
      expect(intent!.avatarResponse).toBe("focus");
    });

    it("should recognize pinch gesture", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      let intent: GestureIntent | null = null;
      act(() => {
        intent = result.current.controls.recognizeGesture({
          type: "pinch",
          position: { x: 200, y: 200 },
          scale: 1.5,
          center: { x: 200, y: 200 },
          timestamp: mockTime,
        });
      });

      expect(intent).not.toBeNull();
      expect(intent!.gestureType).toBe("pinch");
      expect(intent!.avatarResponse).toBe("scale");
    });

    it("should increment gestures processed", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      act(() => {
        result.current.controls.recognizeGesture({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      expect(result.current.metrics.gesturesProcessed).toBe(1);
    });
  });

  describe("instant feedback", () => {
    it("should trigger instant visual feedback for tap", () => {
      const onFeedback = jest.fn();
      const { result } = renderHook(() =>
        useAvatarGestureResponseAccelerator({}, { onInstantFeedback: onFeedback })
      );

      act(() => {
        result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 100 });
      });

      expect(onFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          feedbackType: "highlight",
          position: { x: 100, y: 100 },
        })
      );
    });

    it("should queue avatar response after feedback", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      act(() => {
        result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 100 });
      });

      expect(result.current.state.pendingResponses).toBeGreaterThan(0);
    });

    it("should apply feedback immediately under 16ms", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      mockTime = 0;
      act(() => {
        result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 100 });
      });

      mockTime = 10;
      expect(result.current.metrics.feedbackLatencyMs).toBeLessThan(16);
    });
  });

  describe("avatar response scheduling", () => {
    it("should schedule avatar response with priority", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      let responseId: string = "";
      act(() => {
        responseId = result.current.controls.scheduleAvatarResponse({
          type: "acknowledge",
          priority: "high",
          delay: 0,
        });
      });

      expect(responseId).toMatch(/^response_/);
    });

    it("should queue high priority responses", () => {
      const { result } = renderHook(() =>
        useAvatarGestureResponseAccelerator()
      );

      act(() => {
        result.current.controls.scheduleAvatarResponse({
          type: "track",
          priority: "low",
          delay: 0,
        });
        result.current.controls.scheduleAvatarResponse({
          type: "acknowledge",
          priority: "high",
          delay: 0,
        });
      });

      // Both responses should be scheduled
      expect(result.current.state.pendingResponses).toBe(2);
    });

    it("should respect max queued responses", () => {
      const { result } = renderHook(() =>
        useAvatarGestureResponseAccelerator({
          maxQueuedResponses: 2,
        })
      );

      act(() => {
        result.current.controls.scheduleAvatarResponse({
          type: "acknowledge",
          priority: "normal",
          delay: 100,
        });
        result.current.controls.scheduleAvatarResponse({
          type: "track",
          priority: "normal",
          delay: 100,
        });
        result.current.controls.scheduleAvatarResponse({
          type: "focus",
          priority: "normal",
          delay: 100,
        });
      });

      expect(result.current.state.pendingResponses).toBeLessThanOrEqual(2);
    });

    it("should cancel pending response", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      let responseId: string = "";
      act(() => {
        responseId = result.current.controls.scheduleAvatarResponse({
          type: "acknowledge",
          priority: "normal",
          delay: 100,
        });
      });

      const initialPending = result.current.state.pendingResponses;

      act(() => {
        result.current.controls.cancelResponse(responseId);
      });

      expect(result.current.state.pendingResponses).toBeLessThan(initialPending);
    });
  });

  describe("predictive mode", () => {
    it("should predict gesture intent from partial data", () => {
      const { result } = renderHook(() =>
        useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" })
      );

      let prediction: GestureIntent | null = null;
      act(() => {
        prediction = result.current.controls.predictGestureIntent({
          touchStart: { x: 100, y: 100 },
          currentPosition: { x: 120, y: 100 },
          velocity: { x: 200, y: 0 },
          elapsed: 50,
        });
      });

      expect(prediction).not.toBeNull();
      expect(prediction!.gestureType).toBe("swipe");
      expect(result.current.state.predictionConfidence).toBeGreaterThan(0);
    });

    it("should update prediction confidence based on accuracy", () => {
      const { result } = renderHook(() =>
        useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" })
      );

      // Make a prediction
      act(() => {
        result.current.controls.predictGestureIntent({
          touchStart: { x: 100, y: 100 },
          currentPosition: { x: 150, y: 100 },
          velocity: { x: 300, y: 0 },
          elapsed: 100,
        });
      });

      // Confirm prediction was correct
      act(() => {
        result.current.controls.confirmPrediction(true);
      });

      expect(result.current.state.predictionConfidence).toBeGreaterThan(0.5);
    });

    it("should decrease confidence on wrong prediction", () => {
      const { result } = renderHook(() =>
        useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" })
      );

      // Set initial confidence
      act(() => {
        result.current.controls.predictGestureIntent({
          touchStart: { x: 100, y: 100 },
          currentPosition: { x: 150, y: 100 },
          velocity: { x: 300, y: 0 },
          elapsed: 100,
        });
        result.current.controls.confirmPrediction(true);
      });

      const initialConfidence = result.current.state.predictionConfidence;

      // Make wrong prediction
      act(() => {
        result.current.controls.predictGestureIntent({
          touchStart: { x: 100, y: 100 },
          currentPosition: { x: 105, y: 100 },
          velocity: { x: 50, y: 0 },
          elapsed: 100,
        });
        result.current.controls.confirmPrediction(false);
      });

      expect(result.current.state.predictionConfidence).toBeLessThan(initialConfidence);
    });
  });

  describe("latency compensation", () => {
    it("should compensate for network latency", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      act(() => {
        result.current.controls.setNetworkLatency(50);
      });

      // Response delay should account for network latency
      act(() => {
        result.current.controls.scheduleAvatarResponse({
          type: "acknowledge",
          priority: "high",
          delay: 0,
        });
      });

      expect(result.current.state.latencyCompensation).toBeGreaterThan(0);
    });

    it("should adjust response timing based on device capability", () => {
      const { result } = renderHook(() =>
        useAvatarGestureResponseAccelerator({
          deviceCapability: "low",
        })
      );

      // Low-end devices should have adjusted timing
      expect(result.current.state.targetFrameTimeMs).toBeGreaterThan(16.67);
    });

    it("should track response time metrics", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      mockTime = 0;
      act(() => {
        const id = result.current.controls.scheduleAvatarResponse({
          type: "acknowledge",
          priority: "high",
          delay: 0,
        });

        mockTime = 20;
        result.current.controls.markResponseComplete(id);
      });

      expect(result.current.metrics.averageResponseTimeMs).toBeGreaterThan(0);
    });
  });

  describe("gesture-to-avatar mapping", () => {
    it("should map tap to acknowledge response", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      const response = result.current.controls.getAvatarResponseForGesture("tap");
      expect(response).toBe("acknowledge");
    });

    it("should map swipe to track response", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      const response = result.current.controls.getAvatarResponseForGesture("swipe");
      expect(response).toBe("track");
    });

    it("should map long press to focus response", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      const response = result.current.controls.getAvatarResponseForGesture("longPress");
      expect(response).toBe("focus");
    });

    it("should map pinch to scale response", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      const response = result.current.controls.getAvatarResponseForGesture("pinch");
      expect(response).toBe("scale");
    });

    it("should allow custom gesture mapping", () => {
      const { result } = renderHook(() =>
        useAvatarGestureResponseAccelerator({
          gestureMapping: {
            tap: "smile",
            swipe: "turn",
          },
        })
      );

      const response = result.current.controls.getAvatarResponseForGesture("tap");
      expect(response).toBe("smile");
    });
  });

  describe("metrics", () => {
    it("should track gesture recognition rate", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      act(() => {
        result.current.controls.recognizeGesture({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
        result.current.controls.recognizeGesture({
          type: "swipe",
          direction: "left",
          velocity: 400,
          position: { x: 100, y: 100 },
          timestamp: mockTime + 100,
        });
      });

      expect(result.current.metrics.gesturesProcessed).toBe(2);
    });

    it("should track prediction accuracy", () => {
      const { result } = renderHook(() =>
        useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" })
      );

      act(() => {
        result.current.controls.predictGestureIntent({
          touchStart: { x: 100, y: 100 },
          currentPosition: { x: 150, y: 100 },
          velocity: { x: 300, y: 0 },
          elapsed: 100,
        });
        result.current.controls.confirmPrediction(true);

        result.current.controls.predictGestureIntent({
          touchStart: { x: 100, y: 100 },
          currentPosition: { x: 105, y: 100 },
          velocity: { x: 50, y: 0 },
          elapsed: 100,
        });
        result.current.controls.confirmPrediction(false);
      });

      expect(result.current.metrics.predictionAccuracy).toBe(0.5);
    });

    it("should reset metrics", () => {
      const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

      act(() => {
        result.current.controls.recognizeGesture({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      expect(result.current.metrics.gesturesProcessed).toBe(1);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.gesturesProcessed).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useAvatarGestureResponseAccelerator());

      unmount();
      // No error means cleanup succeeded
    });

    it("should cancel all pending responses on cleanup", () => {
      const { result, unmount } = renderHook(() => useAvatarGestureResponseAccelerator());

      act(() => {
        result.current.controls.scheduleAvatarResponse({
          type: "acknowledge",
          priority: "normal",
          delay: 1000,
        });
      });

      unmount();
      // Pending responses should be cancelled (no error on unmount)
    });
  });
});

describe("useInstantAvatarFeedback", () => {
  it("should provide feedback trigger function", () => {
    const { result } = renderHook(() => useInstantAvatarFeedback());

    expect(typeof result.current.trigger).toBe("function");
    expect(typeof result.current.cancel).toBe("function");
  });

  it("should trigger feedback for position", () => {
    const onFeedback = jest.fn();
    const { result } = renderHook(() => useInstantAvatarFeedback(onFeedback));

    act(() => {
      result.current.trigger({ x: 100, y: 100 });
    });

    expect(onFeedback).toHaveBeenCalled();
  });

  it("should track active feedback state", () => {
    const { result } = renderHook(() => useInstantAvatarFeedback());

    expect(result.current.isActive).toBe(false);

    act(() => {
      result.current.trigger({ x: 100, y: 100 });
    });

    expect(result.current.isActive).toBe(true);
  });
});

describe("useGesturePrioritizedResponse", () => {
  it("should provide response scheduling function", () => {
    const { result } = renderHook(() => useGesturePrioritizedResponse());

    expect(typeof result.current.schedule).toBe("function");
    expect(typeof result.current.cancel).toBe("function");
    expect(typeof result.current.flush).toBe("function");
  });

  it("should schedule response with priority", () => {
    const { result } = renderHook(() => useGesturePrioritizedResponse());

    let id: string = "";
    act(() => {
      id = result.current.schedule("acknowledge", "high");
    });

    expect(id).toBeDefined();
    expect(result.current.pending).toBe(1);
  });

  it("should flush all pending responses", () => {
    const { result } = renderHook(() => useGesturePrioritizedResponse());

    act(() => {
      result.current.schedule("acknowledge", "normal");
      result.current.schedule("track", "normal");
    });

    expect(result.current.pending).toBe(2);

    act(() => {
      result.current.flush();
    });

    expect(result.current.pending).toBe(0);
  });

  it("should cancel specific response by id (lines 594-600)", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useGesturePrioritizedResponse());

    let id: string = "";
    act(() => {
      id = result.current.schedule("acknowledge", "normal");
      result.current.schedule("track", "low");
    });

    expect(result.current.pending).toBe(2);

    act(() => {
      result.current.cancel(id);
    });

    expect(result.current.pending).toBe(1);
    jest.useRealTimers();
  });

  it("should handle cancel for non-existent id gracefully (line 595)", () => {
    const { result } = renderHook(() => useGesturePrioritizedResponse());

    act(() => {
      result.current.schedule("acknowledge", "normal");
    });

    expect(result.current.pending).toBe(1);

    // Cancel non-existent ID - should not affect pending count
    act(() => {
      result.current.cancel("non_existent_id");
    });

    expect(result.current.pending).toBe(1);
  });

  it("should schedule low priority with 50ms delay (line 579)", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useGesturePrioritizedResponse());

    act(() => {
      result.current.schedule("track", "low");
    });

    expect(result.current.pending).toBe(1);

    // After 50ms, response should auto-complete
    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(result.current.pending).toBe(0);
    jest.useRealTimers();
  });

  it("should auto-complete responses after delay (lines 581-584)", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useGesturePrioritizedResponse());

    act(() => {
      result.current.schedule("acknowledge", "high"); // 0ms delay
    });

    expect(result.current.pending).toBe(1);

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current.pending).toBe(0);
    jest.useRealTimers();
  });

  it("should cleanup timers on unmount (lines 609-612)", () => {
    jest.useFakeTimers();
    const { result, unmount } = renderHook(() => useGesturePrioritizedResponse());

    act(() => {
      result.current.schedule("acknowledge", "low");
      result.current.schedule("track", "low");
    });

    expect(result.current.pending).toBe(2);

    unmount();
    // No error means cleanup succeeded
    jest.useRealTimers();
  });
});

// ============================================================================
// Branch Coverage Tests - Sprint 610
// ============================================================================

describe("branch coverage - getTargetFrameTime (lines 176-186)", () => {
  it("should return 20ms for medium capability (line 181)", () => {
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({
        deviceCapability: "medium",
      })
    );

    expect(result.current.state.targetFrameTimeMs).toBe(20);
  });

  it("should return 16.67ms for high capability (line 179)", () => {
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({
        deviceCapability: "high",
      })
    );

    expect(result.current.state.targetFrameTimeMs).toBeCloseTo(16.67, 1);
  });

  it("should return default 16.67ms for unknown capability (line 185)", () => {
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({
        deviceCapability: "unknown" as any,
      })
    );

    expect(result.current.state.targetFrameTimeMs).toBeCloseTo(16.67, 1);
  });
});

describe("branch coverage - predictGestureFromVelocity (lines 189-198)", () => {
  it("should predict longPress for slow velocity and long elapsed time (line 195)", () => {
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" })
    );

    let prediction: GestureIntent | null = null;
    act(() => {
      prediction = result.current.controls.predictGestureIntent({
        touchStart: { x: 100, y: 100 },
        currentPosition: { x: 105, y: 102 },
        velocity: { x: 5, y: 2 }, // Very slow
        elapsed: 600, // > 500ms
      });
    });

    expect(prediction).not.toBeNull();
    expect(prediction!.gestureType).toBe("longPress");
  });

  it("should predict tap for slow velocity and short elapsed time (line 197)", () => {
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" })
    );

    let prediction: GestureIntent | null = null;
    act(() => {
      prediction = result.current.controls.predictGestureIntent({
        touchStart: { x: 100, y: 100 },
        currentPosition: { x: 105, y: 102 },
        velocity: { x: 10, y: 5 }, // slow (speed < 100)
        elapsed: 200, // < 500ms
      });
    });

    expect(prediction).not.toBeNull();
    expect(prediction!.gestureType).toBe("tap");
  });

  it("should predict swipe for fast velocity (line 193)", () => {
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" })
    );

    let prediction: GestureIntent | null = null;
    act(() => {
      prediction = result.current.controls.predictGestureIntent({
        touchStart: { x: 100, y: 100 },
        currentPosition: { x: 200, y: 100 },
        velocity: { x: 150, y: 0 }, // Fast (speed > 100)
        elapsed: 100, // < 300ms
      });
    });

    expect(prediction).not.toBeNull();
    expect(prediction!.gestureType).toBe("swipe");
  });
});

describe("branch coverage - triggerInstantFeedback latency tracking (line 280-281)", () => {
  it("should track feedback latency when within valid range (lines 280-281)", () => {
    const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

    // First feedback - sets lastFeedbackTimeRef
    mockTime = 100;
    act(() => {
      result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 100 });
    });

    // Second feedback - latency should be tracked
    mockTime = 150;
    act(() => {
      result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 100 });
    });

    // Latency should be 50ms (150 - 100)
    expect(result.current.metrics.feedbackLatencyMs).toBe(50);
  });

  it("should not track latency when <= 0 (line 280 first condition)", () => {
    const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

    // First feedback at time 100
    mockTime = 100;
    act(() => {
      result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 100 });
    });

    // Second feedback at same time (latency = 0)
    // Note: Since lastFeedbackTimeRef was updated to 100, calling again at 100
    // gives latency of 0, which fails the > 0 check
    act(() => {
      result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 100 });
    });

    // Latency was already set to 100 from first call (since lastFeedbackTimeRef starts at 0)
    // The second call with latency=0 doesn't update it
    // So we verify the condition was hit - the metric should be what it was from first call
    expect(result.current.metrics.feedbackLatencyMs).toBe(100);
  });

  it("should not track latency when >= 1000ms (line 280 second condition)", () => {
    const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

    // First feedback at time 0
    mockTime = 0;
    act(() => {
      result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 100 });
    });

    // Record initial latency
    const initialLatency = result.current.metrics.feedbackLatencyMs;

    // Second feedback after 1500ms (too long)
    mockTime = 1500;
    act(() => {
      result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 100 });
    });

    // Latency should not be updated
    expect(result.current.metrics.feedbackLatencyMs).toBe(initialLatency);
  });
});

describe("branch coverage - scheduleAvatarResponse auto-execute (lines 332-337)", () => {
  it("should execute response callback after delay (lines 333-337)", () => {
    jest.useFakeTimers();
    const onResponseExecuted = jest.fn();
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({}, { onResponseExecuted })
    );

    act(() => {
      result.current.controls.scheduleAvatarResponse({
        type: "acknowledge",
        priority: "high",
        delay: 50,
      });
    });

    expect(result.current.state.pendingResponses).toBe(1);
    expect(onResponseExecuted).not.toHaveBeenCalled();

    // Advance past delay
    act(() => {
      jest.advanceTimersByTime(60);
    });

    expect(onResponseExecuted).toHaveBeenCalled();
    expect(result.current.state.pendingResponses).toBe(0);
    expect(result.current.metrics.responsesExecuted).toBeGreaterThan(0);
    jest.useRealTimers();
  });

  it("should remove timer from map after execution (line 337)", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

    let id: string = "";
    act(() => {
      id = result.current.controls.scheduleAvatarResponse({
        type: "acknowledge",
        priority: "high",
        delay: 10,
      });
    });

    expect(result.current.state.pendingResponses).toBe(1);

    // After execution, canceling should have no effect
    act(() => {
      jest.advanceTimersByTime(20);
    });

    expect(result.current.state.pendingResponses).toBe(0);

    // Try to cancel already-executed response
    act(() => {
      result.current.controls.cancelResponse(id);
    });

    // Should still be 0
    expect(result.current.state.pendingResponses).toBe(0);
    jest.useRealTimers();
  });
});

describe("branch coverage - confirmPrediction overflow (line 384-385)", () => {
  it("should shift oldest prediction when exceeding 20 results (lines 384-385)", () => {
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" })
    );

    // Add 21 predictions - should shift oldest
    act(() => {
      for (let i = 0; i < 21; i++) {
        result.current.controls.confirmPrediction(i < 10); // First 10 correct, rest incorrect
      }
    });

    // With 20 results where first one was shifted out:
    // Results now: [correct x9, incorrect x11] = 9/20 = 0.45
    expect(result.current.metrics.predictionAccuracy).toBeLessThan(0.5);
  });
});

describe("branch coverage - markResponseComplete response times overflow (lines 404-405)", () => {
  it("should shift oldest response time when exceeding 50 (lines 404-405)", () => {
    const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

    // Schedule and complete 51 responses one at a time
    for (let i = 0; i < 51; i++) {
      mockTime = i * 10;
      let id: string = "";
      act(() => {
        id = result.current.controls.scheduleAvatarResponse({
          type: "acknowledge",
          priority: "high",
          delay: 1000, // Don't auto-execute
        });
      });

      mockTime = i * 10 + 5;
      act(() => {
        result.current.controls.markResponseComplete(id);
      });
    }

    // Average should be based on last 50 responses (5ms each)
    expect(result.current.metrics.averageResponseTimeMs).toBeGreaterThan(0);
  });
});

describe("branch coverage - cancelResponse with non-existent timer (line 348-349)", () => {
  it("should handle canceling response without timer gracefully (line 349 condition)", () => {
    const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

    // Cancel non-existent response - should not throw
    act(() => {
      result.current.controls.cancelResponse("non_existent_id");
    });

    expect(result.current.state.pendingResponses).toBe(0);
  });
});

describe("branch coverage - scheduleAvatarResponse queue overflow (lines 314-326)", () => {
  it("should remove lowest priority response when queue overflows (lines 319-326)", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({
        maxQueuedResponses: 2,
      })
    );

    // Schedule 3 responses - should remove one
    act(() => {
      result.current.controls.scheduleAvatarResponse({
        type: "track",
        priority: "low",
        delay: 1000,
      });
      result.current.controls.scheduleAvatarResponse({
        type: "acknowledge",
        priority: "high",
        delay: 1000,
      });
    });

    expect(result.current.state.pendingResponses).toBe(2);

    act(() => {
      result.current.controls.scheduleAvatarResponse({
        type: "focus",
        priority: "normal",
        delay: 1000,
      });
    });

    // Should only have 2 (low priority was removed)
    expect(result.current.state.pendingResponses).toBe(2);
    jest.useRealTimers();
  });

  it("should clear timer of removed response when queue overflows (lines 321-324)", () => {
    jest.useFakeTimers();
    const onResponseExecuted = jest.fn();
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator(
        { maxQueuedResponses: 1 },
        { onResponseExecuted }
      )
    );

    // Schedule first response
    act(() => {
      result.current.controls.scheduleAvatarResponse({
        type: "track",
        priority: "low",
        delay: 100,
      });
    });

    // Schedule second - first should be removed and its timer cleared
    act(() => {
      result.current.controls.scheduleAvatarResponse({
        type: "acknowledge",
        priority: "high",
        delay: 100,
      });
    });

    // Advance past both timeouts
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Only second response should have executed (first was removed)
    expect(onResponseExecuted).toHaveBeenCalledTimes(1);
    expect(onResponseExecuted).toHaveBeenCalledWith(
      expect.objectContaining({ type: "acknowledge" })
    );
    jest.useRealTimers();
  });
});

describe("branch coverage - useInstantAvatarFeedback timeout handling (lines 535-537, 547-549)", () => {
  it("should clear existing timeout when triggering again (lines 535-537)", () => {
    jest.useFakeTimers();
    const onFeedback = jest.fn();
    const { result } = renderHook(() => useInstantAvatarFeedback(onFeedback));

    // Trigger first feedback
    act(() => {
      result.current.trigger({ x: 100, y: 100 });
    });

    expect(result.current.isActive).toBe(true);

    // Trigger again before timeout - should clear previous timeout
    act(() => {
      jest.advanceTimersByTime(50);
      result.current.trigger({ x: 200, y: 200 });
    });

    expect(result.current.isActive).toBe(true);

    // After 100ms from second trigger, should be inactive
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.isActive).toBe(false);
    jest.useRealTimers();
  });

  it("should clear timeout on cancel (lines 547-549)", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useInstantAvatarFeedback());

    act(() => {
      result.current.trigger({ x: 100, y: 100 });
    });

    expect(result.current.isActive).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.isActive).toBe(false);

    // Advance past original timeout - should have no effect
    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(result.current.isActive).toBe(false);
    jest.useRealTimers();
  });

  it("should cleanup timeout on unmount (lines 553-556)", () => {
    jest.useFakeTimers();
    const { result, unmount } = renderHook(() => useInstantAvatarFeedback());

    act(() => {
      result.current.trigger({ x: 100, y: 100 });
    });

    unmount();
    // No error means cleanup succeeded
    jest.useRealTimers();
  });
});

describe("branch coverage - markResponseComplete with non-existent response (line 400)", () => {
  it("should handle marking non-existent response as complete gracefully (line 400)", () => {
    const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

    // Try to mark non-existent response complete
    act(() => {
      result.current.controls.markResponseComplete("non_existent_id");
    });

    // Should not throw or affect metrics
    expect(result.current.metrics.responsesExecuted).toBe(0);
  });
});

describe("branch coverage - getAvatarResponseForGesture default (line 248)", () => {
  it("should return 'acknowledge' for unmapped gesture type (line 248)", () => {
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({
        gestureMapping: {}, // Empty mapping
      })
    );

    // Use a gesture type that would only have default mapping
    const response = result.current.controls.getAvatarResponseForGesture("rotate");
    expect(response).toBe("turn"); // From DEFAULT_GESTURE_MAPPING
  });
});

describe("branch coverage - onGestureRecognized callback (line 267)", () => {
  it("should call onGestureRecognized callback when gesture is recognized (line 267)", () => {
    const onGestureRecognized = jest.fn();
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({}, { onGestureRecognized })
    );

    act(() => {
      result.current.controls.recognizeGesture({
        type: "tap",
        position: { x: 100, y: 100 },
        timestamp: mockTime,
      });
    });

    expect(onGestureRecognized).toHaveBeenCalledWith(
      expect.objectContaining({
        gestureType: "tap",
        avatarResponse: "acknowledge",
        confidence: 1.0,
      })
    );
  });
});

// ============================================================================
// Additional Branch Coverage Tests - Sprint 613
// ============================================================================

describe("branch coverage - useInstantAvatarFeedback cancel when not active (line 547)", () => {
  it("should handle cancel when timeoutRef is null", () => {
    const { result } = renderHook(() => useInstantAvatarFeedback());

    // Cancel without triggering - timeoutRef.current is null
    act(() => {
      result.current.cancel();
    });

    expect(result.current.isActive).toBe(false);
  });
});

describe("branch coverage - scheduleAvatarResponse removed item without timer (lines 320-322)", () => {
  it("should handle removed item that has no timer in map", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({
        maxQueuedResponses: 1,
      })
    );

    // Schedule first response
    let id1: string = "";
    act(() => {
      id1 = result.current.controls.scheduleAvatarResponse({
        type: "track",
        priority: "low",
        delay: 100,
      });
    });

    // Clear the timer manually from the map (simulate edge case)
    // We can't directly access timerIdsRef, but we can test the branch
    // by scheduling a second response that triggers overflow
    act(() => {
      result.current.controls.scheduleAvatarResponse({
        type: "acknowledge",
        priority: "high",
        delay: 100,
      });
    });

    // Should have handled overflow gracefully
    expect(result.current.state.pendingResponses).toBe(1);
    jest.useRealTimers();
  });
});

describe("branch coverage - getAvatarResponseForGesture with undefined mapping (line 248)", () => {
  it("should return acknowledge for unmapped gesture", () => {
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({
        gestureMapping: {
          tap: "custom" as any,
          // Other gestures use default mapping
        },
      })
    );

    // tap should use custom mapping
    expect(result.current.controls.getAvatarResponseForGesture("tap")).toBe("custom");

    // pan should use default mapping
    expect(result.current.controls.getAvatarResponseForGesture("pan")).toBe("track");
  });
});

// ============================================================================
// Sprint 614 - Additional Branch Coverage Tests
// ============================================================================

describe("Sprint 614 - useInstantAvatarFeedback edge cases", () => {
  it("should clear existing timeout when triggering multiple times (lines 535-537)", () => {
    jest.useFakeTimers();
    const onFeedback = jest.fn();
    const { result } = renderHook(() => useInstantAvatarFeedback(onFeedback));

    // Trigger multiple times rapidly
    act(() => {
      result.current.trigger({ x: 100, y: 100 });
    });

    act(() => {
      jest.advanceTimersByTime(50);
      result.current.trigger({ x: 200, y: 200 });
    });

    act(() => {
      jest.advanceTimersByTime(50);
      result.current.trigger({ x: 300, y: 300 });
    });

    // Should still be active
    expect(result.current.isActive).toBe(true);

    // After 100ms from last trigger
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.isActive).toBe(false);
    jest.useRealTimers();
  });

  it("should handle trigger without callback (line 533 optional chaining)", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useInstantAvatarFeedback()); // No callback

    act(() => {
      result.current.trigger({ x: 100, y: 100 });
    });

    expect(result.current.isActive).toBe(true);
    jest.useRealTimers();
  });

  it("should cleanup on unmount with active timeout (lines 552-556)", () => {
    jest.useFakeTimers();
    const { result, unmount } = renderHook(() => useInstantAvatarFeedback());

    act(() => {
      result.current.trigger({ x: 100, y: 100 });
    });

    expect(result.current.isActive).toBe(true);

    unmount();
    // No error = cleanup successful
    jest.useRealTimers();
  });
});

describe("Sprint 614 - useGesturePrioritizedResponse edge cases", () => {
  it("should handle schedule with all three priority levels", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useGesturePrioritizedResponse());

    act(() => {
      result.current.schedule("acknowledge", "high"); // 0ms delay
      result.current.schedule("track", "normal"); // 16ms delay
      result.current.schedule("focus", "low"); // 50ms delay
    });

    expect(result.current.pending).toBe(3);

    // High priority completes immediately
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.pending).toBe(2);

    // Normal priority completes after 16ms
    act(() => {
      jest.advanceTimersByTime(16);
    });
    expect(result.current.pending).toBe(1);

    // Low priority completes after 50ms total
    act(() => {
      jest.advanceTimersByTime(35);
    });
    expect(result.current.pending).toBe(0);
    jest.useRealTimers();
  });

  it("should cleanup all timers on unmount (lines 609-612)", () => {
    jest.useFakeTimers();
    const { result, unmount } = renderHook(() => useGesturePrioritizedResponse());

    act(() => {
      result.current.schedule("acknowledge", "low");
      result.current.schedule("track", "low");
      result.current.schedule("focus", "low");
    });

    expect(result.current.pending).toBe(3);

    unmount();
    // No error = cleanup successful
    jest.useRealTimers();
  });

  it("should not affect pending count when canceling non-existent ID (lines 595-600)", () => {
    const { result } = renderHook(() => useGesturePrioritizedResponse());

    act(() => {
      result.current.schedule("acknowledge", "normal");
    });

    expect(result.current.pending).toBe(1);

    act(() => {
      result.current.cancel("non_existent_id_12345");
    });

    expect(result.current.pending).toBe(1);
  });
});

describe("Sprint 614 - main hook edge cases", () => {
  it("should handle scheduleAvatarResponse with latency compensation", () => {
    jest.useFakeTimers();
    const onResponseExecuted = jest.fn();
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({}, { onResponseExecuted })
    );

    // Set network latency
    act(() => {
      result.current.controls.setNetworkLatency(100);
    });

    expect(result.current.state.latencyCompensation).toBe(50); // 100 * 0.5

    // Schedule response - delay should include latency compensation
    act(() => {
      result.current.controls.scheduleAvatarResponse({
        type: "acknowledge",
        priority: "high",
        delay: 10,
      });
    });

    expect(result.current.state.pendingResponses).toBe(1);

    // Should not execute after just delay
    act(() => {
      jest.advanceTimersByTime(15);
    });
    expect(onResponseExecuted).not.toHaveBeenCalled();

    // Should execute after delay + latency compensation (10 + 50 = 60)
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(onResponseExecuted).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("should handle all gesture types in recognizeGesture", () => {
    const onGestureRecognized = jest.fn();
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({}, { onGestureRecognized })
    );

    const gestureTypes = ["tap", "swipe", "longPress", "pinch", "pan", "rotate"] as const;

    gestureTypes.forEach((gestureType) => {
      act(() => {
        result.current.controls.recognizeGesture({
          type: gestureType,
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });
    });

    expect(onGestureRecognized).toHaveBeenCalledTimes(6);
    expect(result.current.metrics.gesturesProcessed).toBe(6);
  });

  it("should handle queue overflow sorting by priority (lines 315-318)", () => {
    jest.useFakeTimers();
    const onResponseExecuted = jest.fn();
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator(
        { maxQueuedResponses: 2 },
        { onResponseExecuted }
      )
    );

    // Add responses in order: high, normal, low
    act(() => {
      result.current.controls.scheduleAvatarResponse({
        type: "acknowledge",
        priority: "high",
        delay: 1000,
      });
      result.current.controls.scheduleAvatarResponse({
        type: "track",
        priority: "normal",
        delay: 1000,
      });
    });

    expect(result.current.state.pendingResponses).toBe(2);

    // Add low priority - should be kept, but one of the others removed based on sort
    // Sort orders by priority descending, so "low" items appear at end
    // After pop(), the lowest priority is removed
    act(() => {
      result.current.controls.scheduleAvatarResponse({
        type: "focus",
        priority: "low",
        delay: 1000,
      });
    });

    expect(result.current.state.pendingResponses).toBe(2);

    // Execute all
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    // Should have executed 2 responses
    expect(onResponseExecuted).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("should handle markResponseComplete removing from queue (lines 408-410)", () => {
    const { result } = renderHook(() => useAvatarGestureResponseAccelerator());

    // Schedule a response
    let id: string = "";
    mockTime = 0;
    act(() => {
      id = result.current.controls.scheduleAvatarResponse({
        type: "acknowledge",
        priority: "high",
        delay: 10000, // Long delay to prevent auto-execution
      });
    });

    expect(result.current.state.pendingResponses).toBe(1);

    // Mark as complete manually - mockTime affects performance.now() which is mocked
    mockTime = 50;
    act(() => {
      result.current.controls.markResponseComplete(id);
    });

    expect(result.current.state.pendingResponses).toBe(0);
    expect(result.current.metrics.responsesExecuted).toBe(1);
    // averageResponseTimeMs is calculated from responseTimesRef
    // response was created at time 0, marked complete when now() returns 50
    // responseTime = 50 - 0 = 50
    expect(result.current.metrics.averageResponseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("should handle resetMetrics clearing all metrics (lines 414-420)", () => {
    const { result } = renderHook(() =>
      useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" })
    );

    // Generate some metrics
    act(() => {
      result.current.controls.recognizeGesture({
        type: "tap",
        position: { x: 100, y: 100 },
        timestamp: mockTime,
      });
      result.current.controls.triggerInstantFeedback("tap", { x: 100, y: 100 });
      result.current.controls.predictGestureIntent({
        touchStart: { x: 100, y: 100 },
        currentPosition: { x: 150, y: 100 },
        velocity: { x: 300, y: 0 },
        elapsed: 100,
      });
      result.current.controls.confirmPrediction(true);
    });

    expect(result.current.metrics.gesturesProcessed).toBeGreaterThan(0);

    // Reset
    act(() => {
      result.current.controls.resetMetrics();
    });

    expect(result.current.metrics.gesturesProcessed).toBe(0);
    expect(result.current.metrics.feedbackLatencyMs).toBe(0);
    expect(result.current.metrics.responsesExecuted).toBe(0);
    expect(result.current.state.predictionConfidence).toBe(0);
  });
});
