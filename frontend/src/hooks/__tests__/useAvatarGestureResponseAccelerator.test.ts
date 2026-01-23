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
});
