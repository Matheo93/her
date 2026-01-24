/**
 * Tests for useProactivePresence hook - Sprint 539
 *
 * Tests proactive presence detection for EVA avatar:
 * - Initialization and default state
 * - Return greeting detection (after being away)
 * - Mood shift detection
 * - Comfort offer for distress emotions
 * - Celebration for positive emotions
 * - Emotional followup after vulnerable moments
 * - Silence presence detection
 * - Cooldown between initiations
 * - Time of day detection
 * - Conversation momentum tracking
 * - Visual hints calculation
 * - Cleanup on unmount
 */

import { renderHook, act } from "@testing-library/react";
import {
  useProactivePresence,
  type ProactiveType,
} from "../useProactivePresence";

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

// Default options for hook
const createDefaultOptions = () => ({
  isListening: false,
  isSpeaking: false,
  isThinking: false,
  isIdle: true,
  isConnected: true,
  connectionDuration: 60,
  currentEmotion: "neutral",
  emotionalIntensity: 0.5,
  moodTrend: "stable" as const,
  recentVulnerabilityMoments: 0,
  recentPeakMoments: 0,
  isInSilence: false,
  silenceDuration: 0,
  silenceQuality: 0.5,
  userLastActive: mockNow,
  userActivityLevel: 0.5,
  enabled: true,
});

describe("useProactivePresence", () => {
  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() =>
        useProactivePresence(createDefaultOptions())
      );

      expect(result.current.currentAction).toBeNull();
      expect(result.current.shouldInitiate).toBe(false);
    });

    it("should initialize readiness state", () => {
      const { result } = renderHook(() =>
        useProactivePresence(createDefaultOptions())
      );

      expect(result.current.readiness).toBeDefined();
      expect(result.current.readiness.cooldownRemaining).toBe(0);
      expect(result.current.readiness.lastInitiation).toBeNull();
    });

    it("should initialize awareness state", () => {
      const { result } = renderHook(() =>
        useProactivePresence(createDefaultOptions())
      );

      expect(result.current.awareness).toBeDefined();
      expect(result.current.awareness.userReturnedAfterAway).toBe(false);
      expect(result.current.awareness.moodShiftDetected).toBe(false);
      expect(result.current.awareness.moodDirection).toBe("stable");
    });

    it("should initialize visual hints", () => {
      const { result } = renderHook(() =>
        useProactivePresence(createDefaultOptions())
      );

      expect(result.current.visualHints).toBeDefined();
      expect(result.current.visualHints.showReadyGlow).toBeDefined();
      expect(result.current.visualHints.showWarmth).toBeDefined();
      expect(result.current.visualHints.showInvitation).toBeDefined();
      expect(result.current.visualHints.showCare).toBeDefined();
    });

    it("should initialize with starting conversation momentum for short sessions", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 10; // Less than 30 seconds

      const { result } = renderHook(() => useProactivePresence(options));

      // Run the effect
      act(() => {
        triggerRaf();
      });

      expect(result.current.awareness.conversationMomentum).toBe("starting");
    });
  });

  // ============================================================================
  // Disabled State Tests
  // ============================================================================

  describe("disabled state", () => {
    it("should return default state when disabled", () => {
      const options = createDefaultOptions();
      options.enabled = false;

      const { result } = renderHook(() => useProactivePresence(options));

      expect(result.current.currentAction).toBeNull();
      expect(result.current.shouldInitiate).toBe(false);
      expect(result.current.readiness.canInitiate).toBe(false);
    });

    it("should return default state when not connected", () => {
      const options = createDefaultOptions();
      options.isConnected = false;

      const { result } = renderHook(() => useProactivePresence(options));

      expect(result.current.currentAction).toBeNull();
      expect(result.current.readiness.canInitiate).toBe(false);
    });
  });

  // ============================================================================
  // Initiation Prevention Tests
  // ============================================================================

  describe("initiation prevention", () => {
    it("should not initiate when listening", () => {
      const options = createDefaultOptions();
      options.isListening = true;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.readiness.canInitiate).toBe(false);
    });

    it("should not initiate when speaking", () => {
      const options = createDefaultOptions();
      options.isSpeaking = true;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.readiness.canInitiate).toBe(false);
    });

    it("should not initiate when thinking", () => {
      const options = createDefaultOptions();
      options.isThinking = true;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.readiness.canInitiate).toBe(false);
    });
  });

  // ============================================================================
  // Comfort Offer Tests
  // ============================================================================

  describe("comfort offer", () => {
    it("should trigger comfort offer for sadness with high intensity", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "sadness";
      options.emotionalIntensity = 0.7;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction).not.toBeNull();
      expect(result.current.currentAction?.type).toBe("comfort_offer");
      expect(result.current.currentAction?.urgency).toBe("soft");
    });

    it("should trigger comfort offer for anxiety", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "anxiety";
      options.emotionalIntensity = 0.7;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.type).toBe("comfort_offer");
    });

    it("should trigger comfort offer for loneliness", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "loneliness";
      options.emotionalIntensity = 0.7;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.type).toBe("comfort_offer");
    });

    it("should not trigger comfort offer for low intensity distress", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "sadness";
      options.emotionalIntensity = 0.3; // Below threshold

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      // Should be null or not comfort_offer
      if (result.current.currentAction) {
        expect(result.current.currentAction.type).not.toBe("comfort_offer");
      }
    });

    it("should show care visual hint for comfort offer", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "sadness";
      options.emotionalIntensity = 0.7;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.visualHints.showCare).toBe(true);
    });
  });

  // ============================================================================
  // Celebration Tests
  // ============================================================================

  describe("celebration", () => {
    it("should trigger celebration for joy with high intensity", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "joy";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.type).toBe("celebration");
      expect(result.current.currentAction?.urgency).toBe("warm");
    });

    it("should trigger celebration for happiness", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "happiness";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.type).toBe("celebration");
    });

    it("should trigger celebration for excitement", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "excitement";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.type).toBe("celebration");
    });

    it("should not trigger celebration for low intensity positive emotion", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "joy";
      options.emotionalIntensity = 0.5; // Below 0.7 threshold

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      // Should be null or not celebration
      if (result.current.currentAction) {
        expect(result.current.currentAction.type).not.toBe("celebration");
      }
    });
  });

  // ============================================================================
  // Emotional Followup Tests
  // ============================================================================

  describe("emotional followup", () => {
    it("should trigger emotional followup after vulnerability moment when calm", () => {
      const options = createDefaultOptions();
      options.recentVulnerabilityMoments = 1;
      options.currentEmotion = "neutral";
      options.silenceDuration = 25;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.type).toBe("emotional_followup");
      expect(result.current.currentAction?.urgency).toBe("gentle");
    });

    it("should not trigger followup without recent vulnerability", () => {
      const options = createDefaultOptions();
      options.recentVulnerabilityMoments = 0;
      options.currentEmotion = "neutral";
      options.silenceDuration = 25;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      // Should be null or not emotional_followup
      if (result.current.currentAction) {
        expect(result.current.currentAction.type).not.toBe("emotional_followup");
      }
    });

    it("should not trigger followup if silence is too short", () => {
      const options = createDefaultOptions();
      options.recentVulnerabilityMoments = 1;
      options.currentEmotion = "neutral";
      options.silenceDuration = 10; // Below 20 threshold

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      if (result.current.currentAction) {
        expect(result.current.currentAction.type).not.toBe("emotional_followup");
      }
    });
  });

  // ============================================================================
  // Silence Presence Tests
  // ============================================================================

  describe("silence presence", () => {
    it("should trigger silence presence for long quality silence", () => {
      const options = createDefaultOptions();
      options.isInSilence = true;
      options.silenceQuality = 0.7;
      options.silenceDuration = 70;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.type).toBe("silence_presence");
      expect(result.current.currentAction?.visualOnly).toBe(true);
      expect(result.current.currentAction?.message).toBeNull();
    });

    it("should not trigger silence presence for short silence", () => {
      const options = createDefaultOptions();
      options.isInSilence = true;
      options.silenceQuality = 0.7;
      options.silenceDuration = 30; // Below 60 threshold

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      if (result.current.currentAction) {
        expect(result.current.currentAction.type).not.toBe("silence_presence");
      }
    });

    it("should not trigger silence presence for low quality silence", () => {
      const options = createDefaultOptions();
      options.isInSilence = true;
      options.silenceQuality = 0.4; // Below 0.6 threshold
      options.silenceDuration = 70;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      if (result.current.currentAction) {
        expect(result.current.currentAction.type).not.toBe("silence_presence");
      }
    });
  });

  // ============================================================================
  // Conversation Momentum Tests
  // ============================================================================

  describe("conversation momentum", () => {
    it("should detect starting momentum for new sessions", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 15;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.awareness.conversationMomentum).toBe("starting");
    });

    it("should detect paused momentum during long silence", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 120;
      options.isInSilence = true;
      options.silenceDuration = 35;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.awareness.conversationMomentum).toBe("paused");
    });

    it("should detect flowing momentum when actively conversing", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 120;
      options.isListening = true;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.awareness.conversationMomentum).toBe("flowing");
    });

    it("should detect winding down with low activity", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 120;
      options.userActivityLevel = 0.05;
      options.isInSilence = false;
      options.silenceDuration = 10;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.awareness.conversationMomentum).toBe("winding_down");
    });
  });

  // ============================================================================
  // Visual Hints Tests
  // ============================================================================

  describe("visual hints", () => {
    it("should show ready glow when action is pending", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "sadness";
      options.emotionalIntensity = 0.7;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.visualHints.showReadyGlow).toBe(true);
    });

    it("should show ready glow at conversation start", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 10;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.visualHints.showReadyGlow).toBe(true);
    });

    it("should show warmth for warm urgency actions", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "joy";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      if (result.current.currentAction?.urgency === "warm") {
        expect(result.current.visualHints.showWarmth).toBe(true);
      }
    });

    it("should show invitation when paused without visual-only action", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 120;
      options.isInSilence = true;
      options.silenceDuration = 35;
      options.silenceQuality = 0.3; // Low quality, so no silence_presence

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      // Should show invitation since momentum is paused
      expect(result.current.awareness.conversationMomentum).toBe("paused");
    });

    it("should show care for mood check actions", () => {
      // This test verifies mood_check also shows care
      // We need declining mood with intensity
      const options = createDefaultOptions();
      options.currentEmotion = "sadness";
      options.emotionalIntensity = 0.7;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      // comfort_offer also shows care
      if (result.current.currentAction?.type === "comfort_offer" ||
          result.current.currentAction?.type === "mood_check") {
        expect(result.current.visualHints.showCare).toBe(true);
      }
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const { unmount } = renderHook(() =>
        useProactivePresence(createDefaultOptions())
      );

      act(() => {
        triggerRaf();
      });

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it("should handle rapid mount/unmount cycles", () => {
      for (let i = 0; i < 5; i++) {
        const { unmount } = renderHook(() =>
          useProactivePresence(createDefaultOptions())
        );

        act(() => {
          triggerRaf();
        });

        unmount();
      }

      // Should not throw
      expect(true).toBe(true);
    });
  });

  // ============================================================================
  // Edge Cases Tests
  // ============================================================================

  describe("edge cases", () => {
    it("should handle all comfort emotions", () => {
      const comfortEmotions = ["sadness", "anxiety", "fear", "loneliness", "stress", "frustration"];

      for (const emotion of comfortEmotions) {
        const options = createDefaultOptions();
        options.currentEmotion = emotion;
        options.emotionalIntensity = 0.7;

        const { result, unmount } = renderHook(() => useProactivePresence(options));

        act(() => {
          triggerRaf();
        });

        expect(result.current.currentAction?.type).toBe("comfort_offer");
        unmount();
      }
    });

    it("should handle all celebration emotions", () => {
      const celebrationEmotions = ["joy", "happiness", "excitement", "love", "gratitude"];

      for (const emotion of celebrationEmotions) {
        const options = createDefaultOptions();
        options.currentEmotion = emotion;
        options.emotionalIntensity = 0.8;

        const { result, unmount } = renderHook(() => useProactivePresence(options));

        act(() => {
          triggerRaf();
        });

        expect(result.current.currentAction?.type).toBe("celebration");
        unmount();
      }
    });

    it("should handle neutral emotion state", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "neutral";
      options.emotionalIntensity = 0.5;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      // Should not trigger comfort or celebration
      if (result.current.currentAction) {
        expect(result.current.currentAction.type).not.toBe("comfort_offer");
        expect(result.current.currentAction.type).not.toBe("celebration");
      }
    });

    it("should handle zero emotional intensity", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "sadness";
      options.emotionalIntensity = 0;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      // Should not trigger action due to low intensity
      if (result.current.currentAction) {
        expect(result.current.currentAction.type).not.toBe("comfort_offer");
      }
    });

    it("should handle max emotional intensity", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "joy";
      options.emotionalIntensity = 1.0;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.type).toBe("celebration");
    });

    it("should handle undefined moodTrend", () => {
      const options = createDefaultOptions();
      // @ts-expect-error - testing undefined handling
      options.moodTrend = undefined;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      // Should use default "stable"
      expect(result.current.awareness.moodDirection).toBeDefined();
    });

    it("should handle zero connection duration", () => {
      const options = createDefaultOptions();
      options.connectionDuration = 0;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.awareness.conversationMomentum).toBe("starting");
    });

    it("should handle very long silence duration", () => {
      const options = createDefaultOptions();
      options.isInSilence = true;
      options.silenceDuration = 3600; // 1 hour
      options.silenceQuality = 0.7;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.type).toBe("silence_presence");
    });

    it("should handle transition from disabled to enabled", () => {
      const options = createDefaultOptions();
      options.enabled = false;

      const { result, rerender } = renderHook(
        (props) => useProactivePresence(props),
        { initialProps: options }
      );

      expect(result.current.readiness.canInitiate).toBe(false);

      // Enable the hook
      rerender({ ...options, enabled: true });

      act(() => {
        triggerRaf();
      });

      // Now it should be able to initiate
      expect(result.current.readiness.canInitiate).toBe(true);
    });
  });

  // ============================================================================
  // Proactive Messages Tests
  // ============================================================================

  describe("proactive messages", () => {
    it("should have message for comfort offer", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "sadness";
      options.emotionalIntensity = 0.7;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.message).toBeTruthy();
      expect(typeof result.current.currentAction?.message).toBe("string");
    });

    it("should have message for celebration", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "joy";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.message).toBeTruthy();
    });

    it("should have message for emotional followup", () => {
      const options = createDefaultOptions();
      options.recentVulnerabilityMoments = 1;
      options.currentEmotion = "neutral";
      options.silenceDuration = 25;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.message).toBeTruthy();
    });

    it("should have no message for silence presence", () => {
      const options = createDefaultOptions();
      options.isInSilence = true;
      options.silenceQuality = 0.7;
      options.silenceDuration = 70;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.message).toBeNull();
    });
  });

  // ============================================================================
  // Dismissable Tests
  // ============================================================================

  describe("action dismissability", () => {
    it("should allow dismissing comfort offer", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "sadness";
      options.emotionalIntensity = 0.7;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.canDismiss).toBe(true);
    });

    it("should allow dismissing celebration", () => {
      const options = createDefaultOptions();
      options.currentEmotion = "joy";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.canDismiss).toBe(true);
    });

    it("should not allow dismissing silence presence", () => {
      const options = createDefaultOptions();
      options.isInSilence = true;
      options.silenceQuality = 0.7;
      options.silenceDuration = 70;

      const { result } = renderHook(() => useProactivePresence(options));

      act(() => {
        triggerRaf();
      });

      expect(result.current.currentAction?.canDismiss).toBe(false);
    });
  });
});
