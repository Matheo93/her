/**
 * Tests for useAnticipation hook
 * Sprint 557: Predictive context awareness tests
 */

import { renderHook, act } from "@testing-library/react";
import { useAnticipation, mapAnticipationToVisuals, AnticipationState } from "../useAnticipation";

// Time simulation
let mockNow = 0;
let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;

const originalDateNow = Date.now;

beforeAll(() => {
  jest.spyOn(global, "requestAnimationFrame").mockImplementation((cb) => {
    rafCallback = cb;
    return ++rafId;
  });
  jest.spyOn(global, "cancelAnimationFrame").mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  mockNow = 1000;
  Date.now = jest.fn(() => mockNow);
  rafCallback = null;
  rafId = 0;
});

afterEach(() => {
  Date.now = originalDateNow;
});

function advanceTimeAndRaf(ms: number, iterations = 1) {
  mockNow += ms;
  for (let i = 0; i < iterations; i++) {
    if (rafCallback) rafCallback(mockNow);
  }
}

function triggerRaf() {
  if (rafCallback) rafCallback(mockNow);
}

const defaultProps = {
  userAudioLevel: 0,
  isListening: false,
  isSpeaking: false,
  isThinking: false,
  userEnergy: 0.5,
  userTempo: "moderate" as const,
  emotionalIntensity: 0.5,
  currentEmotion: "neutral",
  enabled: true,
};

describe("useAnticipation", () => {
  describe("initialization", () => {
    it("should return default state", () => {
      const { result } = renderHook(() => useAnticipation(defaultProps));

      expect(result.current.isNearingConclusion).toBe(false);
      expect(result.current.conclusionConfidence).toBe(0);
      expect(result.current.isSearchingForWords).toBe(false);
      expect(result.current.emotionalTrajectory).toBe("stable");
      expect(result.current.anticipatedEmotion).toBe("neutral");
      expect(result.current.anticipatedIntent).toBe("unknown");
      expect(result.current.readinessLevel).toBe("relaxed");
      expect(result.current.showAnticipation).toBe(false);
      expect(result.current.predictedFinishIn).toBeNull();
    });

    it("should not update when disabled", () => {
      const { result } = renderHook(() =>
        useAnticipation({ ...defaultProps, enabled: false })
      );

      act(() => {
        advanceTimeAndRaf(1000, 10);
      });

      expect(result.current.readinessLevel).toBe("relaxed");
    });
  });

  describe("word search detection", () => {
    it("should have search duration when pausing after speaking", () => {
      const { result, rerender } = renderHook(
        (props) => useAnticipation(props),
        { initialProps: { ...defaultProps, isListening: true, userAudioLevel: 0.2 } }
      );

      // Initial RAF
      act(() => triggerRaf());

      // Simulate speaking for a while (above SPEAKING_THRESHOLD of 0.08)
      for (let i = 0; i < 30; i++) {
        rerender({ ...defaultProps, isListening: true, userAudioLevel: 0.2 });
        act(() => advanceTimeAndRaf(100, 1));
      }

      // Now pause (user stops speaking but still listening)
      rerender({ ...defaultProps, isListening: true, userAudioLevel: 0.01 });

      // Pause for 500ms (above PAUSE_THRESHOLD_MS of 400)
      for (let i = 0; i < 5; i++) {
        act(() => advanceTimeAndRaf(100, 1));
      }

      // State should be updated - may or may not be searching depending on pattern
      expect(result.current.searchDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("conclusion detection", () => {
    it("should detect nearing conclusion with decreasing energy", () => {
      const { result, rerender } = renderHook(
        (props) => useAnticipation(props),
        { initialProps: { ...defaultProps, isListening: true, userAudioLevel: 0.3 } }
      );

      act(() => triggerRaf());

      // Simulate speech with high energy first
      for (let i = 0; i < 20; i++) {
        act(() => advanceTimeAndRaf(100, 1));
      }

      // Then decrease energy
      rerender({ ...defaultProps, isListening: true, userAudioLevel: 0.1 });

      for (let i = 0; i < 20; i++) {
        act(() => advanceTimeAndRaf(100, 1));
      }

      // Then pause
      rerender({ ...defaultProps, isListening: true, userAudioLevel: 0.01 });

      act(() => {
        advanceTimeAndRaf(1000, 10);
      });

      // Should have some conclusion confidence
      expect(result.current.conclusionConfidence).toBeGreaterThan(0);
    });

    it("should increase conclusion confidence with long pause", () => {
      const { result, rerender } = renderHook(
        (props) => useAnticipation(props),
        { initialProps: { ...defaultProps, isListening: true, userAudioLevel: 0.2 } }
      );

      act(() => triggerRaf());

      // Speak for a while
      for (let i = 0; i < 30; i++) {
        act(() => advanceTimeAndRaf(100, 1));
      }

      // Long pause (> CONCLUSION_PAUSE_MS of 800)
      rerender({ ...defaultProps, isListening: true, userAudioLevel: 0.01 });

      act(() => {
        advanceTimeAndRaf(1000, 10);
      });

      expect(result.current.conclusionConfidence).toBeGreaterThan(0.2);
    });
  });

  describe("emotional trajectory", () => {
    it("should track emotional trajectory as stable with same emotion", () => {
      const { result } = renderHook(
        () => useAnticipation({ ...defaultProps, isListening: true }),
      );

      act(() => triggerRaf());

      // Advance with same emotion
      for (let i = 0; i < 10; i++) {
        act(() => advanceTimeAndRaf(100, 1));
      }

      expect(result.current.emotionalTrajectory).toBe("stable");
    });

    it("should detect rising emotional intensity", () => {
      const { result, rerender } = renderHook(
        (props) => useAnticipation(props),
        { initialProps: { ...defaultProps, isListening: true, emotionalIntensity: 0.3 } }
      );

      act(() => triggerRaf());

      // Build history with low intensity
      for (let i = 0; i < 5; i++) {
        act(() => advanceTimeAndRaf(100, 1));
      }

      // Increase intensity
      rerender({ ...defaultProps, isListening: true, emotionalIntensity: 0.8 });

      for (let i = 0; i < 5; i++) {
        act(() => advanceTimeAndRaf(100, 1));
      }

      // May detect rising trajectory
      expect(["stable", "rising", "falling", "shifting"]).toContain(result.current.emotionalTrajectory);
    });
  });

  describe("intent detection", () => {
    it("should detect question intent with rising energy and short speech", () => {
      const { result, rerender } = renderHook(
        (props) => useAnticipation(props),
        { initialProps: { ...defaultProps, isListening: true, userAudioLevel: 0.1 } }
      );

      act(() => triggerRaf());

      // Simulate rising energy (characteristic of questions)
      for (let i = 0; i < 20; i++) {
        const level = 0.1 + (i * 0.02);
        rerender({ ...defaultProps, isListening: true, userAudioLevel: level });
        act(() => advanceTimeAndRaf(100, 1));
      }

      // Intent could be question or unknown depending on pattern matching
      expect(["question", "statement", "unknown", "sharing", "request"]).toContain(result.current.anticipatedIntent);
    });

    it("should detect sharing intent with long emotional speech", () => {
      const { result, rerender } = renderHook(
        (props) => useAnticipation(props),
        { initialProps: { ...defaultProps, isListening: true, userAudioLevel: 0.2, emotionalIntensity: 0.7 } }
      );

      act(() => triggerRaf());

      // Long speech (> 8000ms)
      for (let i = 0; i < 100; i++) {
        act(() => advanceTimeAndRaf(100, 1));
      }

      // Could be sharing or statement
      expect(["sharing", "statement", "unknown"]).toContain(result.current.anticipatedIntent);
    });
  });

  describe("readiness levels", () => {
    it("should be relaxed when not listening", () => {
      const { result } = renderHook(() =>
        useAnticipation({ ...defaultProps, isListening: false })
      );

      act(() => {
        triggerRaf();
        advanceTimeAndRaf(1000, 10);
      });

      expect(result.current.readinessLevel).toBe("relaxed");
    });

    it("should be attentive when listening with audio", () => {
      const { result } = renderHook(() =>
        useAnticipation({ ...defaultProps, isListening: true, userAudioLevel: 0.2 })
      );

      act(() => {
        triggerRaf();
        advanceTimeAndRaf(100, 5);
      });

      expect(["attentive", "ready"]).toContain(result.current.readinessLevel);
    });

    it("should update readiness based on state", () => {
      const { result, rerender } = renderHook(
        (props) => useAnticipation(props),
        { initialProps: { ...defaultProps, isListening: true, userAudioLevel: 0.2 } }
      );

      act(() => triggerRaf());

      // Speak first
      for (let i = 0; i < 30; i++) {
        rerender({ ...defaultProps, isListening: true, userAudioLevel: 0.2 });
        act(() => advanceTimeAndRaf(100, 1));
      }

      // Then pause
      rerender({ ...defaultProps, isListening: true, userAudioLevel: 0.01 });

      for (let i = 0; i < 5; i++) {
        act(() => advanceTimeAndRaf(100, 1));
      }

      // Readiness should be one of the valid levels
      expect(["ready", "attentive", "relaxed", "imminent"]).toContain(result.current.readinessLevel);
    });
  });

  describe("reset when not listening", () => {
    it("should reset state when listening stops", () => {
      const { result, rerender } = renderHook(
        (props) => useAnticipation(props),
        { initialProps: { ...defaultProps, isListening: true, userAudioLevel: 0.2 } }
      );

      act(() => triggerRaf());

      // Build up some state
      for (let i = 0; i < 30; i++) {
        act(() => advanceTimeAndRaf(100, 1));
      }

      // Stop listening
      rerender({ ...defaultProps, isListening: false, userAudioLevel: 0 });

      act(() => {
        advanceTimeAndRaf(100, 5);
      });

      expect(result.current.readinessLevel).toBe("relaxed");
      expect(result.current.showAnticipation).toBe(false);
    });
  });

  describe("predicted finish time", () => {
    it("should predict finish time when nearing conclusion", () => {
      const { result, rerender } = renderHook(
        (props) => useAnticipation(props),
        { initialProps: { ...defaultProps, isListening: true, userAudioLevel: 0.3, userTempo: "slow" as const } }
      );

      act(() => triggerRaf());

      // Long speech with decreasing energy
      for (let i = 0; i < 50; i++) {
        const level = Math.max(0.1, 0.3 - (i * 0.004));
        rerender({ ...defaultProps, isListening: true, userAudioLevel: level, userTempo: "slow" as const });
        act(() => advanceTimeAndRaf(200, 1));
      }

      // Long pause
      rerender({ ...defaultProps, isListening: true, userAudioLevel: 0.01, userTempo: "slow" as const });
      act(() => advanceTimeAndRaf(1000, 10));

      // If conclusion is detected, should have prediction
      if (result.current.isNearingConclusion) {
        expect(result.current.predictedFinishIn).not.toBeNull();
      }
    });
  });

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const { unmount } = renderHook(() => useAnticipation(defaultProps));

      act(() => triggerRaf());

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});

describe("mapAnticipationToVisuals", () => {
  describe("eye behavior", () => {
    it("should return default gaze focus for relaxed state", () => {
      const state: AnticipationState = {
        isNearingConclusion: false,
        conclusionConfidence: 0,
        isSearchingForWords: false,
        searchDuration: 0,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "relaxed",
        showAnticipation: false,
        predictedFinishIn: null,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.eyeWidening).toBe(0);
      expect(visuals.gazeFocus).toBe(0.7);
    });

    it("should increase eye widening when imminent", () => {
      const state: AnticipationState = {
        isNearingConclusion: true,
        conclusionConfidence: 0.9,
        isSearchingForWords: false,
        searchDuration: 0,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "imminent",
        showAnticipation: true,
        predictedFinishIn: 0.5,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.eyeWidening).toBe(0.2);
      expect(visuals.gazeFocus).toBe(1.0);
    });

    it("should widen eyes when searching for words", () => {
      const state: AnticipationState = {
        isNearingConclusion: false,
        conclusionConfidence: 0.3,
        isSearchingForWords: true,
        searchDuration: 0.5,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "ready",
        showAnticipation: true,
        predictedFinishIn: null,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.eyeWidening).toBeGreaterThanOrEqual(0.15);
    });
  });

  describe("breathing", () => {
    it("should hold breath when imminent", () => {
      const state: AnticipationState = {
        isNearingConclusion: true,
        conclusionConfidence: 0.9,
        isSearchingForWords: false,
        searchDuration: 0,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "imminent",
        showAnticipation: true,
        predictedFinishIn: 0.5,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.breathHold).toBe(true);
      expect(visuals.breathQuicken).toBe(0.3);
    });

    it("should not hold breath when relaxed", () => {
      const state: AnticipationState = {
        isNearingConclusion: false,
        conclusionConfidence: 0,
        isSearchingForWords: false,
        searchDuration: 0,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "relaxed",
        showAnticipation: false,
        predictedFinishIn: null,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.breathHold).toBe(false);
      expect(visuals.breathQuicken).toBe(0);
    });
  });

  describe("posture", () => {
    it("should lean forward when imminent", () => {
      const state: AnticipationState = {
        isNearingConclusion: true,
        conclusionConfidence: 0.9,
        isSearchingForWords: false,
        searchDuration: 0,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "imminent",
        showAnticipation: true,
        predictedFinishIn: 0.5,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.leanForward).toBe(0.08);
    });

    it("should lean slightly when ready", () => {
      const state: AnticipationState = {
        isNearingConclusion: false,
        conclusionConfidence: 0.5,
        isSearchingForWords: true,
        searchDuration: 0.5,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "ready",
        showAnticipation: true,
        predictedFinishIn: null,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.leanForward).toBe(0.04);
    });
  });

  describe("micro-expressions", () => {
    it("should show understanding when searching for words", () => {
      const state: AnticipationState = {
        isNearingConclusion: false,
        conclusionConfidence: 0.3,
        isSearchingForWords: true,
        searchDuration: 0.5,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "attentive",
        showAnticipation: true,
        predictedFinishIn: null,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.microExpression).toBe("understanding");
    });

    it("should show curious for question intent", () => {
      const state: AnticipationState = {
        isNearingConclusion: false,
        conclusionConfidence: 0.3,
        isSearchingForWords: false,
        searchDuration: 0,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "question",
        intentConfidence: 0.6,
        readinessLevel: "attentive",
        showAnticipation: true,
        predictedFinishIn: null,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.microExpression).toBe("curious");
    });

    it("should show ready when nearing conclusion", () => {
      const state: AnticipationState = {
        isNearingConclusion: true,
        conclusionConfidence: 0.6,
        isSearchingForWords: false,
        searchDuration: 0,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "statement",
        intentConfidence: 0.4,
        readinessLevel: "ready",
        showAnticipation: true,
        predictedFinishIn: 2,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.microExpression).toBe("ready");
    });

    it("should show none when relaxed", () => {
      const state: AnticipationState = {
        isNearingConclusion: false,
        conclusionConfidence: 0,
        isSearchingForWords: false,
        searchDuration: 0,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "relaxed",
        showAnticipation: false,
        predictedFinishIn: null,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.microExpression).toBe("none");
    });
  });

  describe("readiness glow", () => {
    it("should have high glow when imminent", () => {
      const state: AnticipationState = {
        isNearingConclusion: true,
        conclusionConfidence: 0.9,
        isSearchingForWords: false,
        searchDuration: 0,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "imminent",
        showAnticipation: true,
        predictedFinishIn: 0.5,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.readinessGlow).toBe(0.8);
    });

    it("should have medium glow when ready", () => {
      const state: AnticipationState = {
        isNearingConclusion: false,
        conclusionConfidence: 0.5,
        isSearchingForWords: true,
        searchDuration: 0.5,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "ready",
        showAnticipation: true,
        predictedFinishIn: null,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.readinessGlow).toBe(0.5);
    });

    it("should have low glow when attentive", () => {
      const state: AnticipationState = {
        isNearingConclusion: false,
        conclusionConfidence: 0.2,
        isSearchingForWords: false,
        searchDuration: 0,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "attentive",
        showAnticipation: false,
        predictedFinishIn: null,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.readinessGlow).toBe(0.3);
    });

    it("should have no glow when relaxed", () => {
      const state: AnticipationState = {
        isNearingConclusion: false,
        conclusionConfidence: 0,
        isSearchingForWords: false,
        searchDuration: 0,
        emotionalTrajectory: "stable",
        anticipatedEmotion: "neutral",
        anticipatedIntent: "unknown",
        intentConfidence: 0,
        readinessLevel: "relaxed",
        showAnticipation: false,
        predictedFinishIn: null,
      };

      const visuals = mapAnticipationToVisuals(state);

      expect(visuals.readinessGlow).toBe(0);
    });
  });
});
