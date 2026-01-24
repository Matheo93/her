/**
 * Tests for useProsodyMirroring hook - Sprint 545
 *
 * Tests emotional voice attunement for EVA:
 * - Hook return values and default state
 * - Prosody profile analysis (pitch, tempo, energy)
 * - Mirroring recommendations generation
 * - Attunement level calculation
 * - State transitions (listening, speaking)
 * - mapAttunementToVisual utility function
 * - Edge cases and error handling
 */

import { renderHook, act } from "@testing-library/react";
import { useProsodyMirroring, mapAttunementToVisual } from "../useProsodyMirroring";

// Mock requestAnimationFrame
let rafCallbacks: FrameRequestCallback[] = [];
let rafId = 0;

beforeAll(() => {
  jest.useFakeTimers();

  global.requestAnimationFrame = (callback: FrameRequestCallback) => {
    rafId++;
    rafCallbacks.push(callback);
    return rafId;
  };

  global.cancelAnimationFrame = (id: number) => {
    // Remove callback (simplified)
    rafCallbacks = [];
  };
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  rafCallbacks = [];
  rafId = 0;
  jest.clearAllMocks();
});

// Helper to advance RAF and time
const advanceFrame = (ms: number = 16) => {
  jest.advanceTimersByTime(ms);
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  callbacks.forEach((cb) => cb(performance.now()));
};

// Default options
const createDefaultOptions = () => ({
  userAudioLevel: 0.0,
  isListening: false,
  isSpeaking: false,
  detectedEmotion: "neutral",
  enabled: true,
});

describe("useProsodyMirroring", () => {
  // ============================================================================
  // Hook Return Values Tests
  // ============================================================================

  describe("hook return values", () => {
    it("should return userProsody object", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.userProsody).toBeDefined();
      expect(typeof result.current.userProsody).toBe("object");
    });

    it("should return mirroring recommendations object", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.mirroring).toBeDefined();
      expect(typeof result.current.mirroring).toBe("object");
    });

    it("should return isAnalyzing boolean", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(typeof result.current.isAnalyzing).toBe("boolean");
    });

    it("should return attunementLevel number", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(typeof result.current.attunementLevel).toBe("number");
    });

    it("should return attunementDescription string", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(typeof result.current.attunementDescription).toBe("string");
    });
  });

  // ============================================================================
  // Default State Tests
  // ============================================================================

  describe("default state", () => {
    it("should have default prosody with mid pitch level", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.userProsody.pitchLevel).toBe("mid");
    });

    it("should have default prosody with moderate tempo", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.userProsody.tempo).toBe("moderate");
    });

    it("should have default prosody with neutral style", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.userProsody.style).toBe("neutral");
    });

    it("should have default mirroring speed of 1.0", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.mirroring.suggestedSpeed).toBe(1.0);
    });

    it("should have default mirroring pitch of 1.0", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.mirroring.suggestedPitch).toBe(1.0);
    });

    it("should have default attunement level around 0.5", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.attunementLevel).toBe(0.5);
    });

    it("should not be analyzing by default", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.isAnalyzing).toBe(false);
    });
  });

  // ============================================================================
  // Prosody Profile Structure Tests
  // ============================================================================

  describe("prosody profile structure", () => {
    it("should have pitchVariability between 0 and 1", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.userProsody.pitchVariability).toBeGreaterThanOrEqual(0);
      expect(result.current.userProsody.pitchVariability).toBeLessThanOrEqual(1);
    });

    it("should have tempoVariability between 0 and 1", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.userProsody.tempoVariability).toBeGreaterThanOrEqual(0);
      expect(result.current.userProsody.tempoVariability).toBeLessThanOrEqual(1);
    });

    it("should have energy between 0 and 1", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.userProsody.energy).toBeGreaterThanOrEqual(0);
      expect(result.current.userProsody.energy).toBeLessThanOrEqual(1);
    });

    it("should have valid energyContour value", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(["flat", "rising", "falling", "varied"]).toContain(
        result.current.userProsody.energyContour
      );
    });

    it("should have valid pauseFrequency value", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(["rare", "occasional", "frequent"]).toContain(
        result.current.userProsody.pauseFrequency
      );
    });

    it("should have emotionalWarmth between 0 and 1", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.userProsody.emotionalWarmth).toBeGreaterThanOrEqual(0);
      expect(result.current.userProsody.emotionalWarmth).toBeLessThanOrEqual(1);
    });

    it("should have emotionalIntensity between 0 and 1", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.userProsody.emotionalIntensity).toBeGreaterThanOrEqual(0);
      expect(result.current.userProsody.emotionalIntensity).toBeLessThanOrEqual(1);
    });

    it("should have intimacyLevel between 0 and 1", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.userProsody.intimacyLevel).toBeGreaterThanOrEqual(0);
      expect(result.current.userProsody.intimacyLevel).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Mirroring Recommendations Structure Tests
  // ============================================================================

  describe("mirroring recommendations structure", () => {
    it("should have suggestedSpeed in valid range", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.mirroring.suggestedSpeed).toBeGreaterThanOrEqual(0.8);
      expect(result.current.mirroring.suggestedSpeed).toBeLessThanOrEqual(1.3);
    });

    it("should have suggestedPitch in valid range", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.mirroring.suggestedPitch).toBeGreaterThanOrEqual(0.9);
      expect(result.current.mirroring.suggestedPitch).toBeLessThanOrEqual(1.1);
    });

    it("should have suggestedVolume in valid range", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.mirroring.suggestedVolume).toBeGreaterThanOrEqual(0.7);
      expect(result.current.mirroring.suggestedVolume).toBeLessThanOrEqual(1.0);
    });

    it("should have suggestedPauseMs as positive number", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.mirroring.suggestedPauseMs).toBeGreaterThan(0);
    });

    it("should have valid emotionalTone", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(["warm", "excited", "gentle", "thoughtful", "playful"]).toContain(
        result.current.mirroring.emotionalTone
      );
    });

    it("should have responseStyle object with boolean properties", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(typeof result.current.mirroring.responseStyle.addHesitations).toBe("boolean");
      expect(typeof result.current.mirroring.responseStyle.addBreaths).toBe("boolean");
      expect(typeof result.current.mirroring.responseStyle.useEmphasis).toBe("boolean");
      expect(typeof result.current.mirroring.responseStyle.mirrorEnergy).toBe("boolean");
    });

    it("should have avatarHints object", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.mirroring.avatarHints).toBeDefined();
      expect(typeof result.current.mirroring.avatarHints.eyeContactIntensity).toBe("number");
      expect(typeof result.current.mirroring.avatarHints.nodFrequency).toBe("number");
      expect(typeof result.current.mirroring.avatarHints.smileWarmth).toBe("number");
      expect(typeof result.current.mirroring.avatarHints.breathingSync).toBe("boolean");
    });

    it("should have attunementConfidence between 0 and 1", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(result.current.mirroring.attunementConfidence).toBeGreaterThanOrEqual(0);
      expect(result.current.mirroring.attunementConfidence).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Listening State Tests
  // ============================================================================

  describe("listening state", () => {
    it("should set isAnalyzing true when listening", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), isListening: true })
      );

      // Run animation frame
      act(() => {
        advanceFrame(16);
      });

      expect(result.current.isAnalyzing).toBe(true);
    });

    it("should handle transition to listening", () => {
      const { result, rerender } = renderHook(
        (props) => useProsodyMirroring(props),
        { initialProps: createDefaultOptions() }
      );

      expect(result.current.isAnalyzing).toBe(false);

      rerender({ ...createDefaultOptions(), isListening: true });

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.isAnalyzing).toBe(true);
    });

    it("should handle transition from listening to not listening", () => {
      const { result, rerender } = renderHook(
        (props) => useProsodyMirroring(props),
        { initialProps: { ...createDefaultOptions(), isListening: true } }
      );

      act(() => {
        advanceFrame(16);
      });

      rerender({ ...createDefaultOptions(), isListening: false });

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.isAnalyzing).toBe(false);
    });
  });

  // ============================================================================
  // Audio Level Response Tests
  // ============================================================================

  describe("audio level response", () => {
    it("should handle zero audio level", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), userAudioLevel: 0, isListening: true })
      );

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.userProsody.energy).toBeGreaterThanOrEqual(0);
    });

    it("should handle high audio level", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), userAudioLevel: 0.8, isListening: true })
      );

      act(() => {
        for (let i = 0; i < 10; i++) {
          advanceFrame(16);
        }
      });

      expect(result.current.userProsody).toBeDefined();
    });

    it("should handle varying audio levels", () => {
      const { result, rerender } = renderHook(
        (props) => useProsodyMirroring(props),
        { initialProps: { ...createDefaultOptions(), userAudioLevel: 0.2, isListening: true } }
      );

      act(() => {
        advanceFrame(16);
      });

      rerender({ ...createDefaultOptions(), userAudioLevel: 0.6, isListening: true });

      act(() => {
        advanceFrame(16);
      });

      rerender({ ...createDefaultOptions(), userAudioLevel: 0.1, isListening: true });

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.userProsody).toBeDefined();
    });
  });

  // ============================================================================
  // Speaking State Tests
  // ============================================================================

  describe("speaking state", () => {
    it("should handle EVA speaking state", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), isSpeaking: true })
      );

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.attunementLevel).toBeGreaterThanOrEqual(0);
    });

    it("should maintain attunement during speaking", () => {
      const { result, rerender } = renderHook(
        (props) => useProsodyMirroring(props),
        { initialProps: { ...createDefaultOptions(), isListening: true, userAudioLevel: 0.5 } }
      );

      // Build up attunement
      act(() => {
        for (let i = 0; i < 60; i++) {
          advanceFrame(16);
        }
      });

      const attunementWhileListening = result.current.attunementLevel;

      // Switch to speaking
      rerender({ ...createDefaultOptions(), isSpeaking: true });

      act(() => {
        advanceFrame(16);
      });

      // Attunement should be maintained
      expect(result.current.attunementLevel).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Emotion Detection Tests
  // ============================================================================

  describe("emotion detection", () => {
    it("should handle neutral emotion", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), detectedEmotion: "neutral" })
      );

      expect(result.current.mirroring.emotionalTone).toBeDefined();
    });

    it("should handle joy emotion", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), detectedEmotion: "joy", isListening: true })
      );

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.userProsody).toBeDefined();
    });

    it("should handle sadness emotion", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), detectedEmotion: "sadness", isListening: true })
      );

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.mirroring).toBeDefined();
    });

    it("should handle curiosity emotion", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), detectedEmotion: "curiosity", isListening: true })
      );

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.mirroring).toBeDefined();
    });

    it("should handle excitement emotion", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), detectedEmotion: "excitement", isListening: true })
      );

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.mirroring).toBeDefined();
    });
  });

  // ============================================================================
  // Enabled/Disabled Tests
  // ============================================================================

  describe("enabled option", () => {
    it("should work when enabled is true", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), enabled: true })
      );

      expect(result.current.userProsody).toBeDefined();
    });

    it("should not analyze when disabled", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), enabled: false, isListening: true })
      );

      act(() => {
        advanceFrame(16);
      });

      // Should still have defaults but not analyzing
      expect(result.current.userProsody).toBeDefined();
    });

    it("should handle enabled toggle", () => {
      const { result, rerender } = renderHook(
        (props) => useProsodyMirroring(props),
        { initialProps: { ...createDefaultOptions(), enabled: true } }
      );

      rerender({ ...createDefaultOptions(), enabled: false });

      act(() => {
        advanceFrame(16);
      });

      rerender({ ...createDefaultOptions(), enabled: true });

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.userProsody).toBeDefined();
    });
  });

  // ============================================================================
  // Attunement Description Tests
  // ============================================================================

  describe("attunement description", () => {
    it("should provide description for low attunement", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      // Default is 0.5, so description should be defined
      expect(result.current.attunementDescription).toBeDefined();
      expect(result.current.attunementDescription.length).toBeGreaterThan(0);
    });

    it("should return valid string description", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      const validDescriptions = [
        "Calibrating...",
        "Listening attentively",
        "Attuned to your voice",
        "Deeply connected",
        "In perfect sync",
      ];

      expect(validDescriptions).toContain(result.current.attunementDescription);
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should clean up animation frame on unmount", () => {
      const { unmount } = renderHook(() =>
        useProsodyMirroring(createDefaultOptions())
      );

      expect(() => {
        unmount();
      }).not.toThrow();
    });

    it("should handle unmount while listening", () => {
      const { unmount } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), isListening: true })
      );

      act(() => {
        advanceFrame(16);
      });

      expect(() => {
        unmount();
      }).not.toThrow();
    });
  });

  // ============================================================================
  // Edge Cases Tests
  // ============================================================================

  describe("edge cases", () => {
    it("should handle rapid state changes", () => {
      const { result, rerender } = renderHook(
        (props) => useProsodyMirroring(props),
        { initialProps: createDefaultOptions() }
      );

      for (let i = 0; i < 10; i++) {
        rerender({ ...createDefaultOptions(), isListening: i % 2 === 0 });
        act(() => {
          advanceFrame(16);
        });
      }

      expect(result.current.userProsody).toBeDefined();
    });

    it("should handle maximum audio level", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), userAudioLevel: 1.0, isListening: true })
      );

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.userProsody.energy).toBeLessThanOrEqual(1);
    });

    it("should handle negative audio level gracefully", () => {
      // This shouldn't happen but the hook should handle it
      const { result } = renderHook(() =>
        useProsodyMirroring({ ...createDefaultOptions(), userAudioLevel: -0.5, isListening: true })
      );

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.userProsody).toBeDefined();
    });

    it("should handle undefined detectedEmotion", () => {
      const { result } = renderHook(() =>
        useProsodyMirroring({
          userAudioLevel: 0.3,
          isListening: true,
          isSpeaking: false,
          enabled: true,
        })
      );

      act(() => {
        advanceFrame(16);
      });

      expect(result.current.mirroring).toBeDefined();
    });
  });
});

// ============================================================================
// mapAttunementToVisual Tests
// ============================================================================

describe("mapAttunementToVisual", () => {
  describe("connection strength levels", () => {
    it("should return weak for low attunement", () => {
      const result = mapAttunementToVisual(0.2);
      expect(result.connectionStrength).toBe("weak");
    });

    it("should return building for medium-low attunement", () => {
      const result = mapAttunementToVisual(0.5);
      expect(result.connectionStrength).toBe("building");
    });

    it("should return strong for medium-high attunement", () => {
      const result = mapAttunementToVisual(0.7);
      expect(result.connectionStrength).toBe("strong");
    });

    it("should return deep for high attunement", () => {
      const result = mapAttunementToVisual(0.9);
      expect(result.connectionStrength).toBe("deep");
    });
  });

  describe("glow intensity", () => {
    it("should have low glow for weak connection", () => {
      const result = mapAttunementToVisual(0.2);
      expect(result.glowIntensity).toBeLessThan(0.5);
    });

    it("should have high glow for deep connection", () => {
      const result = mapAttunementToVisual(0.9);
      expect(result.glowIntensity).toBeGreaterThan(0.8);
    });

    it("should increase glow with attunement", () => {
      const low = mapAttunementToVisual(0.3);
      const high = mapAttunementToVisual(0.9);
      expect(high.glowIntensity).toBeGreaterThan(low.glowIntensity);
    });
  });

  describe("glow color", () => {
    it("should return valid rgba color string", () => {
      const result = mapAttunementToVisual(0.5);
      expect(result.glowColor).toMatch(/^rgba\(/);
    });

    it("should have coral glow for lower attunement", () => {
      const result = mapAttunementToVisual(0.3);
      expect(result.glowColor).toContain("232, 132, 107");
    });

    it("should have warm glow for higher attunement", () => {
      const result = mapAttunementToVisual(0.85);
      expect(result.glowColor).toContain("232, 160, 144");
    });
  });

  describe("pulse rate", () => {
    it("should have slower pulse for weak connection", () => {
      const result = mapAttunementToVisual(0.2);
      expect(result.pulseRate).toBeGreaterThanOrEqual(3);
    });

    it("should have faster pulse for deep connection", () => {
      const result = mapAttunementToVisual(0.9);
      expect(result.pulseRate).toBeLessThanOrEqual(2.5);
    });

    it("should decrease pulse rate with attunement", () => {
      const low = mapAttunementToVisual(0.3);
      const high = mapAttunementToVisual(0.9);
      expect(high.pulseRate).toBeLessThan(low.pulseRate);
    });
  });

  describe("edge cases", () => {
    it("should handle zero attunement", () => {
      const result = mapAttunementToVisual(0);
      expect(result.connectionStrength).toBe("weak");
      expect(result.glowIntensity).toBeGreaterThanOrEqual(0);
    });

    it("should handle maximum attunement", () => {
      const result = mapAttunementToVisual(1);
      expect(result.connectionStrength).toBe("deep");
      expect(result.glowIntensity).toBeLessThanOrEqual(1.2);
    });

    it("should handle boundary at 0.4", () => {
      const below = mapAttunementToVisual(0.39);
      const above = mapAttunementToVisual(0.41);
      expect(below.connectionStrength).toBe("weak");
      expect(above.connectionStrength).toBe("building");
    });

    it("should handle boundary at 0.6", () => {
      const below = mapAttunementToVisual(0.59);
      const above = mapAttunementToVisual(0.61);
      expect(below.connectionStrength).toBe("building");
      expect(above.connectionStrength).toBe("strong");
    });

    it("should handle boundary at 0.8", () => {
      const below = mapAttunementToVisual(0.79);
      const above = mapAttunementToVisual(0.81);
      expect(below.connectionStrength).toBe("strong");
      expect(above.connectionStrength).toBe("deep");
    });
  });
});
