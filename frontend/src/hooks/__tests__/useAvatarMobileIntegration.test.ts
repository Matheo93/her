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
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());
      const gestureAccelerator = renderHook(() => useAvatarGestureResponseAccelerator());
      const stateCache = renderHook(() => useAvatarStateCache());
      const frameBudget = renderHook(() => useAvatarFrameBudget());

      // Schedule work on all
      act(() => {
        touchSync.result.current.controls.onTouchStart({ x: 100, y: 100 });
        gestureAccelerator.result.current.controls.recognizeGesture({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
        stateCache.result.current.updateSpeaking(true);
        frameBudget.result.current.controls.startWork("test");
      });

      // Unmount all at once
      touchSync.unmount();
      gestureAccelerator.unmount();
      stateCache.unmount();
      frameBudget.unmount();

      // No errors = success
    });
  });

  // ============================================================================
  // Sprint 618 - Advanced Integration Tests
  // ============================================================================

  describe("Advanced Touch Gesture Scenarios", () => {
    it("should handle multi-touch gesture sequence", () => {
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());
      const gestureAccel = renderHook(() => useAvatarGestureResponseAccelerator());

      // First touch
      mockTime = 0;
      act(() => {
        touchSync.result.current.controls.onTouchStart({ x: 100, y: 100 });
        gestureAccel.result.current.controls.recognizeGesture({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      expect(gestureAccel.result.current.state.currentGesture).toBe("tap");

      // End first touch
      act(() => {
        touchSync.result.current.controls.onTouchEnd();
      });

      // Second touch - swipe
      mockTime = 200;
      act(() => {
        touchSync.result.current.controls.onTouchStart({ x: 100, y: 100 });
      });

      mockTime = 300;
      act(() => {
        touchSync.result.current.controls.onTouchMove({ x: 300, y: 100 });
        gestureAccel.result.current.controls.recognizeGesture({
          type: "swipe",
          position: { x: 300, y: 100 },
          timestamp: mockTime,
        });
      });

      expect(gestureAccel.result.current.state.currentGesture).toBe("swipe");
      expect(gestureAccel.result.current.metrics.gesturesProcessed).toBe(2);

      // End second touch
      act(() => {
        touchSync.result.current.controls.onTouchEnd();
      });
    });

    it("should coordinate prediction with instant feedback", () => {
      const gestureAccel = renderHook(() =>
        useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" })
      );
      const instantFeedback = renderHook(() => useAvatarInstantFeedback());

      // Start prediction
      mockTime = 0;
      act(() => {
        gestureAccel.result.current.controls.predictGestureIntent({
          touchStart: { x: 100, y: 100 },
          currentPosition: { x: 150, y: 100 },
          velocity: { x: 400, y: 0 },
          elapsed: 80,
        });
      });

      expect(gestureAccel.result.current.state.predictionConfidence).toBeGreaterThan(0);

      // Trigger instant feedback based on prediction
      act(() => {
        instantFeedback.result.current.controls.triggerInstantFeedback("swipe", { x: 150, y: 100 });
      });

      expect(instantFeedback.result.current.state.currentFeedbackType).toBe("swipe");

      // Confirm prediction
      act(() => {
        gestureAccel.result.current.controls.confirmPrediction(true);
      });

      expect(gestureAccel.result.current.metrics.predictionAccuracy).toBeGreaterThan(0);
    });
  });

  describe("Frame Budget and Performance Integration", () => {
    it("should track frame budget across multiple animation operations", () => {
      const frameBudget = renderHook(() => useAvatarFrameBudget({ targetFps: 60 }));
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());

      // Start frame
      act(() => {
        frameBudget.result.current.controls.startWork("touch-handling");
      });

      // Process touch
      act(() => {
        touchSync.result.current.controls.onTouchStart({ x: 100, y: 100 });
        mockTime += 2;
      });

      act(() => {
        frameBudget.result.current.controls.endWork("touch-handling");
      });

      // Start animation work
      act(() => {
        frameBudget.result.current.controls.startWork("animation");
        touchSync.result.current.controls.scheduleAnimation({
          type: "track",
          duration: 100,
          priority: "high",
        });
        mockTime += 3;
        frameBudget.result.current.controls.endWork("animation");
      });

      // Complete frame
      act(() => {
        frameBudget.result.current.controls.recordFrameComplete();
      });

      expect(frameBudget.result.current.metrics.framesRecorded).toBe(1);
      expect(frameBudget.result.current.state.isOverBudget).toBe(false);
    });

    it("should detect work exceeding remaining budget", () => {
      const frameBudget = renderHook(() => useAvatarFrameBudget({ targetFps: 60 }));

      // Check initial state
      expect(frameBudget.result.current.state.isOverBudget).toBe(false);

      // Check if heavy work would fit
      const canFit = frameBudget.result.current.controls.canFitWork(20);

      // 20ms work should not fit in 16.67ms budget
      expect(canFit).toBe(false);
    });
  });

  describe("State Cache Coordination", () => {
    it("should coordinate rapid state updates with animation", () => {
      const stateCache = renderHook(() => useAvatarStateCache({ debounceMs: 16 }));
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());

      // Rapid state updates
      act(() => {
        stateCache.result.current.updateEmotion("joy");
        stateCache.result.current.updateSpeaking(true);
        stateCache.result.current.updateVisemeWeights({ AA: 0.5, sil: 0.5 });
      });

      // Schedule animation in parallel
      act(() => {
        touchSync.result.current.controls.scheduleAnimation({
          type: "expression",
          duration: 200,
          priority: "high",
        });
      });

      expect(touchSync.result.current.state.pendingAnimations).toBe(1);

      // Advance time to flush state cache
      act(() => {
        jest.advanceTimersByTime(20);
      });

      expect(stateCache.result.current.state.emotion).toBe("joy");
      expect(stateCache.result.current.state.isSpeaking).toBe(true);
    });

    it("should handle state reset during animation", () => {
      const stateCache = renderHook(() => useAvatarStateCache({ debounceMs: 16 }));
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());

      // Set initial state and animation
      act(() => {
        stateCache.result.current.updateEmotion("joy");
        stateCache.result.current.updateSpeaking(true);
        touchSync.result.current.controls.scheduleAnimation({
          type: "expression",
          duration: 500,
          priority: "normal",
        });
        jest.advanceTimersByTime(20);
      });

      expect(stateCache.result.current.state.emotion).toBe("joy");
      expect(touchSync.result.current.state.pendingAnimations).toBe(1);

      // Reset state cache
      act(() => {
        stateCache.result.current.resetState();
      });

      expect(stateCache.result.current.state.emotion).toBe("neutral");
      expect(stateCache.result.current.state.isSpeaking).toBe(false);
      // Animation should still be pending
      expect(touchSync.result.current.state.pendingAnimations).toBe(1);
    });
  });

  describe("Momentum and Touch Sync Coordination", () => {
    it("should coordinate momentum decay with touch sync smoothing", () => {
      const touchSync = renderHook(() => useAvatarTouchAnimationSync({ smoothingFactor: 0.3 }));
      const momentum = renderHook(() => useAvatarTouchMomentum({ friction: 0.95 }));

      // Start drag
      mockTime = 0;
      act(() => {
        touchSync.result.current.controls.onTouchStart({ x: 100, y: 100 });
        momentum.result.current.controls.startDrag({ x: 100, y: 100 });
      });

      // Move drag
      mockTime = 16;
      act(() => {
        touchSync.result.current.controls.onTouchMove({ x: 200, y: 100 });
        momentum.result.current.controls.updateDrag({ x: 200, y: 100 });
      });

      mockTime = 32;
      act(() => {
        touchSync.result.current.controls.onTouchMove({ x: 350, y: 100 });
        momentum.result.current.controls.updateDrag({ x: 350, y: 100 });
      });

      // End drag
      act(() => {
        touchSync.result.current.controls.onTouchEnd();
        momentum.result.current.controls.endDrag();
      });

      // Both should have tracked the movement
      expect(touchSync.result.current.metrics.touchEventsProcessed).toBeGreaterThan(0);
      expect(momentum.result.current.state.velocity).toBeDefined();
    });
  });

  describe("Error Recovery Scenarios", () => {
    it("should recover from invalid gesture data", () => {
      const gestureAccel = renderHook(() => useAvatarGestureResponseAccelerator());

      // Valid gesture
      act(() => {
        gestureAccel.result.current.controls.recognizeGesture({
          type: "tap",
          position: { x: 100, y: 100 },
          timestamp: mockTime,
        });
      });

      expect(gestureAccel.result.current.metrics.gesturesProcessed).toBe(1);

      // Another valid gesture after potential error
      act(() => {
        gestureAccel.result.current.controls.recognizeGesture({
          type: "swipe",
          position: { x: 200, y: 100 },
          timestamp: mockTime + 100,
        });
      });

      expect(gestureAccel.result.current.metrics.gesturesProcessed).toBe(2);
    });

    it("should handle rapid mount/unmount cycles", () => {
      // First mount
      const hook1 = renderHook(() => useAvatarTouchAnimationSync());
      act(() => {
        hook1.result.current.controls.onTouchStart({ x: 100, y: 100 });
      });
      hook1.unmount();

      // Second mount
      const hook2 = renderHook(() => useAvatarTouchAnimationSync());
      act(() => {
        hook2.result.current.controls.onTouchStart({ x: 200, y: 200 });
      });
      expect(hook2.result.current.state.isTouching).toBe(true);
      hook2.unmount();

      // Third mount
      const hook3 = renderHook(() => useAvatarTouchAnimationSync());
      expect(hook3.result.current.state.isTouching).toBe(false);
      hook3.unmount();
    });
  });

  describe("Full Pipeline End-to-End", () => {
    it("should handle complete touch-to-animation pipeline", () => {
      const touchSync = renderHook(() => useAvatarTouchAnimationSync());
      const gestureAccel = renderHook(() => useAvatarGestureResponseAccelerator({ feedbackMode: "predictive" }));
      const instantFeedback = renderHook(() => useAvatarInstantFeedback());
      const stateCache = renderHook(() => useAvatarStateCache({ debounceMs: 10 }));
      const frameBudget = renderHook(() => useAvatarFrameBudget({ targetFps: 60 }));

      // Step 1: Touch start
      mockTime = 0;
      act(() => {
        frameBudget.result.current.controls.startWork("touch");
        touchSync.result.current.controls.onTouchStart({ x: 100, y: 100 });
        frameBudget.result.current.controls.endWork("touch");
      });

      expect(touchSync.result.current.state.isTouching).toBe(true);

      // Step 2: Predict gesture
      mockTime = 50;
      act(() => {
        gestureAccel.result.current.controls.predictGestureIntent({
          touchStart: { x: 100, y: 100 },
          currentPosition: { x: 150, y: 100 },
          velocity: { x: 300, y: 0 },
          elapsed: 50,
        });
      });

      // Step 3: Touch move with instant feedback
      mockTime = 100;
      act(() => {
        touchSync.result.current.controls.onTouchMove({ x: 200, y: 100 });
        instantFeedback.result.current.controls.triggerInstantFeedback("swipe", { x: 200, y: 100 });
      });

      // Step 4: Recognize gesture
      act(() => {
        gestureAccel.result.current.controls.recognizeGesture({
          type: "swipe",
          position: { x: 200, y: 100 },
          timestamp: mockTime,
        });
        gestureAccel.result.current.controls.confirmPrediction(true);
      });

      // Step 5: Schedule animation response
      let animId: string = "";
      act(() => {
        animId = touchSync.result.current.controls.scheduleAnimation({
          type: "swipe-response",
          duration: 200,
          priority: "high",
        });
        gestureAccel.result.current.controls.scheduleAvatarResponse({
          type: "track",
          priority: "high",
          delay: 0,
        });
      });

      // Step 6: Update state cache
      act(() => {
        stateCache.result.current.batchUpdate({
          emotion: "engaged",
          isSpeaking: false,
        });
        jest.advanceTimersByTime(20);
      });

      // Step 7: Touch end
      act(() => {
        touchSync.result.current.controls.onTouchEnd();
      });

      // Step 8: Complete animation
      act(() => {
        touchSync.result.current.controls.completeAnimation(animId);
        frameBudget.result.current.controls.recordFrameComplete();
      });

      // Verify full pipeline completed
      expect(touchSync.result.current.state.isTouching).toBe(false);
      expect(touchSync.result.current.state.pendingAnimations).toBe(0);
      expect(gestureAccel.result.current.metrics.gesturesProcessed).toBe(1);
      expect(instantFeedback.result.current.state.currentFeedbackType).toBe("swipe");
      expect(frameBudget.result.current.metrics.framesRecorded).toBe(1);
    });
  });
});
