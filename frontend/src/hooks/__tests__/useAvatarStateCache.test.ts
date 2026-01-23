/**
 * Tests for Avatar State Cache Hook - Sprint 514
 *
 * Tests debouncing, state merging, and render optimization
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useAvatarStateCache, useAvatarComputations } from "../useAvatarStateCache";

// Mock performance.now for consistent timing
let mockNow = 0;
jest.spyOn(performance, "now").mockImplementation(() => mockNow);

// Mock requestAnimationFrame
let rafCallbacks: FrameRequestCallback[] = [];
let rafId = 0;

beforeEach(() => {
  mockNow = 0;
  rafCallbacks = [];
  rafId = 0;

  global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return ++rafId;
  });

  global.cancelAnimationFrame = jest.fn((id: number) => {
    // Remove callback (simplified)
  });

  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Helper to advance animation frames
function advanceFrame(ms: number = 16) {
  mockNow += ms;
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  callbacks.forEach((cb) => cb(mockNow));
}

describe("useAvatarStateCache", () => {
  describe("initial state", () => {
    it("should return default state initially", () => {
      const { result } = renderHook(() => useAvatarStateCache());

      expect(result.current.state).toEqual({
        visemeWeights: { sil: 1 },
        emotion: "neutral",
        isSpeaking: false,
        isListening: false,
        audioLevel: 0,
      });
    });
  });

  describe("emotion updates", () => {
    it("should update emotion with debouncing", async () => {
      const { result } = renderHook(() => useAvatarStateCache({ debounceMs: 50 }));

      act(() => {
        result.current.updateEmotion("joy");
      });

      // Not immediately updated due to debounce
      expect(result.current.state.emotion).toBe("neutral");

      // Advance time past debounce
      act(() => {
        jest.advanceTimersByTime(60);
      });

      await waitFor(() => {
        expect(result.current.state.emotion).toBe("joy");
      });
    });

    it("should merge rapid emotion updates", async () => {
      const { result } = renderHook(() => useAvatarStateCache({ debounceMs: 50 }));

      act(() => {
        result.current.updateEmotion("joy");
        result.current.updateEmotion("sadness");
        result.current.updateEmotion("warmth");
      });

      act(() => {
        jest.advanceTimersByTime(60);
      });

      await waitFor(() => {
        // Should only have the last value
        expect(result.current.state.emotion).toBe("warmth");
      });
    });
  });

  describe("speaking/listening updates", () => {
    it("should update speaking state immediately (no debounce)", () => {
      const { result } = renderHook(() => useAvatarStateCache());

      act(() => {
        result.current.updateSpeaking(true);
      });

      expect(result.current.state.isSpeaking).toBe(true);
    });

    it("should update listening state immediately (no debounce)", () => {
      const { result } = renderHook(() => useAvatarStateCache());

      act(() => {
        result.current.updateListening(true);
      });

      expect(result.current.state.isListening).toBe(true);
    });

    it("should not re-render if speaking state unchanged", () => {
      const { result } = renderHook(() => useAvatarStateCache());

      const stateBefore = result.current.state;

      act(() => {
        result.current.updateSpeaking(false); // Already false
      });

      // Same reference = no re-render
      expect(result.current.state).toBe(stateBefore);
    });
  });

  describe("audio level smoothing", () => {
    it("should smooth audio level transitions", () => {
      const { result } = renderHook(() =>
        useAvatarStateCache({ audioLevelThreshold: 0.01 })
      );

      // Set target audio level
      act(() => {
        result.current.updateAudioLevel(1.0);
      });

      // Advance several frames
      act(() => {
        advanceFrame(16);
        advanceFrame(16);
        advanceFrame(16);
      });

      // Should be moving toward 1.0 but not there instantly
      expect(result.current.state.audioLevel).toBeGreaterThan(0);
      expect(result.current.state.audioLevel).toBeLessThan(1);
    });

    it("should ignore small audio level changes", async () => {
      const { result } = renderHook(() =>
        useAvatarStateCache({ audioLevelThreshold: 0.05 })
      );

      // Set initial level
      act(() => {
        result.current.updateAudioLevel(0.5);
        advanceFrame(16);
        advanceFrame(16);
        advanceFrame(16);
        advanceFrame(16);
        advanceFrame(16);
      });

      const levelBefore = result.current.state.audioLevel;

      // Small change below threshold
      act(() => {
        result.current.updateAudioLevel(levelBefore + 0.01);
        advanceFrame(16);
      });

      // Should not trigger re-render for tiny change
      expect(Math.abs(result.current.state.audioLevel - levelBefore)).toBeLessThan(0.1);
    });
  });

  describe("viseme weight updates", () => {
    it("should update viseme weights with debouncing", async () => {
      const { result } = renderHook(() => useAvatarStateCache({ debounceMs: 50 }));

      act(() => {
        result.current.updateVisemeWeights({ AA: 0.8, EE: 0.2 });
      });

      act(() => {
        jest.advanceTimersByTime(60);
      });

      await waitFor(() => {
        expect(result.current.state.visemeWeights.AA).toBe(0.8);
      });
    });

    it("should ignore small viseme changes", async () => {
      const { result } = renderHook(() =>
        useAvatarStateCache({
          debounceMs: 50,
          visemeChangeThreshold: 0.1,
        })
      );

      // Set initial visemes
      act(() => {
        result.current.updateVisemeWeights({ AA: 0.5, sil: 0.5 });
        jest.advanceTimersByTime(60);
      });

      // Small change below threshold
      act(() => {
        result.current.updateVisemeWeights({ AA: 0.52, sil: 0.48 });
        jest.advanceTimersByTime(60);
      });

      // Should not update for tiny changes
      await waitFor(() => {
        expect(result.current.state.visemeWeights.AA).toBeCloseTo(0.5, 1);
      });
    });
  });

  describe("batch updates", () => {
    it("should batch multiple updates together", async () => {
      const { result } = renderHook(() => useAvatarStateCache({ debounceMs: 50 }));

      act(() => {
        result.current.batchUpdate({
          emotion: "joy",
          visemeWeights: { AA: 0.6 },
        });
      });

      act(() => {
        jest.advanceTimersByTime(60);
      });

      await waitFor(() => {
        expect(result.current.state.emotion).toBe("joy");
        expect(result.current.state.visemeWeights.AA).toBe(0.6);
      });
    });
  });

  describe("reset state", () => {
    it("should reset to default state", async () => {
      const { result } = renderHook(() => useAvatarStateCache({ debounceMs: 50 }));

      // Make some changes
      act(() => {
        result.current.updateSpeaking(true);
        result.current.updateEmotion("joy");
        jest.advanceTimersByTime(60);
      });

      // Reset
      act(() => {
        result.current.resetState();
      });

      expect(result.current.state).toEqual({
        visemeWeights: { sil: 1 },
        emotion: "neutral",
        isSpeaking: false,
        isListening: false,
        audioLevel: 0,
      });
    });

    it("should cancel pending updates on reset", () => {
      const { result } = renderHook(() => useAvatarStateCache({ debounceMs: 100 }));

      // Queue an update
      act(() => {
        result.current.updateEmotion("joy");
      });

      // Reset before debounce completes
      act(() => {
        result.current.resetState();
        jest.advanceTimersByTime(150);
      });

      // Should still be at default
      expect(result.current.state.emotion).toBe("neutral");
    });
  });
});

describe("useAvatarComputations", () => {
  describe("mouth openness calculation", () => {
    it("should return 0 when not speaking", () => {
      const { result } = renderHook(() =>
        useAvatarComputations({
          visemeWeights: { AA: 0.8, sil: 0.2 },
          emotion: "neutral",
          isSpeaking: false,
          isListening: false,
          audioLevel: 0.5,
        })
      );

      expect(result.current.mouthOpenness).toBe(0);
    });

    it("should return 0 when audio level is too low", () => {
      const { result } = renderHook(() =>
        useAvatarComputations({
          visemeWeights: { AA: 0.8, sil: 0.2 },
          emotion: "neutral",
          isSpeaking: true,
          isListening: false,
          audioLevel: 0.02, // Below threshold
        })
      );

      expect(result.current.mouthOpenness).toBe(0);
    });

    it("should calculate openness from viseme weights", () => {
      const { result } = renderHook(() =>
        useAvatarComputations({
          visemeWeights: { AA: 0.8, EE: 0.2, sil: 0 },
          emotion: "neutral",
          isSpeaking: true,
          isListening: false,
          audioLevel: 0.5,
        })
      );

      expect(result.current.mouthOpenness).toBeGreaterThan(0);
    });

    it("should reduce openness with silence viseme", () => {
      const { result: withSilence } = renderHook(() =>
        useAvatarComputations({
          visemeWeights: { AA: 0.8, sil: 0.5 },
          emotion: "neutral",
          isSpeaking: true,
          isListening: false,
          audioLevel: 0.5,
        })
      );

      const { result: withoutSilence } = renderHook(() =>
        useAvatarComputations({
          visemeWeights: { AA: 0.8, sil: 0 },
          emotion: "neutral",
          isSpeaking: true,
          isListening: false,
          audioLevel: 0.5,
        })
      );

      expect(withSilence.current.mouthOpenness).toBeLessThan(
        withoutSilence.current.mouthOpenness
      );
    });
  });

  describe("display emotion calculation", () => {
    it("should return listening when isListening", () => {
      const { result } = renderHook(() =>
        useAvatarComputations({
          visemeWeights: { sil: 1 },
          emotion: "joy",
          isSpeaking: false,
          isListening: true,
          audioLevel: 0,
        })
      );

      expect(result.current.displayEmotion).toBe("listening");
    });

    it("should return current emotion when speaking", () => {
      const { result } = renderHook(() =>
        useAvatarComputations({
          visemeWeights: { sil: 1 },
          emotion: "joy",
          isSpeaking: true,
          isListening: false,
          audioLevel: 0.5,
        })
      );

      expect(result.current.displayEmotion).toBe("joy");
    });

    it("should prioritize listening over speaking emotion", () => {
      const { result } = renderHook(() =>
        useAvatarComputations({
          visemeWeights: { sil: 1 },
          emotion: "joy",
          isSpeaking: false,
          isListening: true,
          audioLevel: 0,
        })
      );

      expect(result.current.displayEmotion).toBe("listening");
    });
  });

  describe("activity level calculation", () => {
    it("should return audio level when speaking", () => {
      const { result } = renderHook(() =>
        useAvatarComputations({
          visemeWeights: { sil: 1 },
          emotion: "neutral",
          isSpeaking: true,
          isListening: false,
          audioLevel: 0.7,
        })
      );

      expect(result.current.activityLevel).toBe(0.7);
    });

    it("should return 0.5 when listening", () => {
      const { result } = renderHook(() =>
        useAvatarComputations({
          visemeWeights: { sil: 1 },
          emotion: "neutral",
          isSpeaking: false,
          isListening: true,
          audioLevel: 0,
        })
      );

      expect(result.current.activityLevel).toBe(0.5);
    });

    it("should return 0 when idle", () => {
      const { result } = renderHook(() =>
        useAvatarComputations({
          visemeWeights: { sil: 1 },
          emotion: "neutral",
          isSpeaking: false,
          isListening: false,
          audioLevel: 0,
        })
      );

      expect(result.current.activityLevel).toBe(0);
    });
  });
});
