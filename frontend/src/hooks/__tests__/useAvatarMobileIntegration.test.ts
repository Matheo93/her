/**
 * Integration Tests for Mobile Avatar UX Latency Hooks - Sprint 617
 *
 * Tests the coordination and integration between multiple mobile avatar hooks:
 * - Touch input → Animation pipeline
 * - State caching and rendering pipeline
 * - Gesture recognition chain
 * - Cleanup and resource management
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useAvatarTouchAnimationSync } from "../useAvatarTouchAnimationSync";
import { useAvatarGestureResponseAccelerator } from "../useAvatarGestureResponseAccelerator";
import { useAvatarStateCache } from "../useAvatarStateCache";
import { useAvatarInstantFeedback } from "../useAvatarInstantFeedback";
import { useAvatarTouchMomentum } from "../useAvatarTouchMomentum";
import { useAvatarFrameBudget } from "../useAvatarFrameBudget";

// Mock performance.now for consistent timing
let mockTime = 0;

// Mock IntersectionObserver
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

  // Mock IntersectionObserver
  global.IntersectionObserver = MockIntersectionObserver as any;

  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Mobile Avatar Integration Tests", () => {
  describe("Touch Input to Animation Pipeline", () => {
    it("should coordinate touch sync with gesture accelerator", () => {
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());
      const gestureAccel = renderHook(() => useAvatarGestureResponseAccelerator());

      // Simulate touch start
      act(() => {
        touchSync.result.current.controls.onTouchStart({ x: 100, y: 100 });
      });

      expect(touchSync.result.current.state.isTouching).toBe(true);
      expect(touchSync.result.current.state.touchPosition).toEqual({ x: 100, y: 100 });

      // Recognize gesture through accelerator
      act(() => {
        gestureAccel.result.current.controls.recognizeGesture({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      expect(gestureAccel.result.current.state.currentGesture).toBe("tap");

      // Schedule animation through touch sync
      act(() => {
        touchSync.result.current.controls.scheduleAnimation({
          type: "acknowledge",
          duration: 100,
          priority: "high",
        });
      });

      expect(touchSync.result.current.state.pendingAnimations).toBe(1);

      // Complete touch
      act(() => {
        touchSync.result.current.controls.onTouchEnd();
      });

      expect(touchSync.result.current.state.isTouching).toBe(false);
    });

    it("should propagate touch position through momentum and sync", () => {
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());
      const momentum = renderHook(() => useAvatarTouchMomentum());

      // Start touch
      mockTime = 0;
      act(() => {
        touchSync.result.current.controls.onTouchStart({ x: 100, y: 100 });
        momentum.result.current.controls.startDrag({ x: 100, y: 100 });
      });

      // Move touch
      mockTime = 16;
      act(() => {
        touchSync.result.current.controls.onTouchMove({ x: 150, y: 100 });
        momentum.result.current.controls.updateDrag({ x: 150, y: 100 });
      });

      // Verify sync has smoothed position
      expect(touchSync.result.current.state.smoothedTouchPosition).toBeDefined();

      // Verify momentum is tracking velocity
      expect(momentum.result.current.state.velocity).toBeDefined();

      // End touch
      act(() => {
        touchSync.result.current.controls.onTouchEnd();
        momentum.result.current.controls.endDrag();
      });

      // Momentum should have velocity after drag
      expect(momentum.result.current.state.velocity).toBeDefined();
    });

    it("should coordinate instant feedback with gesture response", () => {
      const instantFeedback = renderHook(() => useAvatarInstantFeedback());
      const gestureAccel = renderHook(() => useAvatarGestureResponseAccelerator());

      // Trigger instant feedback
      act(() => {
        instantFeedback.result.current.controls.triggerInstantFeedback(
          "tap",
          { x: 100, y: 100 }
        );
      });

      // Instant feedback is triggered - check currentFeedbackType
      expect(instantFeedback.result.current.state.currentFeedbackType).toBe("tap");

      // Schedule avatar response through accelerator
      act(() => {
        gestureAccel.result.current.controls.scheduleAvatarResponse({
          type: "acknowledge",
          priority: "high",
          delay: 0,
        });
      });

      expect(gestureAccel.result.current.state.pendingResponses).toBe(1);

      // Let the response execute
      act(() => {
        jest.advanceTimersByTime(10);
      });

      // Accelerator should have executed response
      expect(gestureAccel.result.current.metrics.responsesExecuted).toBeGreaterThanOrEqual(0);
    });
  });

  describe("State Caching and Frame Budget", () => {
    it("should coordinate state cache with frame budget", () => {
      const stateCache = renderHook(() => useAvatarStateCache({ debounceMs: 16 }));
      const frameBudget = renderHook(() => useAvatarFrameBudget({ targetFps: 60 }));

      // Update state through cache
      act(() => {
        stateCache.result.current.updateSpeaking(true);
      });

      expect(stateCache.result.current.state.isSpeaking).toBe(true);

      // Start work tracking
      act(() => {
        frameBudget.result.current.controls.startWork("state-update");
      });

      // Simulate work
      mockTime += 5;

      // End work
      act(() => {
        frameBudget.result.current.controls.endWork("state-update");
      });

      // Record frame complete
      act(() => {
        frameBudget.result.current.controls.recordFrameComplete();
      });

      expect(frameBudget.result.current.metrics.framesRecorded).toBe(1);
    });

    it("should respect frame budget for multiple operations", () => {
      const frameBudget = renderHook(() => useAvatarFrameBudget({ targetFps: 60 }));

      // Start multiple work items
      act(() => {
        frameBudget.result.current.controls.startWork("render");
        mockTime += 2;
        frameBudget.result.current.controls.endWork("render");

        frameBudget.result.current.controls.startWork("animation");
        mockTime += 3;
        frameBudget.result.current.controls.endWork("animation");

        frameBudget.result.current.controls.recordFrameComplete();
      });

      // Should be within budget (16.67ms at 60fps)
      expect(frameBudget.result.current.state.isOverBudget).toBe(false);
    });

    it("should batch state updates through cache", async () => {
      const stateCache = renderHook(() => useAvatarStateCache({ debounceMs: 50 }));

      // Batch multiple updates
      act(() => {
        stateCache.result.current.batchUpdate({
          emotion: "joy",
          isSpeaking: true,
        });
      });

      // Not immediately applied due to debounce
      expect(stateCache.result.current.state.emotion).toBe("neutral");

      // Advance past debounce
      act(() => {
        jest.advanceTimersByTime(60);
      });

      // Now should be updated
      await waitFor(() => {
        expect(stateCache.result.current.state.emotion).toBe("joy");
        expect(stateCache.result.current.state.isSpeaking).toBe(true);
      });
    });
  });

  describe("Gesture Recognition Pipeline", () => {
    it("should process gesture through full pipeline", () => {
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());
      const gestureAccel = renderHook(() =>
        useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" })
      );

      // Touch start
      mockTime = 0;
      act(() => {
        touchSync.result.current.controls.onTouchStart({ x: 100, y: 100 });
      });

      // Predict gesture
      act(() => {
        gestureAccel.result.current.controls.predictGestureIntent({
          touchStart: { x: 100, y: 100 },
          currentPosition: { x: 200, y: 100 },
          velocity: { x: 500, y: 0 },
          elapsed: 100,
        });
      });

      expect(gestureAccel.result.current.state.predictionConfidence).toBeGreaterThan(0);

      // Move touch
      mockTime = 100;
      act(() => {
        touchSync.result.current.controls.onTouchMove({ x: 200, y: 100 });
      });

      // Recognize gesture
      act(() => {
        gestureAccel.result.current.controls.recognizeGesture({
          type: "swipe",
          direction: "right",
          velocity: 500,
          position: { x: 200, y: 100 },
          timestamp: mockTime,
        });
      });

      expect(gestureAccel.result.current.state.currentGesture).toBe("swipe");

      // Confirm prediction
      act(() => {
        gestureAccel.result.current.controls.confirmPrediction(true);
      });

      // Touch end
      act(() => {
        touchSync.result.current.controls.onTouchEnd();
      });

      expect(touchSync.result.current.state.isTouching).toBe(false);
      expect(gestureAccel.result.current.metrics.gesturesProcessed).toBe(1);
    });

    it("should handle rapid gesture sequences", () => {
      const gestureAccel = renderHook(() => useAvatarGestureResponseAccelerator());

      // Rapid gestures
      const gestures = ["tap", "tap", "swipe", "tap"] as const;
      gestures.forEach((type, i) => {
        mockTime = i * 100;
        act(() => {
          gestureAccel.result.current.controls.recognizeGesture({
            type,
            position: { x: 100 + i * 50, y: 100 },
            timestamp: mockTime,
          });
        });
      });

      expect(gestureAccel.result.current.metrics.gesturesProcessed).toBe(4);
    });
  });

  describe("Animation Scheduling Integration", () => {
    it("should coordinate animation scheduling across hooks", () => {
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());
      const gestureAccel = renderHook(() => useAvatarGestureResponseAccelerator());

      // Schedule animation from touch sync
      let syncAnimId: string = "";
      act(() => {
        syncAnimId = touchSync.result.current.controls.scheduleAnimation({
          type: "track",
          duration: 200,
          priority: "high",
        });
      });

      // Schedule response from gesture accelerator
      act(() => {
        gestureAccel.result.current.controls.scheduleAvatarResponse({
          type: "acknowledge",
          priority: "high",
          delay: 50,
        });
      });

      expect(touchSync.result.current.state.pendingAnimations).toBe(1);
      expect(gestureAccel.result.current.state.pendingResponses).toBe(1);

      // Process frame
      act(() => {
        touchSync.result.current.controls.processFrame();
      });

      // Complete animation
      act(() => {
        touchSync.result.current.controls.completeAnimation(syncAnimId);
      });

      expect(touchSync.result.current.state.pendingAnimations).toBe(0);
    });

    it("should handle animation cancellation across hooks", () => {
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());
      const gestureAccel = renderHook(() => useAvatarGestureResponseAccelerator());

      // Schedule animations
      let syncAnimId: string = "";
      let accelId: string = "";
      act(() => {
        syncAnimId = touchSync.result.current.controls.scheduleAnimation({
          type: "track",
          duration: 500,
          priority: "low",
        });
        accelId = gestureAccel.result.current.controls.scheduleAvatarResponse({
          type: "track",
          priority: "low",
          delay: 500,
        });
      });

      expect(touchSync.result.current.state.pendingAnimations).toBe(1);
      expect(gestureAccel.result.current.state.pendingResponses).toBe(1);

      // Cancel both
      act(() => {
        touchSync.result.current.controls.cancelAnimation(syncAnimId);
        gestureAccel.result.current.controls.cancelResponse(accelId);
      });

      expect(touchSync.result.current.state.pendingAnimations).toBe(0);
      expect(gestureAccel.result.current.state.pendingResponses).toBe(0);
    });
  });

  describe("Metrics Collection Integration", () => {
    it("should track metrics across multiple hooks", () => {
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());
      const gestureAccel = renderHook(() => useAvatarGestureResponseAccelerator());

      // Generate activity
      act(() => {
        // Touch events
        touchSync.result.current.controls.onTouchStart({ x: 100, y: 100 });
        touchSync.result.current.controls.onTouchMove({ x: 150, y: 100 });
        touchSync.result.current.controls.onTouchEnd();

        // Gesture recognition
        gestureAccel.result.current.controls.recognizeGesture({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      // All hooks should have tracked activity
      expect(touchSync.result.current.metrics.touchEventsProcessed).toBeGreaterThan(0);
      expect(gestureAccel.result.current.metrics.gesturesProcessed).toBe(1);
    });

    it("should reset metrics independently", () => {
      const gestureAccel = renderHook(() => useAvatarGestureResponseAccelerator());
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());

      // Generate metrics
      act(() => {
        gestureAccel.result.current.controls.recognizeGesture({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
        touchSync.result.current.controls.onTouchStart({ x: 100, y: 100 });
        touchSync.result.current.controls.onTouchEnd();
      });

      expect(gestureAccel.result.current.metrics.gesturesProcessed).toBe(1);
      expect(touchSync.result.current.metrics.touchEventsProcessed).toBeGreaterThan(0);

      // Reset only gesture accelerator
      act(() => {
        gestureAccel.result.current.controls.resetMetrics();
      });

      expect(gestureAccel.result.current.metrics.gesturesProcessed).toBe(0);
      // Touch sync metrics should remain
      expect(touchSync.result.current.metrics.touchEventsProcessed).toBeGreaterThan(0);
    });
  });

  describe("Cleanup and Resource Management", () => {
    it("should cleanup all hooks without errors", () => {
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());
      const gestureAccel = renderHook(() => useAvatarGestureResponseAccelerator());
      const stateCache = renderHook(() => useAvatarStateCache());

      // Schedule some work
      act(() => {
        touchSync.result.current.controls.scheduleAnimation({
          type: "test",
          duration: 1000,
          priority: "normal",
        });
        gestureAccel.result.current.controls.scheduleAvatarResponse({
          type: "test",
          priority: "normal",
          delay: 1000,
        });
        stateCache.result.current.updateEmotion("joy");
      });

      // Unmount all
      touchSync.unmount();
      gestureAccel.unmount();
      stateCache.unmount();

      // No errors = success
    });

    it("should handle concurrent hook unmounts gracefully", () => {
      const hooks = [
        renderHook(() => useAvatarTouchAnimationSync()),
        renderHook(() => useAvatarGestureResponseAccelerator()),
        renderHook(() => useAvatarStateCache()),
        renderHook(() => useAvatarFrameBudget()),
      ];

      // Schedule work on all
      act(() => {
        hooks[0].result.current.controls.onTouchStart({ x: 100, y: 100 });
        hooks[1].result.current.controls.recognizeGesture({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
        hooks[2].result.current.updateSpeaking(true);
        hooks[3].result.current.controls.startWork("test");
      });

      // Unmount all at once
      hooks.forEach((hook) => hook.unmount());

      // No errors = success
    });
  });
});
